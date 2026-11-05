/**
 * Identificadores y uniones del dominio. Todo lo demás se deriva de aquí y de src/domain/data.
 */

export const TIPOS_EVAL = ['cepre1', 'cepre2', 'cepre3', 'cepre4', 'admision'] as const;
export type TipoEval = (typeof TIPOS_EVAL)[number];

/** Las 4 evaluaciones que forman el acumulado CEPRE (en orden cronológico). */
export const EVALUACIONES_CEPRE = ['cepre1', 'cepre2', 'cepre3', 'cepre4'] as const;
export type EvalCepreId = (typeof EVALUACIONES_CEPRE)[number];

export const AREAS = ['A', 'B', 'C', 'D', 'E'] as const;
export type AreaId = (typeof AREAS)[number];

export const BLOQUES = ['aptitud', 'matematica', 'letras', 'ciencias'] as const;
export type BloqueId = (typeof BLOQUES)[number];

export const SECCIONES_CURSO = ['habilidades', 'conocimientos'] as const;
export type SeccionCurso = (typeof SECCIONES_CURSO)[number];

/** Cursos de Habilidades (HV y HM). */
export const CURSOS_HABILIDADES = ['hv', 'hm'] as const;

/** Los 17 cursos que reparten los 70 Conocimientos. */
export const CURSOS_CONOCIMIENTOS = [
  'arit',
  'alg',
  'geom',
  'trig',
  'leng',
  'lit',
  'psic',
  'civ',
  'hperu',
  'huniv',
  'geog',
  'econ',
  'filo',
  'fis',
  'quim',
  'bio',
  'anat',
] as const;
export type CursoConocimientoId = (typeof CURSOS_CONOCIMIENTOS)[number];

export const CURSO_IDS = [...CURSOS_HABILIDADES, ...CURSOS_CONOCIMIENTOS] as const;
export type CursoId = (typeof CURSO_IDS)[number];

/** Serie de 5 valores por evaluación: [e1, e2, e3, e4, total/admisión]. */
export type Serie5 = readonly [number, number, number, number, number];

/** Serie de 4 valores, una por evaluación CEPRE. */
export type Serie4 = readonly [number, number, number, number];

/** Fecha de calendario en formato 'YYYY-MM-DD' (día local de Lima). */
export type FechaISO = string;
