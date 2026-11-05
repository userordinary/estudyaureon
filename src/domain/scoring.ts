/**
 * Cálculo de puntaje de una evaluación CEPRE o simulacro de admisión.
 *
 * Reglas (100 preguntas c/u):
 *  - cepre1: +3.00 / −0.168, máx 300 · 15 HV + 15 HM + 70 Conocimientos
 *  - cepre2: +4.00 / −0.225, máx 400 · 15 HV + 15 HM + 70 Conocimientos
 *  - cepre3: +5.00 / −0.282, máx 500 · 15 HV + 15 HM + 70 Conocimientos
 *  - cepre4: +8.00 / −0.450, máx 800 · 10 Actitudinal + 10 HV + 10 HM + 70 Conocimientos
 *  - admision: +20 / −1.125, máx 2000 · misma estructura que cepre4
 * En blanco = 0. Resultado redondeado a 3 decimales.
 */
import { cursoPorId, REGLAS_EVALUACION, type ReglaEvaluacion } from './data';
import { aMilesimas, deMilesimas } from './redondeo';
import { CURSO_IDS, type CursoId, type EvalCepreId, type TipoEval } from './tipos';

export interface Respuestas {
  ok: number;
  bad: number;
  /** Opcional e informativo: los blancos siempre se derivan de la capacidad de la sección. */
  blanco?: number;
}

export type SeccionPuntaje = 'act' | 'hab' | 'conoc';

export interface Secciones {
  /** Actitudinal: solo existe en cepre4 y admision. */
  act?: Respuestas;
  /** Habilidades: HV + HM. */
  hab: Respuestas;
  /** Conocimientos: 70 preguntas repartidas entre 17 cursos. */
  conoc: Respuestas;
}

/** Clave del desglose por curso: un curso o 'act' (Actitudinal, que no es un curso). */
export type ClavePorCurso = CursoId | 'act';
export type PorCurso = Partial<Record<ClavePorCurso, Respuestas>>;

export type EntradaPuntaje = { secciones: Secciones } | { porCurso: PorCurso };

export interface ResultadoPuntaje {
  act: number;
  hab: number;
  conoc: number;
  total: number;
  buenas: number;
  malas: number;
  blancos: number;
}

export type Capacidad = Readonly<Record<SeccionPuntaje, number>>;

export function reglaDe(tipo: TipoEval): ReglaEvaluacion {
  return REGLAS_EVALUACION[tipo];
}

/** Número de preguntas por sección para un tipo de evaluación. */
export function capacidadSecciones(tipo: TipoEval): Capacidad {
  const r = reglaDe(tipo);
  const hab = r.hv + r.hm;
  return { act: r.actitudinal, hab, conoc: r.preguntas - r.actitudinal - hab };
}

export function puntajeMaximo(tipo: TipoEval): number {
  return reglaDe(tipo).max;
}

/**
 * Peso informativo de cada evaluación sobre los 2000 puntos del ciclo (15/20/25/40 %).
 * SOLO para mostrar: el acumulado nunca se multiplica por esto.
 */
export function porcentajeInformativo(tipo: EvalCepreId): number {
  return (reglaDe(tipo).max / 2000) * 100;
}

function validarRespuestas(r: Respuestas, donde: string): void {
  for (const [campo, v] of [
    ['ok', r.ok],
    ['bad', r.bad],
    ['blanco', r.blanco ?? 0],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) {
      throw new RangeError(`${donde}.${campo} debe ser un entero ≥ 0 (recibido ${v})`);
    }
  }
}

const esClavePorCurso = (k: string): k is ClavePorCurso =>
  k === 'act' || (CURSO_IDS as readonly string[]).includes(k);

/** Agrega un desglose por curso en las 3 secciones del examen. */
export function seccionesDesdePorCurso(porCurso: PorCurso): Secciones {
  const acc: Record<SeccionPuntaje, Required<Respuestas>> = {
    act: { ok: 0, bad: 0, blanco: 0 },
    hab: { ok: 0, bad: 0, blanco: 0 },
    conoc: { ok: 0, bad: 0, blanco: 0 },
  };
  for (const [clave, r] of Object.entries(porCurso)) {
    if (!esClavePorCurso(clave)) throw new RangeError(`Curso desconocido en porCurso: ${clave}`);
    if (!r) continue;
    validarRespuestas(r, `porCurso.${clave}`);
    const seccion: SeccionPuntaje =
      clave === 'act' ? 'act' : cursoPorId(clave).seccion === 'habilidades' ? 'hab' : 'conoc';
    acc[seccion].ok += r.ok;
    acc[seccion].bad += r.bad;
    acc[seccion].blanco += r.blanco ?? 0;
  }
  return acc;
}

export function calcularPuntaje(tipo: TipoEval, entrada: EntradaPuntaje): ResultadoPuntaje {
  const regla = reglaDe(tipo);
  const cap = capacidadSecciones(tipo);
  const secciones =
    'secciones' in entrada ? entrada.secciones : seccionesDesdePorCurso(entrada.porCurso);
  const buenaM = aMilesimas(regla.buena);
  const malaM = aMilesimas(regla.mala);

  const parcial = (
    seccion: SeccionPuntaje,
  ): { m: number; ok: number; bad: number; blancos: number } => {
    const r = secciones[seccion] ?? { ok: 0, bad: 0 };
    validarRespuestas(r, seccion);
    const usadas = r.ok + r.bad + (r.blanco ?? 0);
    if (usadas > cap[seccion]) {
      throw new RangeError(
        `${seccion}: ${usadas} respuestas superan las ${cap[seccion]} preguntas de ${regla.nombre}`,
      );
    }
    return {
      m: r.ok * buenaM - r.bad * malaM,
      ok: r.ok,
      bad: r.bad,
      blancos: cap[seccion] - r.ok - r.bad,
    };
  };

  const act = parcial('act');
  const hab = parcial('hab');
  const conoc = parcial('conoc');

  return {
    act: deMilesimas(act.m),
    hab: deMilesimas(hab.m),
    conoc: deMilesimas(conoc.m),
    total: deMilesimas(act.m + hab.m + conoc.m),
    buenas: act.ok + hab.ok + conoc.ok,
    malas: act.bad + hab.bad + conoc.bad,
    blancos: act.blancos + hab.blancos + conoc.blancos,
  };
}
