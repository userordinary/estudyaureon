/**
 * Reglas puras del dominio para `cursos` (PROMPT 6):
 * - Estados de tema S1–S18: 'pendiente' | 'trabajado' | 'progreso' | 'dominado'
 * - Transición automática a 'trabajado' al registrar práctica
 * - Regla pura de sugerencia de 'dominado' (sin aplicarla automáticamente):
 *   >= 85 % de precisión en >= 20 preguntas y 0 errores abiertos del tema
 * - Filtros de temario: "hasta mi evaluación actual", "las 18 semanas", "solo pendientes"
 */
import { PESOS_AREA, REGLAS_EVALUACION, type Tema } from './data';
import { redondear3 } from './redondeo';
import type { AreaId, CursoId, EvalCepreId } from './tipos';

export type EstadoTemaDominio = 'pendiente' | 'trabajado' | 'progreso' | 'dominado';

export type FiltroTemasCurso = 'hasta_evaluacion' | 'todas_18' | 'solo_pendientes';

export const UMBRAL_PRECISION_SUGERIR_DOMINADO = 0.85;
export const MIN_PREGUNTAS_SUGERIR_DOMINADO = 20;

export interface EntradaSugerenciaDominado {
  estadoActual: EstadoTemaDominio;
  ok: number;
  bad: number;
  erroresAbiertos: number;
}

export interface EvaluacionSugerenciaDominado {
  /** `true` únicamente cuando se cumplen las 3 condiciones y aún no está en 'dominado'. */
  sugerir: boolean;
  totalPreguntas: number;
  /** Ratio en `[0, 1]`, o `null` si `totalPreguntas === 0`. */
  precisionRatio: number | null;
  /** Precisión en porcentaje `[0, 100]` redondeada a 1 decimal, o `null` si `totalPreguntas === 0`. */
  precisionPorcentaje: number | null;
  cumplePreguntas: boolean;
  cumplePrecision: boolean;
  cumpleSinErrores: boolean;
  motivo: string;
}

/**
 * El tema pasa a 'trabajado' al registrar práctica si estaba 'pendiente' (o sin estado).
 * Los estados 'progreso' y 'dominado' los decide el usuario y no se sobrescriben.
 */
export function estadoTemaAlRegistrarPractica(
  estadoPrevio: EstadoTemaDominio | null | undefined,
): EstadoTemaDominio {
  if (!estadoPrevio || estadoPrevio === 'pendiente') {
    return 'trabajado';
  }
  return estadoPrevio;
}

/**
 * Evalúa de forma pura si debe sugerirse (sin aplicar) el estado 'dominado' para un tema:
 * - `>= 85 %` de precisión (`ok / (ok + bad) >= 0.85`)
 * - `>= 20` preguntas resueltas (`ok + bad >= 20`)
 * - `0` errores abiertos del tema (`erroresAbiertos === 0`)
 * - `estadoActual !== 'dominado'`
 */
export function evaluarSugerenciaDominado(
  entrada: EntradaSugerenciaDominado,
): EvaluacionSugerenciaDominado {
  const ok = Math.max(0, Math.trunc(entrada.ok));
  const bad = Math.max(0, Math.trunc(entrada.bad));
  const erroresAbiertos = Math.max(0, Math.trunc(entrada.erroresAbiertos));
  const totalPreguntas = ok + bad;

  const precisionRatio = totalPreguntas > 0 ? redondear3(ok / totalPreguntas) : null;
  const precisionPorcentaje =
    precisionRatio !== null ? Math.round(precisionRatio * 1000) / 10 : null;

  const cumplePreguntas = totalPreguntas >= MIN_PREGUNTAS_SUGERIR_DOMINADO;
  const cumplePrecision =
    totalPreguntas > 0 && ok * 100 >= totalPreguntas * (UMBRAL_PRECISION_SUGERIR_DOMINADO * 100);
  const cumpleSinErrores = erroresAbiertos === 0;

  const sugerir =
    entrada.estadoActual !== 'dominado' && cumplePreguntas && cumplePrecision && cumpleSinErrores;

  let motivo: string;
  if (entrada.estadoActual === 'dominado') {
    motivo = 'El tema ya está marcado como dominado.';
  } else if (sugerir) {
    motivo = `Sugerido: Dominado (${precisionPorcentaje}% en ${totalPreguntas} preg · 0 errores abiertos).`;
  } else if (!cumplePreguntas) {
    motivo = `Faltan ${MIN_PREGUNTAS_SUGERIR_DOMINADO - totalPreguntas} pregunta(s) para evaluar dominio (${totalPreguntas}/${MIN_PREGUNTAS_SUGERIR_DOMINADO}).`;
  } else if (!cumplePrecision) {
    motivo = `Precisión actual ${precisionPorcentaje}% (requiere >= 85%).`;
  } else {
    motivo = `Tienes ${erroresAbiertos} error(es) abierto(s) en este tema.`;
  }

  return {
    sugerir,
    totalPreguntas,
    precisionRatio,
    precisionPorcentaje,
    cumplePreguntas,
    cumplePrecision,
    cumpleSinErrores,
    motivo,
  };
}

/**
 * Filtra los temas S1–S18 de un curso según el filtro activo:
 * - 'hasta_evaluacion': semanas <= tope de la evaluación activa (S4, S8, S13 o S18)
 * - 'todas_18': las 18 semanas completas
 * - 'solo_pendientes': únicamente los temas cuyo estado actual es 'pendiente'
 */
export function filtrarTemasCurso(
  temas: readonly Tema[],
  filtro: FiltroTemasCurso,
  evaluacionActiva: EvalCepreId,
  estadosPorTema: Readonly<Record<string, EstadoTemaDominio>>,
): Tema[] {
  const semanaTope = REGLAS_EVALUACION[evaluacionActiva].semanas[1];

  return temas.filter((t) => {
    if (filtro === 'hasta_evaluacion') {
      return t.semana <= semanaTope;
    }
    if (filtro === 'solo_pendientes') {
      const est = estadosPorTema[t.id] ?? 'pendiente';
      return est === 'pendiente';
    }
    return true;
  });
}

/**
 * Meta semanal de preguntas de un curso: usa la meta personalizada si existe,
 * o deriva una meta proporcional a su peso en el área.
 */
export function metaSemanalCursoEfectiva(
  cursoId: CursoId,
  area: AreaId,
  evaluacionActiva: EvalCepreId,
  metasPersonalizadas: Readonly<Partial<Record<CursoId, number>>>,
): number {
  const personalizada = metasPersonalizadas[cursoId];
  if (personalizada !== undefined && personalizada > 0) {
    return Math.trunc(personalizada);
  }
  const regla = REGLAS_EVALUACION[evaluacionActiva];
  const peso =
    cursoId === 'hv' ? regla.hv : cursoId === 'hm' ? regla.hm : (PESOS_AREA[area][cursoId] ?? 2);
  return Math.max(10, peso * 4);
}
