/**
 * Acumulado CEPRE, línea requerida y brecha.
 *
 * PONDERACIÓN: el peso de cada evaluación ya está en su escala (300/400/500/800 de 2000).
 * El acumulado es la SUMA DIRECTA de los 4 puntajes. Nunca se multiplica por porcentajes.
 */
import { referenciasDeCarrera } from './benchmarks';
import { REGLAS_EVALUACION } from './data';
import { aMilesimas, deMilesimas, redondear3, sumar3 } from './redondeo';
import { EVALUACIONES_CEPRE, type EvalCepreId, type Serie4, type TipoEval } from './tipos';

export interface ResultadoEvaluacion {
  tipo: TipoEval;
  total: number;
}

export interface AcumuladoReal {
  /** Mejor puntaje por evaluación, o null si aún no se rinde. */
  porEvaluacion: Readonly<Record<EvalCepreId, number | null>>;
  /** Suma directa de los mejores puntajes rendidos. */
  total: number;
  rendidas: readonly EvalCepreId[];
  pendientes: readonly EvalCepreId[];
}

function validarTotal(r: ResultadoEvaluacion): void {
  const regla = REGLAS_EVALUACION[r.tipo];
  const min = -regla.mala * regla.preguntas;
  if (!Number.isFinite(r.total) || r.total > regla.max || r.total < min) {
    throw new RangeError(`Puntaje ${r.total} fuera de rango para ${r.tipo} [${min}, ${regla.max}]`);
  }
}

const esCepre = (t: TipoEval): t is EvalCepreId => t !== 'admision';

/** Mejor intento por tipo de evaluación CEPRE. Los simulacros de admisión no cuentan. */
export function mejorPorTipo(
  resultados: readonly ResultadoEvaluacion[],
): Record<EvalCepreId, number | null> {
  const mejor: Record<EvalCepreId, number | null> = {
    cepre1: null,
    cepre2: null,
    cepre3: null,
    cepre4: null,
  };
  for (const r of resultados) {
    validarTotal(r);
    if (!esCepre(r.tipo)) continue;
    const actual = mejor[r.tipo];
    if (actual === null || r.total > actual) mejor[r.tipo] = redondear3(r.total);
  }
  return mejor;
}

export function acumuladoReal(resultados: readonly ResultadoEvaluacion[]): AcumuladoReal {
  const porEvaluacion = mejorPorTipo(resultados);
  const rendidas = EVALUACIONES_CEPRE.filter((e) => porEvaluacion[e] !== null);
  const pendientes = EVALUACIONES_CEPRE.filter((e) => porEvaluacion[e] === null);
  const total = sumar3(rendidas.map((e) => porEvaluacion[e] ?? 0));
  return { porEvaluacion, total, rendidas, pendientes };
}

export interface LineaRequerida {
  /** Corte acumulado tras cada evaluación (suma acumulada de cepreLast). */
  acumulada: Serie4;
  /** Corte acumulado total (= último valor de `acumulada`). */
  total: number;
  esOficial: boolean;
}

/** Medicina Humana: 242.976, 558.926, 985.542, 1626.342. */
export function lineaRequeridaAcumulada(carreraId: string): LineaRequerida {
  const { ultimo, esOficial } = referenciasDeCarrera(carreraId);
  let m = 0;
  const [a, b, c, d] = [ultimo[0], ultimo[1], ultimo[2], ultimo[3]].map((v) => {
    m += aMilesimas(v);
    return deMilesimas(m);
  }) as [number, number, number, number];
  return { acumulada: [a, b, c, d], total: d, esOficial };
}

export type FuenteObjetivo = 'meta' | 'corte';

export interface Objetivo {
  fuente: FuenteObjetivo;
  total: number;
}

/** Objetivo acumulado: la meta personal si existe; si no, el corte de la carrera. */
export function objetivoTotal(carreraId: string, metaPersonal: number | null): Objetivo {
  if (metaPersonal !== null) {
    if (!Number.isFinite(metaPersonal) || metaPersonal <= 0 || metaPersonal > 2000) {
      throw new RangeError(`Meta personal inválida: ${metaPersonal}`);
    }
    return { fuente: 'meta', total: redondear3(metaPersonal) };
  }
  return { fuente: 'corte', total: lineaRequeridaAcumulada(carreraId).total };
}

/** Brecha exacta = objetivo acumulado total − acumulado real. Positiva = faltan puntos. */
export function brecha(acumuladoTotal: number, objetivo: Objetivo | number): number {
  const meta = typeof objetivo === 'number' ? objetivo : objetivo.total;
  return deMilesimas(aMilesimas(meta) - aMilesimas(acumuladoTotal));
}

export interface MetaSiguiente {
  evaluacion: EvalCepreId;
  /** Puntaje a buscar en la siguiente evaluación. */
  meta: number;
  /** Puntos que faltan para el objetivo (≥ 0). */
  faltante: number;
  /** Suma de los máximos de las evaluaciones pendientes. */
  maxRestante: number;
  /** faltante / maxRestante. > 1 significa que ya no es alcanzable. */
  ratio: number;
  alcanzable: boolean;
  /** Buenas necesarias asumiendo cero malas (tope: preguntas del examen). */
  buenasNecesarias: number;
}

/**
 * Reparte el faltante proporcionalmente al puntaje máximo de las evaluaciones que quedan
 * (lógica del v4). Devuelve null si ya se rindieron las 4.
 */
export function metaSiguienteEvaluacion(
  acumulado: AcumuladoReal,
  objetivo: Objetivo | number,
): MetaSiguiente | null {
  const siguiente = acumulado.pendientes[0];
  if (siguiente === undefined) return null;
  const metaTotal = typeof objetivo === 'number' ? objetivo : objetivo.total;
  const faltante = Math.max(0, brecha(acumulado.total, metaTotal));
  const maxRestante = acumulado.pendientes.reduce((s, e) => s + REGLAS_EVALUACION[e].max, 0);
  const regla = REGLAS_EVALUACION[siguiente];
  const ratio = faltante / maxRestante;
  const meta = redondear3(regla.max * ratio);
  const buenasNecesarias = Math.min(
    regla.preguntas,
    Math.ceil(aMilesimas(meta) / aMilesimas(regla.buena)),
  );
  return {
    evaluacion: siguiente,
    meta,
    faltante,
    maxRestante,
    ratio,
    alcanzable: ratio <= 1,
    buenasNecesarias,
  };
}
