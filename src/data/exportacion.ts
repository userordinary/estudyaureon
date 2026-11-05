/**
 * Exportación de datos de AUREON (PROMPT 9):
 * 1. CSV de la matriz de errores (UTF-8 con BOM `\uFEFF` para Excel):
 *    fecha, curso, tema, categoría, grupo (cognitivo/procedimental/mixto), nota, estado, caja de repaso, origen.
 *    Con filtros por curso, categoría y estado.
 * 2. CSV de simulacros (UTF-8 con BOM `\uFEFF` para Excel):
 *    fecha y hora, tipo, puntaje por sección y por curso, total, acumulado.
 * 3. Selector puro para el PDF imprimible "Temas a reforzar":
 *    agrupado por curso y tema con cantidad de errores y categoría dominante.
 */
import {
  acumuladoReal,
  calcularPuntaje,
  CURSOS,
  cursoPorId,
  fechaEnLima,
  REGLAS_EVALUACION,
  TEMARIO,
} from '../domain';
import {
  CATALOGO_CATEGORIAS_ERROR,
  type CategoriaError,
  type CursoOMixId,
  type EstadoMistake,
  type GrupoError,
  type Mistake,
  type Simulacro,
} from './schema';

/** Marca de orden de bytes UTF-8 (BOM) para que Excel en Windows reconozca tildes y ñ. */
export const UTF8_BOM = '\uFEFF';

/** Escapa una celda según RFC 4180 para CSV compatible con Excel. */
export function escaparCeldaCSV(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  if (texto.includes('"') || texto.includes(',') || texto.includes('\n') || texto.includes('\r')) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function formatearFilaCSV(celdas: readonly (string | number | null | undefined)[]): string {
  return celdas.map(escaparCeldaCSV).join(',');
}

// ---------------------------------------------------------------------------
// 1. CSV de la matriz de errores (con filtros por curso, categoría y estado)
// ---------------------------------------------------------------------------

export interface FiltrosExportacionErrores {
  curso?: CursoOMixId | 'todos';
  categoria?: CategoriaError | 'todas' | 'sin_clasificar';
  estado?: EstadoMistake | 'todos';
}

export function filtrarErroresParaExportacion(
  mistakes: readonly Mistake[],
  filtros: FiltrosExportacionErrores = {},
): Mistake[] {
  const { curso = 'todos', categoria = 'todas', estado = 'todos' } = filtros;
  return mistakes.filter((m) => {
    if (curso !== 'todos' && m.cursoId !== curso) return false;
    if (estado !== 'todos' && m.estado !== estado) return false;
    if (categoria === 'sin_clasificar') {
      if (m.categoria !== null) return false;
    } else if (categoria !== 'todas') {
      if (m.categoria !== categoria) return false;
    }
    return true;
  });
}

function obtenerNombreCurso(cursoId: CursoOMixId): string {
  if (cursoId === 'mix') return 'Mixto / General';
  try {
    return cursoPorId(cursoId).nombre;
  } catch {
    return cursoId;
  }
}

function obtenerNombreTema(temaId: string | null): string {
  if (!temaId) return 'Sin tema específico';
  const tema = TEMARIO.find((t) => t.id === temaId);
  return tema ? `S${tema.semana} · ${tema.titulo}` : temaId;
}

export const ENCABEZADOS_CSV_ERRORES = [
  'Fecha',
  'Curso',
  'Tema',
  'Categoría',
  'Grupo',
  'Nota',
  'Estado',
  'Caja de repaso',
  'Origen',
] as const;

export function generarCSVMistakes(
  mistakes: readonly Mistake[],
  filtros: FiltrosExportacionErrores = {},
): string {
  const filtrados = filtrarErroresParaExportacion(mistakes, filtros);
  const filas: string[] = [formatearFilaCSV(ENCABEZADOS_CSV_ERRORES)];

  for (const m of filtrados) {
    const fecha = m.fecha ?? fechaEnLima(new Date(m.creadoEn));
    const curso = obtenerNombreCurso(m.cursoId);
    const tema = obtenerNombreTema(m.temaId);
    const categoria = m.categoria
      ? CATALOGO_CATEGORIAS_ERROR[m.categoria].etiqueta
      : 'Por clasificar';
    const grupo = m.categoria ? CATALOGO_CATEGORIAS_ERROR[m.categoria].grupo : 'sin clasificar';
    const nota = m.nota;
    const estado = m.estado;
    const caja = m.caja;
    const origen = m.origen;

    filas.push(
      formatearFilaCSV([fecha, curso, tema, categoria, grupo, nota, estado, caja, origen]),
    );
  }

  return UTF8_BOM + filas.join('\r\n');
}

// ---------------------------------------------------------------------------
// 2. CSV de simulacros (fecha y hora, tipo, puntaje por sección y por curso, total, acumulado)
// ---------------------------------------------------------------------------

export function formatearFechaHoraLima(ts: number, fechaFallback: string): string {
  if (!Number.isFinite(ts) || ts <= 0) return `${fechaFallback} 00:00`;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const partes = formatter.formatToParts(new Date(ts));
  const map: Record<string, string> = {};
  for (const p of partes) {
    map[p.type] = p.value;
  }
  const yyyy = map.year ?? fechaFallback.slice(0, 4);
  const mm = map.month ?? fechaFallback.slice(5, 7);
  const dd = map.day ?? fechaFallback.slice(8, 10);
  const hh = map.hour === '24' ? '00' : (map.hour ?? '00');
  const min = map.minute ?? '00';
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function generarCSVSimulacros(simulacros: readonly Simulacro[]): string {
  const encabezadosCursos = CURSOS.map((c) => `Puntaje ${c.nombre}`);
  const encabezados = [
    'Fecha y hora',
    'Tipo',
    'Puntaje Actitud',
    'Puntaje Habilidades',
    'Puntaje Conocimientos',
    'Puntaje por curso',
    ...encabezadosCursos,
    'Total',
    'Acumulado',
  ];

  const ordenados = [...simulacros].sort((a, b) => a.ts - b.ts || a.fecha.localeCompare(b.fecha));
  const filas: string[] = [formatearFilaCSV(encabezados)];

  const historialProcesado: Simulacro[] = [];

  for (const sim of ordenados) {
    historialProcesado.push(sim);
    const fechaHora = formatearFechaHoraLima(sim.ts, sim.fecha);
    const regla = REGLAS_EVALUACION[sim.tipo];
    const tipoNombre = regla.nombre;

    let ptAct: string;
    let ptHab: string;
    let ptConoc: string;
    try {
      const puntaje = calcularPuntaje(sim.tipo, { secciones: sim.secciones });
      ptAct = puntaje.act.toFixed(3);
      ptHab = puntaje.hab.toFixed(3);
      ptConoc = puntaje.conoc.toFixed(3);
    } catch {
      const sAct = sim.secciones.act ?? { ok: 0, bad: 0 };
      const sHab = sim.secciones.hab ?? { ok: 0, bad: 0 };
      const sConoc = sim.secciones.conoc ?? { ok: 0, bad: 0 };
      ptAct = Math.max(0, sAct.ok * regla.buena - sAct.bad * regla.mala).toFixed(3);
      ptHab = Math.max(0, sHab.ok * regla.buena - sHab.bad * regla.mala).toFixed(3);
      ptConoc = Math.max(0, sConoc.ok * regla.buena - sConoc.bad * regla.mala).toFixed(3);
    }

    const resumenCursos: string[] = [];
    const celdasCursos: string[] = [];

    for (const c of CURSOS) {
      const resp = sim.porCurso[c.id];
      if (resp) {
        const ptsCurso = Math.max(0, resp.ok * regla.buena - resp.bad * regla.mala);
        const ptsFmt = ptsCurso.toFixed(3);
        resumenCursos.push(`${c.nombre}: ${ptsFmt}`);
        celdasCursos.push(ptsFmt);
      } else {
        celdasCursos.push('');
      }
    }

    const detallePorCurso =
      resumenCursos.length > 0 ? resumenCursos.join(' | ') : 'Sin desglose por curso';
    const totalFmt = sim.total.toFixed(3);
    const acum = acumuladoReal(historialProcesado).total.toFixed(3);

    filas.push(
      formatearFilaCSV([
        fechaHora,
        tipoNombre,
        ptAct,
        ptHab,
        ptConoc,
        detallePorCurso,
        ...celdasCursos,
        totalFmt,
        acum,
      ]),
    );
  }

  return UTF8_BOM + filas.join('\r\n');
}

// ---------------------------------------------------------------------------
// 3. Reporte imprimible "Temas a reforzar" (para PDF con window.print)
// ---------------------------------------------------------------------------

export interface TemaAReforzarItem {
  temaId: string | null;
  temaEtiqueta: string;
  cantidadErrores: number;
  categoriaDominante: string;
  grupoDominante: GrupoError | 'sin clasificar';
}

export interface CursoTemasAReforzar {
  cursoId: CursoOMixId;
  cursoNombre: string;
  totalErroresCurso: number;
  temas: TemaAReforzarItem[];
}

export interface ReporteTemasAReforzar {
  totalErroresIncluidos: number;
  cursos: CursoTemasAReforzar[];
}

export function construirReporteTemasAReforzar(
  mistakes: readonly Mistake[],
  opciones: { incluirDominados?: boolean } = {},
): ReporteTemasAReforzar {
  const fuente = opciones.incluirDominados
    ? mistakes
    : mistakes.filter((m) => m.estado !== 'dominado');

  const mapaCursos = new Map<
    CursoOMixId,
    Map<
      string,
      {
        temaId: string | null;
        temaEtiqueta: string;
        cantidad: number;
        conteoCat: Map<CategoriaError | 'sin_clasificar', number>;
      }
    >
  >();

  for (const m of fuente) {
    let mapaTemas = mapaCursos.get(m.cursoId);
    if (!mapaTemas) {
      mapaTemas = new Map();
      mapaCursos.set(m.cursoId, mapaTemas);
    }

    const claveTema = m.temaId ?? '__sin_tema__';
    let itemTema = mapaTemas.get(claveTema);
    if (!itemTema) {
      itemTema = {
        temaId: m.temaId,
        temaEtiqueta: obtenerNombreTema(m.temaId),
        cantidad: 0,
        conteoCat: new Map(),
      };
      mapaTemas.set(claveTema, itemTema);
    }

    itemTema.cantidad += 1;
    const catKey = m.categoria ?? 'sin_clasificar';
    itemTema.conteoCat.set(catKey, (itemTema.conteoCat.get(catKey) ?? 0) + 1);
  }

  const cursos: CursoTemasAReforzar[] = [];

  for (const [cursoId, mapaTemas] of mapaCursos.entries()) {
    const temas: TemaAReforzarItem[] = [];
    let totalErroresCurso = 0;

    for (const entry of mapaTemas.values()) {
      totalErroresCurso += entry.cantidad;

      let mejorCat: CategoriaError | 'sin_clasificar' = 'sin_clasificar';
      let maxCatCount = -1;
      for (const [cat, cnt] of entry.conteoCat.entries()) {
        if (cnt > maxCatCount) {
          maxCatCount = cnt;
          mejorCat = cat;
        }
      }

      const categoriaDominante =
        mejorCat === 'sin_clasificar'
          ? 'Por clasificar'
          : CATALOGO_CATEGORIAS_ERROR[mejorCat].etiqueta;
      const grupoDominante: GrupoError | 'sin clasificar' =
        mejorCat === 'sin_clasificar'
          ? 'sin clasificar'
          : CATALOGO_CATEGORIAS_ERROR[mejorCat].grupo;

      temas.push({
        temaId: entry.temaId,
        temaEtiqueta: entry.temaEtiqueta,
        cantidadErrores: entry.cantidad,
        categoriaDominante,
        grupoDominante,
      });
    }

    temas.sort(
      (a, b) =>
        b.cantidadErrores - a.cantidadErrores || a.temaEtiqueta.localeCompare(b.temaEtiqueta),
    );

    cursos.push({
      cursoId,
      cursoNombre: obtenerNombreCurso(cursoId),
      totalErroresCurso,
      temas,
    });
  }

  cursos.sort(
    (a, b) =>
      b.totalErroresCurso - a.totalErroresCurso || a.cursoNombre.localeCompare(b.cursoNombre),
  );

  return {
    totalErroresIncluidos: fuente.length,
    cursos,
  };
}

/**
 * Dispara la descarga de un archivo en el navegador (seguro también en entornos de test/JSDOM).
 */
export function descargarArchivoTexto(
  nombreArchivo: string,
  contenido: string,
  mimeType = 'text/csv;charset=utf-8;',
): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([contenido], { type: mimeType });
  const tieneObjectURL = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
  const url = tieneObjectURL ? URL.createObjectURL(blob) : '';
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', nombreArchivo);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (tieneObjectURL && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}
