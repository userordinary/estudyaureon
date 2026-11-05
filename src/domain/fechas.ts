/**
 * Utilidades de fecha de calendario. Trabajan con cadenas 'YYYY-MM-DD' (día de Lima) para que
 * el resultado no dependa de la zona horaria del dispositivo.
 */
import type { FechaISO } from './tipos';

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DIA = 86_400_000;

export const ZONA_HORARIA = 'America/Lima';

export function esFechaISO(s: string): boolean {
  const m = RE_FECHA.exec(s);
  if (!m) return false;
  const [, y, mo, d] = m;
  const t = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    t.getUTCFullYear() === Number(y) &&
    t.getUTCMonth() === Number(mo) - 1 &&
    t.getUTCDate() === Number(d)
  );
}

/** Número de día absoluto (días desde 1970-01-01). Lanza RangeError si la fecha no es válida. */
export function diaAbsoluto(fecha: FechaISO): number {
  if (!esFechaISO(fecha)) throw new RangeError(`Fecha inválida: "${fecha}" (se espera YYYY-MM-DD)`);
  const [y, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / MS_DIA;
}

export function deDiaAbsoluto(dia: number): FechaISO {
  return new Date(dia * MS_DIA).toISOString().slice(0, 10);
}

/** Días de calendario de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  return diaAbsoluto(hasta) - diaAbsoluto(desde);
}

export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  return deDiaAbsoluto(diaAbsoluto(fecha) + dias);
}

/** Día de la semana con lunes = 0 … domingo = 6. */
export function diaDeSemana(fecha: FechaISO): number {
  // 1970-01-01 fue jueves (índice 3 con lunes = 0).
  return (((diaAbsoluto(fecha) + 3) % 7) + 7) % 7;
}

export const DIAS_SEMANA = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
] as const;

export type DiaSemana = (typeof DIAS_SEMANA)[number];

export const NOMBRES_DIAS_SEMANA: Readonly<Record<DiaSemana, string>> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

/** Nombre del día de la semana para una fecha ISO (lunes … domingo). */
export function nombreDiaSemana(fecha: FechaISO): DiaSemana {
  return DIAS_SEMANA[diaDeSemana(fecha)] ?? 'lunes';
}

/** Lunes de la semana a la que pertenece `fecha`. */
export function lunesDe(fecha: FechaISO): FechaISO {
  return sumarDias(fecha, -diaDeSemana(fecha));
}

/** Fecha de calendario en Lima para un instante dado. */
export function fechaEnLima(instante: Date): FechaISO {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instante);
  const get = (t: Intl.DateTimeFormatPartTypes): string =>
    partes.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
