/**
 * Importador y migrador del respaldo v4 ('bitacora-estudio-v4') a AUREON.
 * Valida la entrada con Zod, reconcilia `sessions` con `log` ("sin detalle"),
 * mapea las 17 causas del v4 a las 5 categorías nuevas y genera un reporte visible.
 */
import { z } from 'zod';
import {
  capacidadSecciones,
  CARRERAS,
  CICLO_POR_DEFECTO,
  CURSO_IDS,
  CURSOS,
  diaAbsoluto,
  esFechaISO,
  redondear3,
  TEMARIO,
  TIPOS_EVAL,
  type CursoId,
  type TipoEval,
} from '../domain';
import { db as defaultDb, type AureonDB } from './db';
import {
  aureonPayloadSchema,
  SETTINGS_POR_DEFECTO,
  type AureonDataPayload,
  type CategoriaError,
  type CursoOMixId,
  type EstadoMistake,
  type EstadoTema,
  type FocusSession,
  type Mistake,
  type Practice,
  type Settings,
  type Simulacro,
  type TopicProgress,
} from './schema';

export const V4_STORAGE_KEY = 'bitacora-estudio-v4' as const;

// ---------------------------------------------------------------------------
// 1. Mapeo oficial de las 17 causas del v4 a las 5 categorías de AUREON
// ---------------------------------------------------------------------------

export const CAUSAS_V4_A_CATEGORIA: Readonly<Record<string, CategoriaError | null>> = {
  // teoria (cognitivo)
  Concepto: 'teoria',
  'No estudié el tema': 'teoria',
  'Memoria pura': 'teoria',
  'Olvido de fórmula': 'teoria',
  'No entendí': 'teoria',
  // lectura (procedimental)
  'Leer texto primero': 'lectura',
  'Omitir restricciones lógicas': 'lectura',
  Distracción: 'lectura',
  'Caer en distractoras': 'lectura',
  // calculo (procedimental)
  Cálculo: 'calculo',
  'Mala resolución': 'calculo',
  // tiempo (procedimental)
  Prisa: 'tiempo',
  'Estuve apurado': 'tiempo',
  'Obstinación y mal uso del tiempo': 'tiempo',
  // duda (mixto)
  'Cambiar respuestas por inseguridad': 'duda',
  'Trampa DECO': 'duda',
  // Otro -> sin categoría (por clasificar)
  Otro: null,
};

function normalizarClaveTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

const MAPA_CAUSAS_NORMALIZADO = new Map<string, CategoriaError | null>(
  Object.entries(CAUSAS_V4_A_CATEGORIA).map(([k, v]) => [normalizarClaveTexto(k), v]),
);

/**
 * Convierte cualquiera de las 17 etiquetas `FAIL_TAGS` del v4 a una de las 5 categorías
 * nuevas (`teoria` | `lectura` | `calculo` | `tiempo` | `duda`) o `null` ("por clasificar").
 */
export function mapearCausaV4(tag: string | null | undefined): CategoriaError | null {
  if (!tag) return null;
  const exacta = CAUSAS_V4_A_CATEGORIA[tag];
  if (exacta !== undefined) return exacta;
  return MAPA_CAUSAS_NORMALIZADO.get(normalizarClaveTexto(tag)) ?? null;
}

// ---------------------------------------------------------------------------
// 2. Resolución de cursos y temas del v4 a ids estables de AUREON
// ---------------------------------------------------------------------------

const ORDEN_V4_A_CURSO_ID = new Map<string, CursoId>(CURSOS.map((c) => [`c${c.orden}`, c.id]));

const NOMBRE_NORMALIZADO_A_CURSO_ID = new Map<string, CursoId>(
  CURSOS.map((c) => [normalizarClaveTexto(c.nombre), c.id]),
);

export function resolverCursoV4(
  rawId: string | null | undefined,
  mapaCursosBackup?: ReadonlyMap<string, string>,
): CursoOMixId | null {
  if (!rawId) return null;
  const limpio = rawId.trim();
  if (!limpio) return null;
  if (limpio.toUpperCase() === 'MIX') return 'mix';

  // Si ya es un CursoId nuevo ('hv', 'quim', ...)
  if ((CURSO_IDS as readonly string[]).includes(limpio)) {
    return limpio as CursoId;
  }

  // Si el backup trae la lista `courses`, priorizar su nombre real
  const nombreEnBackup = mapaCursosBackup?.get(limpio);
  if (nombreEnBackup) {
    if (nombreEnBackup.toUpperCase().startsWith('MIX')) return 'mix';
    const porNombre = NOMBRE_NORMALIZADO_A_CURSO_ID.get(normalizarClaveTexto(nombreEnBackup));
    if (porNombre) return porNombre;
  }

  // Por id posicional del seed() del v4 ('c1'..'c19')
  const porCodigo = ORDEN_V4_A_CURSO_ID.get(limpio.toLowerCase());
  if (porCodigo) return porCodigo;

  // Por nombre directo
  const porNombreDirecto = NOMBRE_NORMALIZADO_A_CURSO_ID.get(normalizarClaveTexto(limpio));
  return porNombreDirecto ?? null;
}

/**
 * Resuelve el texto de un tema del v4 (ej. "S3 · Enlace químico") al `temaId` estable
 * de `temario.json` (ej. "quim-s03-enlace-quimico"). Si es "General" o vacío devuelve `null`.
 */
export function resolverTemaV4(
  cursoId: CursoOMixId,
  rawTopic: string | null | undefined,
): string | null {
  if (cursoId === 'mix' || !rawTopic) return null;
  const limpio = rawTopic.trim();
  if (!limpio || normalizarClaveTexto(limpio) === 'general' || limpio === '— Múltiples —') {
    return null;
  }

  const temasCurso = TEMARIO.filter((t) => t.cursoId === cursoId);

  // 1) Si ya es un id estable del curso
  const directo = temasCurso.find((t) => t.id === limpio);
  if (directo) return directo.id;

  // 2) Prefijo "S# · Título" del legacy
  const matchSemana = /^S(\d+)\s*[·.-]?\s*(.*)$/i.exec(limpio);
  if (matchSemana) {
    const semana = Number(matchSemana[1]);
    const restoTitulo = normalizarClaveTexto(matchSemana[2] ?? '');
    const candidatosSemana = temasCurso.filter((t) => t.semana === semana);
    if (candidatosSemana.length === 1 && candidatosSemana[0]) {
      return candidatosSemana[0].id;
    }
    const porTituloExacto = candidatosSemana.find(
      (t) => normalizarClaveTexto(t.titulo) === restoTitulo,
    );
    if (porTituloExacto) return porTituloExacto.id;
  }

  // 3) Coincidencia por título normalizado
  const norm = normalizarClaveTexto(limpio);
  const porTitulo = temasCurso.find((t) => normalizarClaveTexto(t.titulo) === norm);
  return porTitulo ? porTitulo.id : null;
}

export function resolverCarreraV4(nombreCarrera: string | null | undefined): string {
  if (!nombreCarrera) return SETTINGS_POR_DEFECTO.carreraId;
  const norm = normalizarClaveTexto(nombreCarrera);
  const encontrada = CARRERAS.find((c) => c.id === norm || normalizarClaveTexto(c.nombre) === norm);
  return encontrada ? encontrada.id : SETTINGS_POR_DEFECTO.carreraId;
}

function mapearEstadoTemaV4(st: string | null | undefined): EstadoTema | null {
  switch (st) {
    case 'pending':
    case 'pendiente':
      return 'pendiente';
    case 'worked':
    case 'trabajado':
      return 'trabajado';
    case 'prog':
    case 'progreso':
      return 'progreso';
    case 'done':
    case 'dominado':
      return 'dominado';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 3. Esquema Zod tolerante para el respaldo v4
// ---------------------------------------------------------------------------

const v4LogCellSchema = z
  .object({
    q: z.number().optional(),
    ok: z.number().optional(),
    bad: z.number().optional(),
  })
  .passthrough();

export const v4BackupSchema = z
  .object({
    profile: z
      .object({
        name: z.string().optional(),
        career: z.string().optional(),
        area: z.string().optional(),
        msg: z.string().optional(),
      })
      .passthrough()
      .optional(),
    config: z
      .object({
        examDate: z.string().optional(),
        targetScore: z.number().nullable().optional(),
        admMaxScore: z.number().nullable().optional(),
        baselineScore: z.number().nullable().optional(),
        cepreStart: z.string().optional(),
        currentCepreWeek: z.number().optional(),
        evalDates: z
          .object({
            e1: z.string().optional(),
            e2: z.string().optional(),
            e3: z.string().optional(),
            e4: z.string().optional(),
          })
          .partial()
          .optional(),
      })
      .passthrough()
      .optional(),
    courses: z.array(z.unknown()).optional(),
    sessions: z.array(z.unknown()).optional(),
    log: z.record(z.string(), z.record(z.string(), v4LogCellSchema)).optional(),
    errors: z.array(z.unknown()).optional(),
    simulacros: z.array(z.unknown()).optional(),
    topicStatus: z.record(z.string(), z.string()).optional(),
    hours: z.record(z.string(), z.unknown()).optional(),
    hourGoal: z.number().optional(),
    weeklyQuestionTarget: z.number().optional(),
    dark: z.boolean().optional(),
  })
  .passthrough();

export type V4BackupRaw = z.infer<typeof v4BackupSchema>;

// ---------------------------------------------------------------------------
// 4. Reporte visible de importación
// ---------------------------------------------------------------------------

export interface DescarteImportacion {
  origen: 'sessions' | 'log' | 'errors' | 'simulacros' | 'topicStatus' | 'hours' | 'legacy_ui';
  referencia: string;
  motivo: string;
}

export interface ReporteImportacionV4 {
  importados: {
    practicesDeSesiones: number;
    practicesSinDetalleDeLog: number;
    preguntasTotales: number;
    preguntasSinDetalle: number;
    mistakes: number;
    erroresAbiertos: number;
    erroresEnRepaso: number;
    erroresDominados: number;
    erroresPorClasificar: number;
    simulacros: number;
    topicProgress: number;
    focusSessionsManuales: number;
    minutosTotalesEnfoque: number;
  };
  descartados: DescarteImportacion[];
}

export interface ResultadoMigracionV4 {
  datos: AureonDataPayload;
  reporte: ReporteImportacionV4;
}

function fechaOTimestampAFecha(fechaStr: unknown, ts: number): string | null {
  if (typeof fechaStr === 'string' && esFechaISO(fechaStr)) return fechaStr;
  if (Number.isFinite(ts) && ts > 0) {
    const iso = new Date(ts).toISOString().slice(0, 10);
    if (esFechaISO(iso)) return iso;
  }
  return null;
}

function timestampDeFecha(fecha: string, offsetMs = 0): number {
  // Mediodía UTC del día indicado (07:00 America/Lima) + offset determinista
  return diaAbsoluto(fecha) * 86_400_000 + 12 * 3_600_000 + offsetMs;
}

/**
 * Desenvuelve el JSON del respaldo v4: acepta tanto el objeto raíz directo como
 * `{ "bitacora-estudio-v4": ... }` (volcado directo de `localStorage`).
 */
export function desenvolverJsonV4(entrada: unknown): V4BackupRaw {
  let candidato: unknown = entrada;
  if (typeof candidato === 'string') {
    candidato = JSON.parse(candidato) as unknown;
  }
  if (
    candidato !== null &&
    typeof candidato === 'object' &&
    V4_STORAGE_KEY in (candidato as Record<string, unknown>)
  ) {
    const interno = (candidato as Record<string, unknown>)[V4_STORAGE_KEY];
    candidato = typeof interno === 'string' ? (JSON.parse(interno) as unknown) : interno;
  }
  return v4BackupSchema.parse(candidato);
}

/**
 * Transforma un respaldo v4 validado en el payload de eventos de AUREON + reporte de importación.
 * Es una función pura: no escribe en IndexedDB.
 */
export function transformarRespaldoV4(entrada: unknown, ahora = Date.now()): ResultadoMigracionV4 {
  const raw = desenvolverJsonV4(entrada);
  const descartados: DescarteImportacion[] = [];

  // Mapa de cursos del propio respaldo (ej. c1 -> "Habilidad Verbal")
  const mapaCursosBackup = new Map<string, string>();
  const metasCursoSemana: Partial<Record<CursoId, number>> = {};

  for (const item of raw.courses ?? []) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const id = typeof obj.id === 'string' ? obj.id : '';
      const name = typeof obj.name === 'string' ? obj.name : '';
      if (id && name) mapaCursosBackup.set(id, name);
      const resuelto = resolverCursoV4(id, mapaCursosBackup);
      const goal =
        typeof obj.goal === 'number' && Number.isFinite(obj.goal) ? Math.trunc(obj.goal) : 0;
      if (resuelto && resuelto !== 'mix' && goal > 0) {
        metasCursoSemana[resuelto] = goal;
      }
    }
  }

  // -------------------------------------------------------------------------
  // A. sessions -> Practice (la verdad)
  // -------------------------------------------------------------------------
  const practices: Practice[] = [];
  const idsPracticeUsados = new Set<string>();
  const sumaSesionesPorCelda = new Map<string, number>();
  let practicesDeSesiones = 0;

  (raw.sessions ?? []).forEach((item, idx) => {
    if (!item || typeof item !== 'object') {
      descartados.push({
        origen: 'sessions',
        referencia: `sessions[${idx}]`,
        motivo: 'Registro de sesión no es un objeto válido',
      });
      return;
    }
    const s = item as Record<string, unknown>;
    const cursoId = resolverCursoV4(
      typeof s.courseId === 'string' ? s.courseId : null,
      mapaCursosBackup,
    );
    if (!cursoId) {
      descartados.push({
        origen: 'sessions',
        referencia: `sessions[${idx}] (${String(s.courseId ?? '')})`,
        motivo: 'Curso desconocido',
      });
      return;
    }

    const ok =
      typeof s.ok === 'number' && Number.isFinite(s.ok) ? Math.max(0, Math.trunc(s.ok)) : 0;
    const bad =
      typeof s.bad === 'number' && Number.isFinite(s.bad) ? Math.max(0, Math.trunc(s.bad)) : 0;
    const total = ok + bad;
    if (total <= 0) {
      descartados.push({
        origen: 'sessions',
        referencia: `sessions[${idx}]`,
        motivo: 'Sesión con 0 preguntas (ok + bad = 0)',
      });
      return;
    }

    const tsRaw =
      typeof s.ts === 'number' && Number.isFinite(s.ts) && s.ts > 0 ? Math.trunc(s.ts) : 0;
    const fecha = fechaOTimestampAFecha(s.date, tsRaw);
    if (!fecha) {
      descartados.push({
        origen: 'sessions',
        referencia: `sessions[${idx}]`,
        motivo: `Fecha inválida (${String(s.date ?? '')})`,
      });
      return;
    }

    const ts = tsRaw > 0 ? tsRaw : timestampDeFecha(fecha, idx);
    const rawTopic = typeof s.topic === 'string' ? s.topic : null;
    const temaId = resolverTemaV4(cursoId, rawTopic);

    const baseId = typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `v4-sess-${idx + 1}`;
    const id = idsPracticeUsados.has(baseId) ? `${baseId}-${idx + 1}` : baseId;
    idsPracticeUsados.add(id);

    practices.push({
      id,
      ts,
      fecha,
      cursoId,
      temaId,
      ok,
      bad,
      origen: 'tanda',
    });
    practicesDeSesiones++;

    // Acumular por (fecha, cursoId) para reconciliar con `state.log`
    const claveCelda = `${fecha}|${cursoId}`;
    sumaSesionesPorCelda.set(claveCelda, (sumaSesionesPorCelda.get(claveCelda) ?? 0) + total);
  });

  // -------------------------------------------------------------------------
  // B. Reconciliación con `state.log`: preguntas editadas a mano sin sesión
  // -------------------------------------------------------------------------
  const sumaLogPorCelda = new Map<string, { fecha: string; cursoId: CursoOMixId; q: number }>();

  for (const [fechaKey, cursosObj] of Object.entries(raw.log ?? {})) {
    if (!esFechaISO(fechaKey)) {
      descartados.push({
        origen: 'log',
        referencia: `log[${fechaKey}]`,
        motivo: 'Fecha de log inválida',
      });
      continue;
    }
    if (!cursosObj || typeof cursosObj !== 'object') continue;
    for (const [rawCid, celda] of Object.entries(cursosObj)) {
      const cursoId = resolverCursoV4(rawCid, mapaCursosBackup);
      const q =
        celda && typeof celda.q === 'number' && Number.isFinite(celda.q)
          ? Math.max(0, Math.trunc(celda.q))
          : 0;
      if (q <= 0) continue;
      if (!cursoId) {
        descartados.push({
          origen: 'log',
          referencia: `log[${fechaKey}][${rawCid}]`,
          motivo: `Curso desconocido con ${q} pregunta(s)`,
        });
        continue;
      }
      const claveCelda = `${fechaKey}|${cursoId}`;
      const previo = sumaLogPorCelda.get(claveCelda);
      sumaLogPorCelda.set(claveCelda, {
        fecha: fechaKey,
        cursoId,
        q: (previo?.q ?? 0) + q,
      });
    }
  }

  let practicesSinDetalleDeLog = 0;
  let preguntasSinDetalle = 0;

  for (const [claveCelda, info] of sumaLogPorCelda.entries()) {
    const enSesiones = sumaSesionesPorCelda.get(claveCelda) ?? 0;
    const diferencia = info.q - enSesiones;
    if (diferencia > 0) {
      const id = `v4-log-${info.fecha}-${info.cursoId}`;
      practices.push({
        id,
        ts: timestampDeFecha(info.fecha, 900),
        fecha: info.fecha,
        cursoId: info.cursoId,
        temaId: null,
        ok: 0,
        bad: 0,
        origen: 'tanda',
        sinDetalle: true,
        totalSinDetalle: diferencia,
      });
      practicesSinDetalleDeLog++;
      preguntasSinDetalle += diferencia;
    }
  }

  // -------------------------------------------------------------------------
  // C. errors -> Mistake (conserva caja y próximo repaso + mapea las 17 causas)
  // -------------------------------------------------------------------------
  const mistakes: Mistake[] = [];
  const idsMistakeUsados = new Set<string>();

  (raw.errors ?? []).forEach((item, idx) => {
    if (!item || typeof item !== 'object') {
      descartados.push({
        origen: 'errors',
        referencia: `errors[${idx}]`,
        motivo: 'Error inválido',
      });
      return;
    }
    const e = item as Record<string, unknown>;
    const cursoId = resolverCursoV4(
      typeof e.courseId === 'string' ? e.courseId : null,
      mapaCursosBackup,
    );
    if (!cursoId) {
      descartados.push({
        origen: 'errors',
        referencia: `errors[${idx}] (${String(e.courseId ?? '')})`,
        motivo: 'Curso desconocido en cuaderno de errores',
      });
      return;
    }

    const tsRaw =
      typeof e.ts === 'number' && Number.isFinite(e.ts) && e.ts > 0 ? Math.trunc(e.ts) : 0;
    const fecha = fechaOTimestampAFecha(e.date, tsRaw) ?? CICLO_POR_DEFECTO.inicio;
    const creadoEn = tsRaw > 0 ? tsRaw : timestampDeFecha(fecha, idx);

    const rawTopic = typeof e.topic === 'string' ? e.topic : null;
    const temaId = resolverTemaV4(cursoId, rawTopic);

    const rawTag = typeof e.tag === 'string' ? e.tag : null;
    const categoria = mapearCausaV4(rawTag);

    const boxRaw =
      typeof e.box === 'number' && Number.isFinite(e.box)
        ? Math.max(0, Math.min(7, Math.trunc(e.box)))
        : 0;
    const statusRaw = typeof e.status === 'string' ? e.status : 'abierto';

    let estado: EstadoMistake;
    let caja: number;
    if (statusRaw === 'abierto') {
      estado = 'abierto';
      caja = 0;
    } else if (boxRaw >= 7 || statusRaw === 'dominado') {
      estado = 'dominado';
      caja = 7;
    } else {
      estado = 'repaso';
      caja = boxRaw >= 1 ? boxRaw : 1;
    }

    const nextRevRaw = typeof e.nextReview === 'string' ? e.nextReview : null;
    const proximoRepaso =
      estado === 'repaso' && nextRevRaw && esFechaISO(nextRevRaw) ? nextRevRaw : null;

    const baseId = typeof e.id === 'string' && e.id.trim() ? e.id.trim() : `v4-err-${idx + 1}`;
    const id = idsMistakeUsados.has(baseId) ? `${baseId}-${idx + 1}` : baseId;
    idsMistakeUsados.add(id);

    const nota = typeof e.desc === 'string' ? e.desc.trim() : '';

    mistakes.push({
      id,
      origen: 'tanda',
      simulacroId: null,
      cursoId,
      temaId,
      categoria,
      nota,
      fotoId: null,
      creadoEn,
      fecha,
      estado,
      caja,
      proximoRepaso,
      historial: [],
      ...(rawTag ? { causaLegacy: rawTag } : {}),
    });
  });

  // -------------------------------------------------------------------------
  // D. simulacros -> Simulacro (porCurso vacío y revisado: true)
  // -------------------------------------------------------------------------
  const simulacros: Simulacro[] = [];
  const idsSimUsados = new Set<string>();

  (raw.simulacros ?? []).forEach((item, idx) => {
    if (!item || typeof item !== 'object') {
      descartados.push({
        origen: 'simulacros',
        referencia: `simulacros[${idx}]`,
        motivo: 'Simulacro inválido',
      });
      return;
    }
    const s = item as Record<string, unknown>;
    const rawType = typeof s.simType === 'string' ? s.simType : 'cepre1';
    if (!(TIPOS_EVAL as readonly string[]).includes(rawType)) {
      descartados.push({
        origen: 'simulacros',
        referencia: `simulacros[${idx}] (${rawType})`,
        motivo: 'Tipo de simulacro desconocido',
      });
      return;
    }
    const tipo = rawType as TipoEval;

    const scoreObj =
      s.score && typeof s.score === 'object' ? (s.score as Record<string, unknown>) : null;
    if (!scoreObj || typeof scoreObj.total !== 'number' || !Number.isFinite(scoreObj.total)) {
      descartados.push({
        origen: 'simulacros',
        referencia: `simulacros[${idx}]`,
        motivo: 'Simulacro sin puntaje total válido',
      });
      return;
    }

    const tsRaw =
      typeof s.ts === 'number' && Number.isFinite(s.ts) && s.ts > 0 ? Math.trunc(s.ts) : 0;
    const fecha = fechaOTimestampAFecha(s.date, tsRaw);
    if (!fecha) {
      descartados.push({
        origen: 'simulacros',
        referencia: `simulacros[${idx}]`,
        motivo: `Fecha de simulacro inválida (${String(s.date ?? '')})`,
      });
      return;
    }

    const cap = capacidadSecciones(tipo);
    const habRaw = s.hab && typeof s.hab === 'object' ? (s.hab as Record<string, unknown>) : {};
    const conRaw =
      s.conoc && typeof s.conoc === 'object' ? (s.conoc as Record<string, unknown>) : {};
    const actRaw = s.act && typeof s.act === 'object' ? (s.act as Record<string, unknown>) : {};

    const extraerSeccion = (
      sec: Record<string, unknown>,
      capacidad: number,
    ): { ok: number; bad: number; blanco: number } => {
      const ok =
        typeof sec.ok === 'number' && Number.isFinite(sec.ok)
          ? Math.max(0, Math.min(capacidad, Math.trunc(sec.ok)))
          : 0;
      const bad =
        typeof sec.bad === 'number' && Number.isFinite(sec.bad)
          ? Math.max(0, Math.min(capacidad - ok, Math.trunc(sec.bad)))
          : 0;
      const blanco = Math.max(0, capacidad - ok - bad);
      return { ok, bad, blanco };
    };

    const cursosFlojos: CursoId[] = [];
    if (Array.isArray(s.badCourses)) {
      for (const rawC of s.badCourses) {
        if (typeof rawC === 'string') {
          const cid = resolverCursoV4(rawC, mapaCursosBackup);
          if (cid && cid !== 'mix' && !cursosFlojos.includes(cid)) {
            cursosFlojos.push(cid);
          }
        }
      }
    }

    const baseId = typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `v4-sim-${idx + 1}`;
    const id = idsSimUsados.has(baseId) ? `${baseId}-${idx + 1}` : baseId;
    idsSimUsados.add(id);

    simulacros.push({
      id,
      fecha,
      ts: tsRaw > 0 ? tsRaw : timestampDeFecha(fecha, idx),
      tipo,
      porCurso: {},
      secciones: {
        act: extraerSeccion(actRaw, cap.act),
        hab: extraerSeccion(habRaw, cap.hab),
        conoc: extraerSeccion(conRaw, cap.conoc),
      },
      total: redondear3(scoreObj.total),
      revisado: true,
      ...(cursosFlojos.length > 0 ? { cursosFlojos } : {}),
    });
  });

  // -------------------------------------------------------------------------
  // E. topicStatus -> TopicProgress (más derivación de temas trabajados en sesiones)
  // -------------------------------------------------------------------------
  const mapaProgresoTema = new Map<string, TopicProgress>();

  // En el v4, tener una sesión con ese tema hacía que `getTopicState` devolviera 'worked'
  for (const p of practices) {
    if (p.cursoId !== 'mix' && p.temaId !== null) {
      const clave = `${p.cursoId}|${p.temaId}`;
      const existente = mapaProgresoTema.get(clave);
      if (!existente || p.ts > existente.actualizadoEn) {
        mapaProgresoTema.set(clave, {
          cursoId: p.cursoId,
          temaId: p.temaId,
          estado: 'trabajado',
          actualizadoEn: p.ts,
        });
      }
    }
  }

  for (const [claveRaw, valorEstado] of Object.entries(raw.topicStatus ?? {})) {
    const sepIdx = claveRaw.indexOf('|');
    if (sepIdx <= 0) {
      descartados.push({
        origen: 'topicStatus',
        referencia: claveRaw,
        motivo: 'Formato de clave inválido (se esperaba cid|tema)',
      });
      continue;
    }
    const rawCid = claveRaw.slice(0, sepIdx);
    const rawTopic = claveRaw.slice(sepIdx + 1);
    const cursoId = resolverCursoV4(rawCid, mapaCursosBackup);
    if (!cursoId || cursoId === 'mix') {
      descartados.push({
        origen: 'topicStatus',
        referencia: claveRaw,
        motivo: 'Curso inválido en topicStatus',
      });
      continue;
    }
    const temaId = resolverTemaV4(cursoId, rawTopic);
    if (!temaId) {
      descartados.push({
        origen: 'topicStatus',
        referencia: claveRaw,
        motivo: 'Tema no reconocido en el temario oficial',
      });
      continue;
    }
    const estado = mapearEstadoTemaV4(valorEstado);
    if (!estado) {
      descartados.push({
        origen: 'topicStatus',
        referencia: `${claveRaw}=${valorEstado}`,
        motivo: 'Estado de tema desconocido',
      });
      continue;
    }
    mapaProgresoTema.set(`${cursoId}|${temaId}`, {
      cursoId,
      temaId,
      estado,
      actualizadoEn: ahora,
    });
  }

  const topicProgress = Array.from(mapaProgresoTema.values());

  // -------------------------------------------------------------------------
  // F. hours -> FocusSession con modo 'manual'
  // -------------------------------------------------------------------------
  const focusSessions: FocusSession[] = [];
  let minutosTotalesEnfoque = 0;

  for (const [fechaKey, rawMin] of Object.entries(raw.hours ?? {})) {
    if (!esFechaISO(fechaKey)) {
      descartados.push({
        origen: 'hours',
        referencia: `hours[${fechaKey}]`,
        motivo: 'Fecha inválida en registro de horas',
      });
      continue;
    }
    const minutos = typeof rawMin === 'number' && Number.isFinite(rawMin) ? Math.trunc(rawMin) : 0;
    if (minutos <= 0) {
      if (rawMin !== 0) {
        descartados.push({
          origen: 'hours',
          referencia: `hours[${fechaKey}]`,
          motivo: `Minutos no positivos (${String(rawMin)})`,
        });
      }
      continue;
    }
    const inicio = timestampDeFecha(fechaKey, 0);
    const fin = inicio + minutos * 60_000;
    focusSessions.push({
      id: `v4-hours-${fechaKey}`,
      inicio,
      fin,
      fecha: fechaKey,
      modo: 'manual',
      cursoId: 'mix',
      tipoTarea: 'practica_deco',
      minutosEnfoque: minutos,
      fatiga: null,
      distracciones: 0,
      completa: true,
    });
    minutosTotalesEnfoque += minutos;
  }

  // -------------------------------------------------------------------------
  // G. Registro explícito de claves efímeras de UI / legacy descartadas
  // -------------------------------------------------------------------------
  const clavesIgnoradas = ['ui', 'pomo', 'examTimer', 'texts', 'pomos'] as const;
  const rawRecord = raw as Record<string, unknown>;
  for (const k of clavesIgnoradas) {
    if (k in rawRecord && rawRecord[k] !== undefined) {
      descartados.push({
        origen: 'legacy_ui',
        referencia: k,
        motivo: 'Estado efímero del v4 no requerido en el modelo de eventos',
      });
    }
  }

  // -------------------------------------------------------------------------
  // H. Settings
  // -------------------------------------------------------------------------
  const carreraId = resolverCarreraV4(raw.profile?.career);
  const careerObj = CARRERAS.find((c) => c.id === carreraId);
  const corteOficialCarrera = careerObj?.cepreLast?.[4] ?? null;
  const baselineV4 = raw.config?.baselineScore;
  const metaPersonal =
    typeof baselineV4 === 'number' &&
    Number.isFinite(baselineV4) &&
    baselineV4 > 0 &&
    baselineV4 <= 2000 &&
    baselineV4 !== corteOficialCarrera
      ? redondear3(baselineV4)
      : null;

  const ed = raw.config?.evalDates;
  const fechasEval = {
    cepre1: ed?.e1 && esFechaISO(ed.e1) ? ed.e1 : CICLO_POR_DEFECTO.fechasEval.cepre1,
    cepre2: ed?.e2 && esFechaISO(ed.e2) ? ed.e2 : CICLO_POR_DEFECTO.fechasEval.cepre2,
    cepre3: ed?.e3 && esFechaISO(ed.e3) ? ed.e3 : CICLO_POR_DEFECTO.fechasEval.cepre3,
    cepre4: ed?.e4 && esFechaISO(ed.e4) ? ed.e4 : CICLO_POR_DEFECTO.fechasEval.cepre4,
  };

  const inicioCiclo =
    raw.config?.cepreStart && esFechaISO(raw.config.cepreStart)
      ? raw.config.cepreStart
      : CICLO_POR_DEFECTO.inicio;

  const nombre =
    raw.profile?.name && raw.profile.name.trim().length > 0
      ? raw.profile.name.trim()
      : SETTINGS_POR_DEFECTO.nombre;

  const metaHorasSemana =
    typeof raw.hourGoal === 'number' && raw.hourGoal >= 1 && raw.hourGoal <= 120
      ? Math.trunc(raw.hourGoal)
      : SETTINGS_POR_DEFECTO.metaHorasSemana;

  const metaPreguntasSemana =
    typeof raw.weeklyQuestionTarget === 'number' &&
    raw.weeklyQuestionTarget >= 1 &&
    raw.weeklyQuestionTarget <= 5000
      ? Math.trunc(raw.weeklyQuestionTarget)
      : SETTINGS_POR_DEFECTO.metaPreguntasSemana;

  const settings: Settings = {
    id: 'default',
    nombre,
    carreraId,
    metaPersonal,
    umbralSeguridad: SETTINGS_POR_DEFECTO.umbralSeguridad,
    inicioCiclo,
    fechasEval,
    metaHorasSemana,
    metaPreguntasSemana,
    metasCursoSemana,
    tema: raw.dark ? 'dark-modern' : 'clinico',
    ultimoCursoId: practices[practices.length - 1]?.cursoId ?? null,
    actualizadoEn: ahora,
  };

  const datos = aureonPayloadSchema.parse({
    practices,
    mistakes,
    focusSessions,
    topicProgress,
    simulacros,
    settings,
  });

  const preguntasTotales = practices.reduce(
    (s, p) => s + (p.sinDetalle ? (p.totalSinDetalle ?? 0) : p.ok + p.bad),
    0,
  );
  const erroresAbiertos = mistakes.filter((m) => m.estado === 'abierto').length;
  const erroresEnRepaso = mistakes.filter((m) => m.estado === 'repaso').length;
  const erroresDominados = mistakes.filter((m) => m.estado === 'dominado').length;
  const erroresPorClasificar = mistakes.filter((m) => m.categoria === null).length;

  return {
    datos,
    reporte: {
      importados: {
        practicesDeSesiones,
        practicesSinDetalleDeLog,
        preguntasTotales,
        preguntasSinDetalle,
        mistakes: mistakes.length,
        erroresAbiertos,
        erroresEnRepaso,
        erroresDominados,
        erroresPorClasificar,
        simulacros: simulacros.length,
        topicProgress: topicProgress.length,
        focusSessionsManuales: focusSessions.length,
        minutosTotalesEnfoque,
      },
      descartados,
    },
  };
}

/**
 * Valida, transforma y persiste un respaldo del v4 dentro de una única transacción en Dexie.
 */
export async function importarRespaldoV4EnDB(
  entrada: unknown,
  database: AureonDB = defaultDb,
  ahora = Date.now(),
): Promise<ResultadoMigracionV4> {
  const resultado = transformarRespaldoV4(entrada, ahora);
  await database.reemplazarDatosEnTransaccion(resultado.datos);
  return resultado;
}
