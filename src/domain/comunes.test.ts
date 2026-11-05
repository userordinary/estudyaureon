import { describe, expect, it } from 'vitest';
import { aMilesimas, redondear3, sumar3 } from './redondeo';
import { diaDeSemana, diasEntre, esFechaISO, fechaEnLima, lunesDe, sumarDias } from './fechas';

describe('redondeo a 3 decimales', () => {
  it('redondea mitad lejos de cero sin errores de coma flotante', () => {
    expect(redondear3(1.0005)).toBe(1.001);
    expect(redondear3(-1.0005)).toBe(-1.001);
    expect(redondear3(0.1 + 0.2)).toBe(0.3);
    expect(redondear3(192.2625)).toBe(192.263);
    expect(redondear3(-0.0001)).toBe(0);
  });

  it('suma exacta por milésimas', () => {
    expect(sumar3([0.1, 0.2])).toBe(0.3);
    expect(sumar3([242.976, 315.95, 426.616, 640.8])).toBe(1626.342);
    expect(aMilesimas(-0.168)).toBe(-168);
  });

  it('rechaza valores no finitos', () => {
    expect(() => redondear3(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('fechas de calendario', () => {
  it('valida fechas reales', () => {
    expect(esFechaISO('2026-11-02')).toBe(true);
    expect(esFechaISO('2027-02-29')).toBe(false);
    expect(esFechaISO('2026-1-2')).toBe(false);
  });

  it('calcula días, lunes y día de la semana', () => {
    expect(diasEntre('2026-11-02', '2027-03-07')).toBe(125);
    expect(diaDeSemana('2026-12-06')).toBe(6);
    expect(lunesDe('2026-12-06')).toBe('2026-11-30');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('fechaEnLima usa la zona America/Lima (UTC−5)', () => {
    expect(fechaEnLima(new Date('2026-11-02T03:00:00Z'))).toBe('2026-11-01');
    expect(fechaEnLima(new Date('2026-11-02T05:00:00Z'))).toBe('2026-11-02');
  });
});
