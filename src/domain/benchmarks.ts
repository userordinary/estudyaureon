/**
 * Referencias de corte por carrera (último y primer puesto por evaluación y total).
 * Si la carrera no tiene datos oficiales CEPRE se usa la estimación del v4:
 * 15/20/25/40/100 % del puntaje de admisión (admMin para el último, admMax para el primero).
 */
import { CARRERAS, type Carrera } from './data';
import { redondear3 } from './redondeo';
import type { Serie5 } from './tipos';

export const FACTORES_ESTIMACION: Serie5 = [0.15, 0.2, 0.25, 0.4, 1];

export interface Referencias {
  /** Último puesto con vacante: [e1, e2, e3, e4, total]. */
  ultimo: Serie5;
  /** Primer puesto: [e1, e2, e3, e4, total]. */
  primero: Serie5;
  /** false = estimado a partir del puntaje de admisión. */
  esOficial: boolean;
}

export function buscarCarrera(carreraId: string): Carrera {
  const c = CARRERAS.find((x) => x.id === carreraId);
  if (!c) throw new Error(`Carrera desconocida: ${carreraId}`);
  return c;
}

function estimar(base: number): Serie5 {
  const [a, b, c, d, e] = FACTORES_ESTIMACION.map((f) => redondear3(base * f)) as [
    number,
    number,
    number,
    number,
    number,
  ];
  return [a, b, c, d, e];
}

export function referenciasDeCarrera(carreraId: string): Referencias {
  const c = buscarCarrera(carreraId);
  return {
    ultimo: c.cepreLast ?? estimar(c.admMin),
    primero: c.cepreFirst ?? estimar(c.admMax),
    esOficial: c.cepreLast !== null,
  };
}
