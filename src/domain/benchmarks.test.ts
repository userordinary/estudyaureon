import { describe, expect, it } from 'vitest';
import { buscarCarrera, FACTORES_ESTIMACION, referenciasDeCarrera } from './benchmarks';
import { CARRERAS } from './data';

describe('referenciasDeCarrera', () => {
  it('Medicina Humana devuelve los datos oficiales del legacy', () => {
    const r = referenciasDeCarrera('medicina-humana');
    expect(r.esOficial).toBe(true);
    expect(r.ultimo).toEqual([242.976, 315.95, 426.616, 640.8, 1626.342]);
    expect(r.primero).toEqual([259.32, 337.075, 441.898, 714.35, 1752.643]);
  });

  it('sin datos oficiales estima con 15/20/25/40/100 % del puntaje de admisión', () => {
    const r = referenciasDeCarrera('obstetricia'); // admMin 978, admMax 1281.75
    expect(r.esOficial).toBe(false);
    expect(r.ultimo).toEqual([146.7, 195.6, 244.5, 391.2, 978]);
    expect(r.primero).toEqual([192.263, 256.35, 320.438, 512.7, 1281.75]);
  });

  it('los factores de estimación suman 100 % en las 4 evaluaciones', () => {
    const [a, b, c, d, total] = FACTORES_ESTIMACION;
    expect(a + b + c + d).toBeCloseTo(total, 12);
  });

  it('toda carrera devuelve series de 5 valores con 3 decimales como máximo', () => {
    for (const c of CARRERAS) {
      const r = referenciasDeCarrera(c.id);
      for (const v of [...r.ultimo, ...r.primero]) {
        expect(v.toString()).toMatch(/^\d+(\.\d{1,3})?$/);
      }
      expect(r.ultimo).toHaveLength(5);
      expect(r.primero).toHaveLength(5);
    }
  });

  it('lanza error con una carrera desconocida (no cae en Medicina como el v4)', () => {
    expect(() => referenciasDeCarrera('astronautica')).toThrow(/desconocida/);
    expect(() => buscarCarrera('')).toThrow();
  });
});
