/**
 * Temporizador de enfoque (Deep Work):
 * - Duraciones por modo (sprint 25/5, inmersion 50/10, simulacro 90/15)
 * - Descanso ajustado por fatiga (+5 min si fatiga es 4 o 5)
 * - Cálculo puro por marca de tiempo (sobrevive a recargas y pestañas en segundo plano)
 * - Selector puro de calidad de enfoque (distracciones por hora)
 */
import { redondear3 } from './redondeo';

export type ModoTemporizado = 'sprint' | 'inmersion' | 'simulacro';
export type ModoEnfoque = ModoTemporizado | 'manual';

export interface Duraciones {
  /** Minutos de enfoque. */
  enfoque: number;
  /** Minutos de descanso base. */
  descanso: number;
}

export const DURACIONES: Readonly<Record<ModoTemporizado, Readonly<Duraciones>>> = {
  sprint: { enfoque: 25, descanso: 5 },
  inmersion: { enfoque: 50, descanso: 10 },
  simulacro: { enfoque: 90, descanso: 15 },
};

export function duracionesPorModo(modo: ModoTemporizado): Duraciones {
  return { ...DURACIONES[modo] };
}

export type Fatiga = 1 | 2 | 3 | 4 | 5;

export const UMBRAL_FATIGA_ALTA = 4;
export const MINUTOS_EXTRA_FATIGA = 5;
export const TIMEOUT_POPUP_FATIGA_MS = 8_000;

export function esFatiga(x: unknown): x is Fatiga {
  return typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 5;
}

/** Descanso base + 5 min si la fatiga reportada es 4 o 5. Sin reporte (null) = descanso base. */
export function descansoAjustado(descansoBase: number, fatiga: Fatiga | null): number {
  if (!Number.isFinite(descansoBase) || descansoBase < 0) {
    throw new RangeError(`Descanso base inválido: ${descansoBase}`);
  }
  if (fatiga === null) return descansoBase;
  if (!esFatiga(fatiga)) throw new RangeError(`Fatiga debe ser 1–5 (recibido ${String(fatiga)})`);
  return fatiga >= UMBRAL_FATIGA_ALTA ? descansoBase + MINUTOS_EXTRA_FATIGA : descansoBase;
}

// ---------------------------------------------------------------------------
// Cálculo puro por marca de tiempo (sobrevive a recargas y segundo plano)
// ---------------------------------------------------------------------------

export type FaseTemporizador = 'enfoque' | 'descanso' | 'completado';

export interface MarcaTiempoTemporizador {
  fase: FaseTemporizador;
  /** Duración total configurada para la fase actual en milisegundos. */
  duracionTotalMs: number;
  /** Timestamp (epoch ms) en que inició el tramo activo actual, o `null` si está en pausa. */
  inicioTramoMs: number | null;
  /** Milisegundos ya acumulados antes de la pausa o en tramos previos de la misma fase. */
  acumuladoPrevioMs: number;
}

export interface ProgresoTemporizador {
  transcurridoMs: number;
  restanteMs: number;
  transcurridoSegundos: number;
  restanteSegundos: number;
  /** Razón en `[0, 1]` de avance de la fase. */
  progreso: number;
  /** Porcentaje en `[0, 100]`. */
  porcentaje: number;
  /** `true` cuando `transcurridoMs >= duracionTotalMs`. */
  faseTerminada: boolean;
  /** Minutos de enfoque/descanso efectivamente transcurridos (redondeados al entero más cercano). */
  minutosTranscurridos: number;
}

/**
 * Calcula de forma 100 % pura el estado del temporizador en `ahoraMs` a partir de su marca de tiempo.
 * Permite reconstruir el tiempo exacto tras recargar la página o volver de una pestaña en segundo plano.
 */
export function calcularProgresoTemporizador(
  marca: MarcaTiempoTemporizador,
  ahoraMs: number,
): ProgresoTemporizador {
  const totalMs = Math.max(1_000, Math.trunc(marca.duracionTotalMs));
  const tramoActivoMs =
    marca.inicioTramoMs !== null ? Math.max(0, ahoraMs - marca.inicioTramoMs) : 0;
  const transcurridoBrutoMs = Math.max(0, marca.acumuladoPrevioMs + tramoActivoMs);
  const transcurridoMs = Math.min(totalMs, transcurridoBrutoMs);
  const restanteMs = Math.max(0, totalMs - transcurridoMs);

  const transcurridoSegundos = Math.floor(transcurridoMs / 1_000);
  const restanteSegundos = Math.ceil(restanteMs / 1_000);
  const progreso = Math.max(0, Math.min(1, transcurridoMs / totalMs));
  const porcentaje = Math.round(progreso * 100);
  const faseTerminada = transcurridoBrutoMs >= totalMs;
  const minutosTranscurridos = Math.max(faseTerminada ? 1 : 0, Math.round(transcurridoMs / 60_000));

  return {
    transcurridoMs,
    restanteMs,
    transcurridoSegundos,
    restanteSegundos,
    progreso,
    porcentaje,
    faseTerminada,
    minutosTranscurridos,
  };
}

export function pausarMarcaTiempo(
  marca: MarcaTiempoTemporizador,
  ahoraMs: number,
): MarcaTiempoTemporizador {
  if (marca.inicioTramoMs === null) return { ...marca };
  const tramoMs = Math.max(0, ahoraMs - marca.inicioTramoMs);
  return {
    ...marca,
    inicioTramoMs: null,
    acumuladoPrevioMs: Math.min(marca.duracionTotalMs, marca.acumuladoPrevioMs + tramoMs),
  };
}

export function reanudarMarcaTiempo(
  marca: MarcaTiempoTemporizador,
  ahoraMs: number,
): MarcaTiempoTemporizador {
  if (marca.inicioTramoMs !== null) return { ...marca };
  return {
    ...marca,
    inicioTramoMs: ahoraMs,
  };
}

export function formatearRelojMMSS(segundosTotales: number): string {
  const seg = Math.max(0, Math.trunc(segundosTotales));
  const mm = Math.floor(seg / 60);
  const ss = seg % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Calidad de enfoque = distracciones por hora (selector puro)
// ---------------------------------------------------------------------------

export interface EntradaCalidadEnfoque {
  minutosEnfoque: number;
  distracciones: number;
}

export interface ResumenCalidadEnfoque {
  totalMinutos: number;
  totalHoras: number;
  totalDistracciones: number;
  /** Distracciones por hora de enfoque (redondeado a 3 decimales), o 0 si `totalMinutos === 0`. */
  distraccionesPorHora: number;
  /** Clasificación pura de calidad: 'alta' (<= 2/h), 'media' (<= 5/h), 'baja' (> 5/h). */
  nivel: 'alta' | 'media' | 'baja';
}

/**
 * Selector puro que calcula la calidad de enfoque como distracciones por hora (`distracciones / horas`).
 */
export function calcularCalidadEnfoque(
  sesiones: readonly EntradaCalidadEnfoque[],
): ResumenCalidadEnfoque {
  let totalMinutos = 0;
  let totalDistracciones = 0;

  for (const s of sesiones) {
    if (s.minutosEnfoque > 0) {
      totalMinutos += s.minutosEnfoque;
    }
    if (s.distracciones > 0) {
      totalDistracciones += s.distracciones;
    }
  }

  if (totalMinutos <= 0) {
    return {
      totalMinutos: 0,
      totalHoras: 0,
      totalDistracciones,
      distraccionesPorHora: 0,
      nivel: 'alta',
    };
  }

  const totalHoras = redondear3(totalMinutos / 60);
  const distraccionesPorHora = redondear3((totalDistracciones * 60) / totalMinutos);
  const nivel: 'alta' | 'media' | 'baja' =
    distraccionesPorHora <= 2 ? 'alta' : distraccionesPorHora <= 5 ? 'media' : 'baja';

  return {
    totalMinutos,
    totalHoras,
    totalDistracciones,
    distraccionesPorHora,
    nivel,
  };
}

/**
 * Representa visualmente el contador de interrupciones internas con palitos agrupados de 5 en 5.
 */
export function formatearPalitosDistraccion(distracciones: number): string {
  const n = Math.max(0, Math.trunc(distracciones));
  if (n === 0) return '—';
  const gruposDeCinco = Math.floor(n / 5);
  const resto = n % 5;
  const partes: string[] = [];
  for (let i = 0; i < gruposDeCinco; i++) {
    partes.push('||||/');
  }
  if (resto > 0) {
    partes.push('|'.repeat(resto));
  }
  return partes.join(' ');
}
