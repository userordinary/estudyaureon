/**
 * Aritmética de puntajes con 3 decimales. Los puntajes de admisión se definen por milésimas,
 * así que internamente se suman como enteros de milésimas para evitar ruido de coma flotante.
 */

function asegurarFinito(x: number, nombre: string): void {
  if (!Number.isFinite(x))
    throw new RangeError(`${nombre} debe ser un número finito (recibido ${x})`);
}

/** Redondeo a 3 decimales, mitad lejos de cero, robusto ante ruido de coma flotante. */
export function redondear3(x: number): number {
  asegurarFinito(x, 'valor');
  const abs = Math.abs(x).toFixed(9);
  const r = Number(`${Math.round(Number(`${abs}e3`))}e-3`);
  return x < 0 && r !== 0 ? -r : r;
}

/** Convierte un puntaje a milésimas enteras. */
export function aMilesimas(x: number): number {
  asegurarFinito(x, 'valor');
  return Math.round(Number(`${Math.abs(x).toFixed(9)}e3`)) * (x < 0 ? -1 : 1);
}

/** Convierte milésimas enteras a puntaje. */
export function deMilesimas(m: number): number {
  if (!Number.isInteger(m)) throw new RangeError(`milésimas debe ser entero (recibido ${m})`);
  return m === 0 ? 0 : m / 1000;
}

/** Suma exacta a 3 decimales. */
export function sumar3(valores: readonly number[]): number {
  return deMilesimas(valores.reduce((s, v) => s + aMilesimas(v), 0));
}
