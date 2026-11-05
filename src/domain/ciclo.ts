/**
 * Calendario del ciclo CEPRE: 15 semanas desde el lunes 2026-11-02. Las semanas cambian en lunes.
 * Fechas de evaluación configurables (Settings.fechasEval).
 */
import { REGLAS_EVALUACION } from './data';
import { diaAbsoluto, diasEntre, lunesDe } from './fechas';
import { EVALUACIONES_CEPRE, type EvalCepreId, type FechaISO } from './tipos';

export interface ConfigCiclo {
  /** Lunes de la semana 1. */
  inicio: FechaISO;
  semanas: number;
  fechasEval: Readonly<Record<EvalCepreId, FechaISO>>;
}

export const CICLO_POR_DEFECTO: Readonly<ConfigCiclo> = {
  inicio: '2026-11-02',
  semanas: 15,
  fechasEval: {
    cepre1: '2026-11-29',
    cepre2: '2027-01-10',
    cepre3: '2027-01-31',
    cepre4: '2027-02-28',
  },
};

export type EstadoCiclo = 'antes' | 'en-curso' | 'terminado';

/** Índice de semana sin acotar (puede ser ≤ 0 antes del ciclo o > semanas después). */
function semanaBruta(fecha: FechaISO, cfg: ConfigCiclo): number {
  return diasEntre(lunesDe(cfg.inicio), lunesDe(fecha)) / 7 + 1;
}

export function estadoCiclo(fecha: FechaISO, cfg: ConfigCiclo = CICLO_POR_DEFECTO): EstadoCiclo {
  const s = semanaBruta(fecha, cfg);
  if (s < 1) return 'antes';
  if (fecha > cfg.fechasEval.cepre4) return 'terminado';
  return 'en-curso';
}

/**
 * Semana del ciclo (1…semanas) para una fecha. Fuera del ciclo se acota a los extremos;
 * usa `estadoCiclo` para distinguir "antes"/"terminado".
 */
export function semanaDelCiclo(fecha: FechaISO, cfg: ConfigCiclo = CICLO_POR_DEFECTO): number {
  return Math.min(cfg.semanas, Math.max(1, semanaBruta(fecha, cfg)));
}

/** Evaluación que cubre una semana: S1–4 → cepre1, S5–8 → cepre2, S9–12 → cepre3, S13–15 → cepre4. */
export function evaluacionDeSemana(semana: number): EvalCepreId {
  if (!Number.isInteger(semana) || semana < 1) {
    throw new RangeError(`Semana inválida: ${semana}`);
  }
  const id = EVALUACIONES_CEPRE.find((e) => semana <= REGLAS_EVALUACION[e].semanas[1]);
  return id ?? 'cepre4';
}

/** Evaluación para la que se prepara la semana en curso. */
export function evaluacionActiva(
  fecha: FechaISO,
  cfg: ConfigCiclo = CICLO_POR_DEFECTO,
): EvalCepreId {
  return evaluacionDeSemana(semanaDelCiclo(fecha, cfg));
}

export interface ProximaEvaluacion {
  id: EvalCepreId;
  fecha: FechaISO;
  dias: number;
}

/** Próxima evaluación con fecha ≥ hoy (el mismo día cuenta, con 0 días). `null` si ya pasaron todas. */
export function proximaEvaluacion(
  fecha: FechaISO,
  cfg: ConfigCiclo = CICLO_POR_DEFECTO,
): ProximaEvaluacion | null {
  const hoy = diaAbsoluto(fecha);
  const proximas = EVALUACIONES_CEPRE.map((id) => ({ id, fecha: cfg.fechasEval[id] }))
    .filter((e) => diaAbsoluto(e.fecha) >= hoy)
    .sort((a, b) => diaAbsoluto(a.fecha) - diaAbsoluto(b.fecha));
  const p = proximas[0];
  return p ? { ...p, dias: diasEntre(fecha, p.fecha) } : null;
}

/** Días de calendario que faltan de `desde` a `hasta`; 0 si `hasta` ya pasó. */
export function diasRestantes(desde: FechaISO, hasta: FechaISO): number {
  return Math.max(0, diasEntre(desde, hasta));
}
