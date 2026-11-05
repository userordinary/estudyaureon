/**
 * Motor puro de analítica de `comando` y reglas de "Acción Inmediata" (`src/domain/accion.ts` — PROMPT 8):
 * - R1: bloque/curso bajo el umbral con peso alto -> "Enfócate en {curso}, tema con más errores: {tema}".
 * - R2: caída >= 8 puntos de efectividad entre dos ventanas de 14 días, con >= 30 preguntas en cada una -> aviso de caída.
 * - R3: >= 3 h de enfoque y >= 30 preguntas en la semana con caída >= 8 puntos -> "Revisa tu método de estudio en {curso}".
 * - R4: la categoría "lectura" domina los errores recientes -> recomendación de lectura de enunciados (subrayar NO/EXCEPTO).
 * - R5: un curso dominado (>= 90 %) NO se abandona -> se sugiere mantenerlo con repaso mínimo semanal.
 * - Umbrales mínimos de datos: si no se cumplen, devuelve "Faltan datos: registra N preguntas más en X" y no inventa nada.
 * - Un solo motor con "Hoy": la acción principal de "Hoy" y la primera de este panel salen del mismo plan.
 * - Selectores puros para los 3 gráficos de Comando: Curva de Acumulación, Radar de Dominio y Autopsia de Errores.
 */
import { acumuladoReal, brecha, lineaRequeridaAcumulada, objetivoTotal } from './acumulado';
import { buscarCarrera } from './benchmarks';
import { CURSOS, cursoPorId, PESOS_AREA, REGLAS_EVALUACION, TEMARIO, temasDeCurso } from './data';
import { diasEntre, lunesDe, sumarDias } from './fechas';
import type { PlanDelDia } from './plan';
import { redondear3 } from './redondeo';
import { preguntasEsperadasPorClave } from './simulacro';
import {
  BLOQUES,
  CURSO_IDS,
  EVALUACIONES_CEPRE,
  type AreaId,
  type BloqueId,
  type CursoId,
  type EvalCepreId,
  type FechaISO,
  type TipoEval,
} from './tipos';

// ---------------------------------------------------------------------------
// Tipos de entrada puros (desacoplados de Dexie / React)
// ---------------------------------------------------------------------------

export type CategoriaErrorDominio = 'teoria' | 'lectura' | 'duda' | 'calculo' | 'tiempo';
export type GrupoErrorDominio = 'cognitivo' | 'procedimental' | 'mixto';

export interface PracticaAnalitica {
  fecha: FechaISO;
  cursoId: CursoId | 'mix';
  temaId: string | null;
  ok: number;
  bad: number;
  sinDetalle?: boolean;
}

export interface ErrorAnalitico {
  fecha?: FechaISO;
  creadoEn?: number;
  cursoId: CursoId | 'mix';
  temaId: string | null;
  categoria: CategoriaErrorDominio | null;
  estado: 'abierto' | 'repaso' | 'dominado';
}

export interface EnfoqueAnalitico {
  fecha: FechaISO;
  cursoId: CursoId | 'mix';
  minutosEnfoque: number;
}

export interface SimulacroAnalitico {
  fecha: FechaISO;
  tipo: TipoEval;
  total: number;
  porCurso: Readonly<
    Partial<Record<CursoId | 'act', { ok: number; bad: number; blanco?: number }>>
  >;
}

// ---------------------------------------------------------------------------
// 1. Reglas R1–R5 de "Acción Inmediata" con umbrales mínimos de datos
// ---------------------------------------------------------------------------

export const MIN_PREGUNTAS_CURSO_R1 = 10;
export const MIN_PREGUNTAS_VENTANA_R2 = 30;
export const UMBRAL_CAIDA_PUNTOS_R2 = 8;
export const MIN_MINUTOS_SEMANA_R3 = 180; // 3 horas
export const MIN_PREGUNTAS_SEMANA_R3 = 30;
export const MIN_ERRORES_CLASIFICADOS_R4 = 5;
export const MIN_PREGUNTAS_DOMINADO_R5 = 20;
export const UMBRAL_EFECTIVIDAD_DOMINADO_R5 = 90;

export type CodigoReglaAccion = 'PLAN_HOY' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'FALTAN_DATOS';

export interface AccionInmediataItem {
  id: string;
  regla: CodigoReglaAccion;
  cursoId: CursoId | null;
  temaId: string | null;
  titulo: string;
  texto: string;
  esFaltanDatos: boolean;
  prioridad: number;
}

function nombreTema(cursoId: CursoId, temaId: string | null): string {
  if (temaId) {
    const encontrado = TEMARIO.find((t) => t.id === temaId);
    if (encontrado) return `S${encontrado.semana} · ${encontrado.titulo}`;
  }
  const primero = temasDeCurso(cursoId)[0];
  return primero ? `S${primero.semana} · ${primero.titulo}` : 'Tema base del curso';
}

/**
 * R1: Bloque/curso bajo el umbral de seguridad con peso alto ->
 * "Enfócate en {curso}, tema con más errores: {tema}".
 * Si ningún curso tiene aún el umbral mínimo de preguntas (`>= 10`), devuelve aviso "Faltan datos".
 */
export function evaluarReglaR1(params: {
  area: AreaId;
  umbralSeguridad: number;
  practices: readonly PracticaAnalitica[];
  mistakes: readonly ErrorAnalitico[];
}): AccionInmediataItem {
  const { area, umbralSeguridad, practices, mistakes } = params;

  const statsCurso = new Map<CursoId, { ok: number; total: number }>();
  for (const p of practices) {
    if (p.cursoId === 'mix' || p.sinDetalle) continue;
    const prev = statsCurso.get(p.cursoId) ?? { ok: 0, total: 0 };
    prev.ok += p.ok;
    prev.total += p.ok + p.bad;
    statsCurso.set(p.cursoId, prev);
  }

  // Candidatos con datos suficientes (>= 10 preguntas) y efectividad < umbralSeguridad
  const bajosConDatos: Array<{
    cursoId: CursoId;
    peso: number;
    efectividad: number;
    total: number;
  }> = [];

  for (const cid of CURSO_IDS) {
    const st = statsCurso.get(cid);
    if (!st || st.total < MIN_PREGUNTAS_CURSO_R1) continue;
    const efectividad = Math.round((st.ok / st.total) * 1000) / 10;
    if (efectividad < umbralSeguridad) {
      const peso = cid === 'hv' || cid === 'hm' ? 15 : (PESOS_AREA[area][cid] ?? 1);
      bajosConDatos.push({ cursoId: cid, peso, efectividad, total: st.total });
    }
  }

  bajosConDatos.sort((a, b) => b.peso - a.peso || a.efectividad - b.efectividad);

  const elegido = bajosConDatos[0];
  if (elegido) {
    const curso = cursoPorId(elegido.cursoId);
    // Buscar el tema con más errores en este curso
    const conteoTema = new Map<string, number>();
    for (const m of mistakes) {
      if (m.cursoId === elegido.cursoId && m.temaId && m.estado !== 'dominado') {
        conteoTema.set(m.temaId, (conteoTema.get(m.temaId) ?? 0) + 1);
      }
    }
    let peorTemaId: string | null = null;
    let maxErr = 0;
    for (const [tid, cnt] of conteoTema.entries()) {
      if (cnt > maxErr) {
        maxErr = cnt;
        peorTemaId = tid;
      }
    }
    const etiquetaTema = nombreTema(elegido.cursoId, peorTemaId);

    return {
      id: `r1-${elegido.cursoId}`,
      regla: 'R1',
      cursoId: elegido.cursoId,
      temaId: peorTemaId,
      titulo: `R1 · Curso bajo umbral (${elegido.efectividad}% < ${umbralSeguridad}%)`,
      texto: `Enfócate en ${curso.nombre}, tema con más errores: ${etiquetaTema}.`,
      esFaltanDatos: false,
      prioridad: 95,
    };
  }

  // Verificar si algún curso ya tiene datos parciales (> 0 y < 10) o tomar el de mayor peso del área
  const cursosPorPeso = [...CURSO_IDS].sort((a, b) => {
    const parcialA =
      (statsCurso.get(a)?.total ?? 0) > 0 &&
      (statsCurso.get(a)?.total ?? 0) < MIN_PREGUNTAS_CURSO_R1
        ? 1
        : 0;
    const parcialB =
      (statsCurso.get(b)?.total ?? 0) > 0 &&
      (statsCurso.get(b)?.total ?? 0) < MIN_PREGUNTAS_CURSO_R1
        ? 1
        : 0;
    if (parcialA !== parcialB) return parcialB - parcialA;
    const pa = a === 'hv' || a === 'hm' ? 15 : (PESOS_AREA[area][a] ?? 1);
    const pb = b === 'hv' || b === 'hm' ? 15 : (PESOS_AREA[area][b] ?? 1);
    return pb - pa;
  });

  const cursoFaltante =
    cursosPorPeso.find((cid) => (statsCurso.get(cid)?.total ?? 0) < MIN_PREGUNTAS_CURSO_R1) ?? 'hv';
  const actualPreg = statsCurso.get(cursoFaltante)?.total ?? 0;
  const faltan = Math.max(1, MIN_PREGUNTAS_CURSO_R1 - actualPreg);

  return {
    id: `r1-faltan-${cursoFaltante}`,
    regla: 'FALTAN_DATOS',
    cursoId: cursoFaltante,
    temaId: null,
    titulo: 'R1 · Umbral mínimo de diagnóstico',
    texto: `Faltan datos: registra ${faltan} preguntas más en ${cursoPorId(cursoFaltante).nombre}.`,
    esFaltanDatos: true,
    prioridad: 30,
  };
}

/**
 * R2: Caída >= 8 puntos de efectividad entre dos ventanas de 14 días
 * (`[hoy-27, hoy-14]` vs `[hoy-13, hoy]`), con `>= 30` preguntas en cada ventana.
 */
export function evaluarReglaR2(params: {
  fechaHoy: FechaISO;
  practices: readonly PracticaAnalitica[];
  cursoIdObjetivo?: CursoId;
}): AccionInmediataItem {
  const { fechaHoy, practices, cursoIdObjetivo } = params;
  const inicioPrev = sumarDias(fechaHoy, -27);
  const finPrev = sumarDias(fechaHoy, -14);
  const inicioAct = sumarDias(fechaHoy, -13);

  const cursosAEvaluar = cursoIdObjetivo ? [cursoIdObjetivo] : CURSO_IDS;

  let mejorCandidatoParcial: { cursoId: CursoId; faltan: number } | null = null;

  for (const cid of cursosAEvaluar) {
    let okPrev = 0;
    let totPrev = 0;
    let okAct = 0;
    let totAct = 0;

    for (const p of practices) {
      if (p.cursoId !== cid || p.sinDetalle) continue;
      if (p.fecha >= inicioPrev && p.fecha <= finPrev) {
        okPrev += p.ok;
        totPrev += p.ok + p.bad;
      } else if (p.fecha >= inicioAct && p.fecha <= fechaHoy) {
        okAct += p.ok;
        totAct += p.ok + p.bad;
      }
    }

    if (totPrev >= MIN_PREGUNTAS_VENTANA_R2 && totAct >= MIN_PREGUNTAS_VENTANA_R2) {
      const efPrev = (okPrev / totPrev) * 100;
      const efAct = (okAct / totAct) * 100;
      const caida = Math.round((efPrev - efAct) * 10) / 10;
      if (caida >= UMBRAL_CAIDA_PUNTOS_R2) {
        const nombre = cursoPorId(cid).nombre;
        return {
          id: `r2-${cid}`,
          regla: 'R2',
          cursoId: cid,
          temaId: null,
          titulo: `R2 · Caída de efectividad en ${nombre}`,
          texto: `Aviso de caída: ${nombre} bajó ${caida} puntos de efectividad (${Math.round(efPrev)}% → ${Math.round(efAct)}%) entre las dos últimas ventanas de 14 días.`,
          esFaltanDatos: false,
          prioridad: 90,
        };
      }
    } else if (totPrev > 0 || totAct > 0) {
      const faltanPrev = Math.max(0, MIN_PREGUNTAS_VENTANA_R2 - totPrev);
      const faltanAct = Math.max(0, MIN_PREGUNTAS_VENTANA_R2 - totAct);
      const faltan = Math.max(1, faltanPrev > 0 ? faltanPrev : faltanAct);
      if (!mejorCandidatoParcial || faltan < mejorCandidatoParcial.faltan) {
        mejorCandidatoParcial = { cursoId: cid, faltan };
      }
    }
  }

  const cursoRef = mejorCandidatoParcial?.cursoId ?? cursoIdObjetivo ?? 'hv';
  const faltan = mejorCandidatoParcial?.faltan ?? MIN_PREGUNTAS_VENTANA_R2;
  return {
    id: `r2-faltan-${cursoRef}`,
    regla: 'FALTAN_DATOS',
    cursoId: cursoRef,
    temaId: null,
    titulo: 'R2 · Comparación quincenal (14d vs 14d)',
    texto: `Faltan datos: registra ${faltan} preguntas más en ${cursoPorId(cursoRef).nombre} para comparar dos ventanas de 14 días (mín. 30 por ventana).`,
    esFaltanDatos: true,
    prioridad: 25,
  };
}

/**
 * R3: >= 3 h (180 min) de enfoque y >= 30 preguntas en la semana con caída >= 8 puntos ->
 * "Revisa tu método de estudio en {curso}".
 */
export function evaluarReglaR3(params: {
  fechaHoy: FechaISO;
  practices: readonly PracticaAnalitica[];
  focusSessions: readonly EnfoqueAnalitico[];
  cursoIdObjetivo?: CursoId;
}): AccionInmediataItem {
  const { fechaHoy, practices, focusSessions, cursoIdObjetivo } = params;
  const lunes = lunesDe(fechaHoy);
  const domingo = sumarDias(lunes, 6);
  const inicioPrev14 = sumarDias(fechaHoy, -27);
  const finPrev14 = sumarDias(fechaHoy, -14);

  const cursos = cursoIdObjetivo ? [cursoIdObjetivo] : CURSO_IDS;
  let mejorParcial: { cursoId: CursoId; faltanPreg: number; faltanMin: number } | null = null;

  for (const cid of cursos) {
    const minSemana = focusSessions
      .filter((f) => f.cursoId === cid && f.fecha >= lunes && f.fecha <= domingo)
      .reduce((s, f) => s + f.minutosEnfoque, 0);

    const pracSemana = practices.filter(
      (p) => p.cursoId === cid && !p.sinDetalle && p.fecha >= lunes && p.fecha <= domingo,
    );
    const pregSemana = pracSemana.reduce((s, p) => s + p.ok + p.bad, 0);
    const okSemana = pracSemana.reduce((s, p) => s + p.ok, 0);

    if (minSemana >= MIN_MINUTOS_SEMANA_R3 && pregSemana >= MIN_PREGUNTAS_SEMANA_R3) {
      const efSemana = (okSemana / pregSemana) * 100;

      // Comparar contra práctica previa al lunes de esta semana (o ventana previa de 14 días)
      const pracPrevias = practices.filter(
        (p) =>
          p.cursoId === cid &&
          !p.sinDetalle &&
          p.fecha < lunes &&
          p.fecha >= inicioPrev14 &&
          p.fecha <= finPrev14,
      );
      const fuentePrev =
        pracPrevias.length > 0
          ? pracPrevias
          : practices.filter((p) => p.cursoId === cid && !p.sinDetalle && p.fecha < lunes);

      const totPrev = fuentePrev.reduce((s, p) => s + p.ok + p.bad, 0);
      const okPrev = fuentePrev.reduce((s, p) => s + p.ok, 0);

      if (totPrev >= MIN_PREGUNTAS_CURSO_R1) {
        const efPrev = (okPrev / totPrev) * 100;
        const caida = Math.round((efPrev - efSemana) * 10) / 10;
        if (caida >= UMBRAL_CAIDA_PUNTOS_R2) {
          const nombre = cursoPorId(cid).nombre;
          return {
            id: `r3-${cid}`,
            regla: 'R3',
            cursoId: cid,
            temaId: null,
            titulo: `R3 · Alerta de método en ${nombre}`,
            texto: `Revisa tu método de estudio en ${nombre}: acumulaste ${Math.round((minSemana / 60) * 10) / 10} h y ${pregSemana} preguntas esta semana, pero tu efectividad cayó ${caida} pts.`,
            esFaltanDatos: false,
            prioridad: 92,
          };
        }
      }
    } else if (minSemana > 0 || pregSemana > 0) {
      const faltanPreg = Math.max(0, MIN_PREGUNTAS_SEMANA_R3 - pregSemana);
      const faltanMin = Math.max(0, MIN_MINUTOS_SEMANA_R3 - minSemana);
      if (!mejorParcial) {
        mejorParcial = { cursoId: cid, faltanPreg, faltanMin };
      }
    }
  }

  const cursoRef = mejorParcial?.cursoId ?? cursoIdObjetivo ?? 'quim';
  const faltanPreg = mejorParcial ? Math.max(1, mejorParcial.faltanPreg) : MIN_PREGUNTAS_SEMANA_R3;

  return {
    id: `r3-faltan-${cursoRef}`,
    regla: 'FALTAN_DATOS',
    cursoId: cursoRef,
    temaId: null,
    titulo: 'R3 · Cruce de horas vs efectividad',
    texto: `Faltan datos: registra ${faltanPreg} preguntas más en ${cursoPorId(cursoRef).nombre} esta semana (requiere >= 3 h de enfoque y >= 30 preguntas).`,
    esFaltanDatos: true,
    prioridad: 20,
  };
}

/**
 * R4: La categoría "lectura" domina los errores recientes ->
 * recomendación de lectura de enunciados (subrayar NO/EXCEPTO).
 */
export function evaluarReglaR4(params: {
  mistakes: readonly ErrorAnalitico[];
}): AccionInmediataItem {
  const clasificados = params.mistakes.filter((m) => m.categoria !== null);
  if (clasificados.length < MIN_ERRORES_CLASIFICADOS_R4) {
    const faltan = MIN_ERRORES_CLASIFICADOS_R4 - clasificados.length;
    return {
      id: 'r4-faltan-errores',
      regla: 'FALTAN_DATOS',
      cursoId: null,
      temaId: null,
      titulo: 'R4 · Patrón de errores recientes',
      texto: `Faltan datos: registra ${faltan} error(es) clasificado(s) más en tu cuaderno para detectar el patrón dominante.`,
      esFaltanDatos: true,
      prioridad: 15,
    };
  }

  const conteo: Record<CategoriaErrorDominio, number> = {
    teoria: 0,
    lectura: 0,
    duda: 0,
    calculo: 0,
    tiempo: 0,
  };
  for (const m of clasificados) {
    if (m.categoria) conteo[m.categoria] += 1;
  }

  const maxCat = (Object.keys(conteo) as CategoriaErrorDominio[]).sort(
    (a, b) => conteo[b] - conteo[a],
  )[0];

  if (maxCat === 'lectura' && conteo.lectura > 0) {
    return {
      id: 'r4-lectura-domina',
      regla: 'R4',
      cursoId: null,
      temaId: null,
      titulo: `R4 · Mala lectura domina (${conteo.lectura}/${clasificados.length} errores)`,
      texto:
        'La categoría «Mala lectura de la premisa» domina tus errores recientes: subraya NO, EXCEPTO y las condiciones límite del enunciado antes de mirar las alternativas.',
      esFaltanDatos: false,
      prioridad: 85,
    };
  }

  return {
    id: 'r4-sin-predominio-lectura',
    regla: 'FALTAN_DATOS',
    cursoId: null,
    temaId: null,
    titulo: 'R4 · Lectura bajo control',
    texto:
      'Faltan datos de predominio en lectura: la categoría «lectura» no es la causa principal actual.',
    esFaltanDatos: true,
    prioridad: 10,
  };
}

/**
 * R5: Un curso dominado (>= 90 % de efectividad con >= 20 preguntas) NO se abandona:
 * se sugiere mantenerlo con repaso mínimo; ninguna acción puede dejar un curso sin aparecer en la semana.
 */
export function evaluarReglaR5(params: {
  fechaHoy: FechaISO;
  practices: readonly PracticaAnalitica[];
}): AccionInmediataItem {
  const { fechaHoy, practices } = params;
  const stats = new Map<CursoId, { ok: number; total: number; ultimaFecha: FechaISO | null }>();

  for (const p of practices) {
    if (p.cursoId === 'mix' || p.sinDetalle) continue;
    const prev = stats.get(p.cursoId) ?? { ok: 0, total: 0, ultimaFecha: null };
    prev.ok += p.ok;
    prev.total += p.ok + p.bad;
    if (!prev.ultimaFecha || p.fecha > prev.ultimaFecha) {
      prev.ultimaFecha = p.fecha;
    }
    stats.set(p.cursoId, prev);
  }

  const dominados: Array<{
    cursoId: CursoId;
    efectividad: number;
    diasSinPracticar: number;
  }> = [];

  for (const [cid, st] of stats.entries()) {
    if (st.total < MIN_PREGUNTAS_DOMINADO_R5) continue;
    const ef = Math.round((st.ok / st.total) * 1000) / 10;
    if (ef >= UMBRAL_EFECTIVIDAD_DOMINADO_R5) {
      const dias = st.ultimaFecha ? Math.max(0, diasEntre(st.ultimaFecha, fechaHoy)) : 7;
      dominados.push({ cursoId: cid, efectividad: ef, diasSinPracticar: dias });
    }
  }

  dominados.sort(
    (a, b) => b.diasSinPracticar - a.diasSinPracticar || b.efectividad - a.efectividad,
  );

  const elegido = dominados[0];
  if (elegido) {
    const nombre = cursoPorId(elegido.cursoId).nombre;
    return {
      id: `r5-${elegido.cursoId}`,
      regla: 'R5',
      cursoId: elegido.cursoId,
      temaId: null,
      titulo: `R5 · Mantenimiento de curso dominado (${elegido.efectividad}%)`,
      texto: `No abandones ${nombre} (${elegido.efectividad}% de efectividad): mantenlo con 1 bloque de repaso mínimo esta semana para que ningún curso quede sin aparecer.`,
      esFaltanDatos: false,
      prioridad: 80,
    };
  }

  // Si aún ningún curso alcanza >= 20 preguntas con >= 90 %
  let mejorCurso: CursoId = 'hv';
  let maxPreg = 0;
  for (const [cid, st] of stats.entries()) {
    if (st.total > maxPreg) {
      maxPreg = st.total;
      mejorCurso = cid;
    }
  }
  const faltan = Math.max(1, MIN_PREGUNTAS_DOMINADO_R5 - maxPreg);
  return {
    id: `r5-faltan-${mejorCurso}`,
    regla: 'FALTAN_DATOS',
    cursoId: mejorCurso,
    temaId: null,
    titulo: 'R5 · Retención de cursos dominados (>= 90%)',
    texto: `Faltan datos: registra ${faltan} preguntas más en ${cursoPorId(mejorCurso).nombre} para evaluar mantenimiento de dominio (>= 90%).`,
    esFaltanDatos: true,
    prioridad: 12,
  };
}

/**
 * Devuelve como máximo 3 acciones concretas para el panel "Acción Inmediata" de Comando.
 * La primera acción sale del mismo motor que la acción principal de "Hoy" (`planDelDia.accionPrincipal`),
 * complementada por las reglas activas R1–R5 (o avisos explícitos de "Faltan datos" si no se cumplen los umbrales).
 */
export function generarAccionesInmediatas(params: {
  fechaHoy: FechaISO;
  area: AreaId;
  umbralSeguridad: number;
  practices: readonly PracticaAnalitica[];
  mistakes: readonly ErrorAnalitico[];
  focusSessions: readonly EnfoqueAnalitico[];
  planDelDia?: PlanDelDia;
}): AccionInmediataItem[] {
  const { fechaHoy, area, umbralSeguridad, practices, mistakes, focusSessions, planDelDia } =
    params;

  const r1 = evaluarReglaR1({ area, umbralSeguridad, practices, mistakes });
  const r2 = evaluarReglaR2({ fechaHoy, practices });
  const r3 = evaluarReglaR3({ fechaHoy, practices, focusSessions });
  const r4 = evaluarReglaR4({ mistakes });
  const r5 = evaluarReglaR5({ fechaHoy, practices });

  const reglasActivas = [r1, r2, r3, r4, r5].filter((r) => !r.esFaltanDatos);
  const avisosFaltanDatos = [r1, r2, r3, r4, r5].filter((r) => r.esFaltanDatos);

  const resultado: AccionInmediataItem[] = [];

  // Si no hay datos suficientes en ninguna regla activa, priorizamos mostrar los avisos "Faltan datos" sin inventar nada,
  // pero manteniendo la conexión con el bloque principal de "Hoy" cuando ya hay reglas activas o como guía inicial.
  if (planDelDia?.accionPrincipal && reglasActivas.length > 0) {
    const b = planDelDia.accionPrincipal;
    resultado.push({
      id: `plan-hoy-${b.cursoId}`,
      regla: 'PLAN_HOY',
      cursoId: b.cursoId,
      temaId: b.temaId,
      titulo: `Siguiente bloque (Plan de Hoy · ${b.cursoNombre})`,
      texto: `${b.cursoNombre} · ${b.temaTitulo} (${b.preguntas} preg · ${b.minutos} min). ${b.porQue}`,
      esFaltanDatos: false,
      prioridad: 100,
    });
  }

  for (const regla of reglasActivas) {
    if (resultado.length >= 3) break;
    resultado.push(regla);
  }

  // Si aún quedan espacios (< 3) y el plan de hoy no se había insertado pero hay datos parciales o necesitamos completar con avisos "Faltan datos":
  if (resultado.length === 0 && planDelDia?.accionPrincipal && practices.length > 0) {
    const b = planDelDia.accionPrincipal;
    resultado.push({
      id: `plan-hoy-${b.cursoId}`,
      regla: 'PLAN_HOY',
      cursoId: b.cursoId,
      temaId: b.temaId,
      titulo: `Siguiente bloque (Plan de Hoy · ${b.cursoNombre})`,
      texto: `${b.cursoNombre} · ${b.temaTitulo} (${b.preguntas} preg · ${b.minutos} min). ${b.porQue}`,
      esFaltanDatos: false,
      prioridad: 100,
    });
  }

  for (const aviso of avisosFaltanDatos) {
    if (resultado.length >= 3) break;
    resultado.push(aviso);
  }

  return resultado.slice(0, 3);
}

// ---------------------------------------------------------------------------
// 2. Curva de Acumulación (4 evaluaciones CEPRE)
// ---------------------------------------------------------------------------

export interface PuntoCurvaAcumulacion {
  evaluacion: EvalCepreId;
  etiqueta: string;
  acumuladoReal: number | null;
  lineaRequerida: number;
  lineaMetaPersonal: number | null;
}

export interface DatosCurvaAcumulacion {
  puntos: PuntoCurvaAcumulacion[];
  acumuladoTotal: number;
  objetivoTotal: number;
  fuenteObjetivo: 'meta' | 'corte';
  brechaExacta: number;
  esCorteEstimado: boolean;
}

const PESOS_ACUMULADOS_META: readonly [number, number, number, number] = [0.15, 0.35, 0.6, 1.0];

export function construirDatosCurvaAcumulacion(params: {
  carreraId: string;
  metaPersonal: number | null;
  simulacros: readonly { tipo: TipoEval; total: number }[];
}): DatosCurvaAcumulacion {
  const { carreraId, metaPersonal, simulacros } = params;
  const acum = acumuladoReal(simulacros);
  const req = lineaRequeridaAcumulada(carreraId);
  const obj = objetivoTotal(carreraId, metaPersonal);
  const brechaExacta = brecha(acum.total, obj);

  let sumaAcumuladaEstudiante = 0;
  let algunaRendida = false;

  const puntos: PuntoCurvaAcumulacion[] = EVALUACIONES_CEPRE.map((ev, idx) => {
    const puntajeEv = acum.porEvaluacion[ev];
    if (puntajeEv !== null) {
      sumaAcumuladaEstudiante = redondear3(sumaAcumuladaEstudiante + puntajeEv);
      algunaRendida = true;
    }

    const acumuladoPunto = puntajeEv !== null ? sumaAcumuladaEstudiante : algunaRendida ? null : 0;

    const factorMeta = PESOS_ACUMULADOS_META[idx] ?? 1;
    const lineaMetaPersonal = metaPersonal !== null ? redondear3(metaPersonal * factorMeta) : null;

    return {
      evaluacion: ev,
      etiqueta: REGLAS_EVALUACION[ev].nombre.replace(' Evaluación CEPRE', '.ª CEPRE'),
      acumuladoReal: acumuladoPunto,
      lineaRequerida: req.acumulada[idx] ?? 0,
      lineaMetaPersonal,
    };
  });

  return {
    puntos,
    acumuladoTotal: acum.total,
    objetivoTotal: obj.total,
    fuenteObjetivo: obj.fuente,
    brechaExacta,
    esCorteEstimado: !req.esOficial,
  };
}

// ---------------------------------------------------------------------------
// 3. Radar de Dominio (4 bloques + drilldown por curso)
// ---------------------------------------------------------------------------

export type FuenteRadarDominio = 'simulacros' | 'practica_30d';

export interface EjeBloqueRadar {
  bloque: BloqueId;
  etiqueta: string;
  efectividad: number;
  bajoUmbral: boolean;
}

export interface DetalleCursoBloque {
  cursoId: CursoId;
  nombre: string;
  bloque: BloqueId;
  efectividad: number;
  bajoUmbral: boolean;
  muestra: number;
}

export interface DatosRadarDominio {
  fuente: FuenteRadarDominio;
  umbralSeguridad: number;
  datosSuficientes: boolean;
  mensajeFaltanDatos: string | null;
  ejes: EjeBloqueRadar[];
  porCurso: DetalleCursoBloque[];
}

const ETIQUETAS_BLOQUE: Readonly<Record<BloqueId, string>> = {
  aptitud: 'Aptitud',
  matematica: 'Matemática',
  letras: 'Letras',
  ciencias: 'Ciencias',
};

export function calcularDatosRadarDominio(params: {
  fuente: FuenteRadarDominio;
  fechaHoy: FechaISO;
  carreraId: string;
  umbralSeguridad: number;
  simulacros: readonly SimulacroAnalitico[];
  practices: readonly PracticaAnalitica[];
}): DatosRadarDominio {
  const { fuente, fechaHoy, carreraId, umbralSeguridad, simulacros, practices } = params;
  let area: AreaId;
  try {
    area = buscarCarrera(carreraId).area;
  } catch {
    area = 'A';
  }

  const obtenidoPorCurso = new Map<CursoId, number>();
  const maximoPorCurso = new Map<CursoId, number>();
  const muestraPorCurso = new Map<CursoId, number>();

  if (fuente === 'simulacros') {
    const conDesglose = simulacros.filter((s) => Object.keys(s.porCurso).length > 0);
    for (const sim of conDesglose) {
      const regla = REGLAS_EVALUACION[sim.tipo];
      for (const cid of CURSO_IDS) {
        const resp = sim.porCurso[cid];
        if (!resp) continue;
        const esperadas = preguntasEsperadasPorClave(sim.tipo, area, cid);
        if (esperadas <= 0) continue;
        const maxPts = esperadas * regla.buena;
        const pts = Math.max(0, resp.ok * regla.buena - resp.bad * regla.mala);
        obtenidoPorCurso.set(cid, (obtenidoPorCurso.get(cid) ?? 0) + pts);
        maximoPorCurso.set(cid, (maximoPorCurso.get(cid) ?? 0) + maxPts);
        muestraPorCurso.set(cid, (muestraPorCurso.get(cid) ?? 0) + resp.ok + resp.bad);
      }
    }

    const totalMuestra = Array.from(muestraPorCurso.values()).reduce((a, b) => a + b, 0);
    if (conDesglose.length === 0 || totalMuestra < 10) {
      return {
        fuente,
        umbralSeguridad,
        datosSuficientes: false,
        mensajeFaltanDatos:
          'Faltan datos: registra al menos 1 simulacro con desglose por curso para mostrar el Radar de Dominio.',
        ejes: [],
        porCurso: [],
      };
    }
  } else {
    const desde30d = sumarDias(fechaHoy, -29);
    let totalPreguntas30d = 0;
    for (const p of practices) {
      if (p.cursoId === 'mix' || p.sinDetalle) continue;
      if (p.fecha < desde30d || p.fecha > fechaHoy) continue;
      const tot = p.ok + p.bad;
      totalPreguntas30d += tot;
      obtenidoPorCurso.set(p.cursoId, (obtenidoPorCurso.get(p.cursoId) ?? 0) + p.ok);
      maximoPorCurso.set(p.cursoId, (maximoPorCurso.get(p.cursoId) ?? 0) + tot);
      muestraPorCurso.set(p.cursoId, (muestraPorCurso.get(p.cursoId) ?? 0) + tot);
    }

    if (totalPreguntas30d < 20) {
      const faltan = Math.max(1, 20 - totalPreguntas30d);
      return {
        fuente,
        umbralSeguridad,
        datosSuficientes: false,
        mensajeFaltanDatos: `Faltan datos: registra ${faltan} preguntas más en los últimos 30 días para proyectar el Radar de Dominio.`,
        ejes: [],
        porCurso: [],
      };
    }
  }

  const porCurso: DetalleCursoBloque[] = CURSOS.map((c) => {
    const obt = obtenidoPorCurso.get(c.id) ?? 0;
    const max = maximoPorCurso.get(c.id) ?? 0;
    const muestra = muestraPorCurso.get(c.id) ?? 0;
    const efectividad = max > 0 ? Math.round((obt / max) * 1000) / 10 : 0;
    return {
      cursoId: c.id,
      nombre: c.nombre,
      bloque: c.bloque,
      efectividad,
      bajoUmbral: efectividad < umbralSeguridad,
      muestra,
    };
  });

  const ejes: EjeBloqueRadar[] = BLOQUES.map((bloque) => {
    const cursosBloque = CURSOS.filter((c) => c.bloque === bloque);
    let obtBloque = 0;
    let maxBloque = 0;
    for (const c of cursosBloque) {
      obtBloque += obtenidoPorCurso.get(c.id) ?? 0;
      maxBloque += maximoPorCurso.get(c.id) ?? 0;
    }
    const efectividad = maxBloque > 0 ? Math.round((obtBloque / maxBloque) * 1000) / 10 : 0;
    return {
      bloque,
      etiqueta: ETIQUETAS_BLOQUE[bloque],
      efectividad,
      bajoUmbral: efectividad < umbralSeguridad,
    };
  });

  return {
    fuente,
    umbralSeguridad,
    datosSuficientes: true,
    mensajeFaltanDatos: null,
    ejes,
    porCurso,
  };
}

// ---------------------------------------------------------------------------
// 4. Autopsia de Errores (Donut por categoría o por grupo Cognitivo/Procedimental/Mixto)
// ---------------------------------------------------------------------------

export type ModoAgrupacionAutopsia = 'categoria' | 'grupo';
export type PeriodoAutopsia = '7d' | '30d' | 'ciclo';

export interface SegmentoAutopsia {
  clave: string;
  etiqueta: string;
  cantidad: number;
  porcentaje: number;
  tokenColor: string;
}

export interface DatosAutopsiaErrores {
  segmentos: SegmentoAutopsia[];
  totalClasificados: number;
  porClasificar: number;
}

export function calcularAutopsiaErrores(params: {
  mistakes: readonly ErrorAnalitico[];
  agrupacion: ModoAgrupacionAutopsia;
  periodo: PeriodoAutopsia;
  cursoFiltro: CursoId | 'todos';
  fechaHoy: FechaISO;
}): DatosAutopsiaErrores {
  const { mistakes, agrupacion, periodo, cursoFiltro, fechaHoy } = params;
  const fechaMin =
    periodo === '7d'
      ? sumarDias(fechaHoy, -6)
      : periodo === '30d'
        ? sumarDias(fechaHoy, -29)
        : '0000-01-01';

  const filtrados = mistakes.filter((m) => {
    if (cursoFiltro !== 'todos' && m.cursoId !== cursoFiltro) return false;
    const f = m.fecha ?? (m.creadoEn ? new Date(m.creadoEn).toISOString().slice(0, 10) : fechaHoy);
    return f >= fechaMin && f <= fechaHoy;
  });

  const porClasificar = filtrados.filter((m) => m.categoria === null).length;
  const clasificados = filtrados.filter((m) => m.categoria !== null);
  const totalClasificados = clasificados.length;

  const conteoCat: Record<CategoriaErrorDominio, number> = {
    teoria: 0,
    lectura: 0,
    duda: 0,
    calculo: 0,
    tiempo: 0,
  };
  for (const m of clasificados) {
    if (m.categoria) conteoCat[m.categoria] += 1;
  }

  if (agrupacion === 'grupo') {
    const cognitivo = conteoCat.teoria;
    const procedimental = conteoCat.lectura + conteoCat.calculo + conteoCat.tiempo;
    const mixto = conteoCat.duda;
    const base = [
      {
        clave: 'cognitivo',
        etiqueta: 'Cognitivo (Teoría)',
        cantidad: cognitivo,
        tokenColor: 'var(--chart-1)',
      },
      {
        clave: 'procedimental',
        etiqueta: 'Procedimental (Lectura/Cálculo/Tiempo)',
        cantidad: procedimental,
        tokenColor: 'var(--chart-2)',
      },
      { clave: 'mixto', etiqueta: 'Mixto (Duda)', cantidad: mixto, tokenColor: 'var(--chart-3)' },
    ];
    return {
      segmentos: base.map((s) => ({
        ...s,
        porcentaje:
          totalClasificados > 0 ? Math.round((s.cantidad / totalClasificados) * 1000) / 10 : 0,
      })),
      totalClasificados,
      porClasificar,
    };
  }

  const baseCat = [
    {
      clave: 'teoria',
      etiqueta: 'Falta de teoría',
      cantidad: conteoCat.teoria,
      tokenColor: 'var(--chart-1)',
    },
    {
      clave: 'lectura',
      etiqueta: 'Mala lectura',
      cantidad: conteoCat.lectura,
      tokenColor: 'var(--chart-2)',
    },
    {
      clave: 'duda',
      etiqueta: 'Duda entre 2',
      cantidad: conteoCat.duda,
      tokenColor: 'var(--chart-3)',
    },
    {
      clave: 'calculo',
      etiqueta: 'Error de cálculo',
      cantidad: conteoCat.calculo,
      tokenColor: 'var(--chart-4)',
    },
    {
      clave: 'tiempo',
      etiqueta: 'Falta de tiempo',
      cantidad: conteoCat.tiempo,
      tokenColor: 'var(--chart-5)',
    },
  ];

  return {
    segmentos: baseCat.map((s) => ({
      ...s,
      porcentaje:
        totalClasificados > 0 ? Math.round((s.cantidad / totalClasificados) * 1000) / 10 : 0,
    })),
    totalClasificados,
    porClasificar,
  };
}
