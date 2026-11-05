import { describe, expect, it } from 'vitest';
import {
  CICLO_POR_DEFECTO,
  diasRestantes,
  estadoCiclo,
  evaluacionActiva,
  evaluacionDeSemana,
  proximaEvaluacion,
  semanaDelCiclo,
  type ConfigCiclo,
} from './ciclo';
import { deDiaAbsoluto, diaAbsoluto, diaDeSemana } from './fechas';
import { aMilesimas, deMilesimas, redondear3 } from './redondeo';

describe('semanaDelCiclo', () => {
  it('el ciclo empieza el lunes 2026-11-02 en la semana 1', () => {
    expect(diaDeSemana('2026-11-02')).toBe(0);
    expect(deDiaAbsoluto(diaAbsoluto('2026-11-02'))).toBe('2026-11-02');
    expect(deMilesimas(aMilesimas(1626.342))).toBe(1626.342);
    expect(redondear3(242.9760001)).toBe(242.976);
    expect(semanaDelCiclo('2026-11-02')).toBe(1);
  });

  it('la semana cambia en lunes: domingo 08-nov es S1 y lunes 09-nov es S2', () => {
    expect(semanaDelCiclo('2026-11-08')).toBe(1);
    expect(semanaDelCiclo('2026-11-09')).toBe(2);
  });

  it('martes a domingo comparten semana con su lunes', () => {
    for (const d of ['2026-11-16', '2026-11-17', '2026-11-19', '2026-11-22']) {
      expect(semanaDelCiclo(d)).toBe(3);
    }
  });

  it.each([
    ['2026-11-29', 4, '2026-11-30', 5],
    ['2026-12-27', 8, '2026-12-28', 9],
    ['2027-01-24', 12, '2027-01-25', 13],
  ])('borde: %s es S%d y %s es S%d', (domingo, sA, lunes, sB) => {
    expect(semanaDelCiclo(domingo)).toBe(sA);
    expect(semanaDelCiclo(lunes)).toBe(sB);
  });

  it('la última semana es S15 (15–28 feb 2027)', () => {
    expect(semanaDelCiclo('2027-02-15')).toBe(15);
    expect(semanaDelCiclo('2027-02-28')).toBe(15);
  });

  it('fuera del ciclo se acota a S1/S15 y estadoCiclo lo distingue', () => {
    expect(semanaDelCiclo('2026-10-26')).toBe(1);
    expect(estadoCiclo('2026-10-26')).toBe('antes');
    expect(estadoCiclo('2026-11-02')).toBe('en-curso');
    expect(estadoCiclo('2027-02-28')).toBe('en-curso');
    expect(semanaDelCiclo('2027-03-01')).toBe(15);
    expect(estadoCiclo('2027-03-01')).toBe('terminado');
  });

  it('rechaza fechas inválidas', () => {
    expect(() => semanaDelCiclo('2026-02-30')).toThrow(RangeError);
    expect(() => semanaDelCiclo('02/11/2026')).toThrow(RangeError);
  });
});

describe('evaluacionActiva', () => {
  it('asigna cada semana a su evaluación: S1–4, S5–8, S9–12, S13–15', () => {
    const esperado = [
      ...Array<string>(4).fill('cepre1'),
      ...Array<string>(4).fill('cepre2'),
      ...Array<string>(4).fill('cepre3'),
      ...Array<string>(3).fill('cepre4'),
    ];
    expect(Array.from({ length: 15 }, (_, i) => evaluacionDeSemana(i + 1))).toEqual(esperado);
  });

  it.each([
    ['2026-11-29', 'cepre1', '2026-11-30', 'cepre2'],
    ['2026-12-27', 'cepre2', '2026-12-28', 'cepre3'],
    ['2027-01-24', 'cepre3', '2027-01-25', 'cepre4'],
  ])('borde: %s → %s y %s → %s', (a, ea, b, eb) => {
    expect(evaluacionActiva(a)).toBe(ea);
    expect(evaluacionActiva(b)).toBe(eb);
  });

  it('rechaza semanas no válidas', () => {
    expect(() => evaluacionDeSemana(0)).toThrow(RangeError);
    expect(() => evaluacionDeSemana(2.5)).toThrow(RangeError);
  });
});

describe('proximaEvaluacion y diasRestantes', () => {
  it('antes del ciclo apunta a la 1.ª evaluación', () => {
    expect(proximaEvaluacion('2026-10-26')).toEqual({
      id: 'cepre1',
      fecha: '2026-11-29',
      dias: 34,
    });
  });

  it('el día de la evaluación cuenta como próxima con 0 días', () => {
    expect(proximaEvaluacion('2026-11-29')).toEqual({ id: 'cepre1', fecha: '2026-11-29', dias: 0 });
  });

  it('al día siguiente pasa a la siguiente evaluación', () => {
    expect(proximaEvaluacion('2026-11-30')).toEqual({
      id: 'cepre2',
      fecha: '2027-01-10',
      dias: 41,
    });
  });

  it('devuelve null cuando ya pasaron las 4 evaluaciones', () => {
    expect(proximaEvaluacion('2027-03-01')).toBeNull();
  });

  it('respeta fechas de evaluación configuradas', () => {
    const cfg: ConfigCiclo = {
      ...CICLO_POR_DEFECTO,
      fechasEval: { ...CICLO_POR_DEFECTO.fechasEval, cepre1: '2026-12-13' },
    };
    expect(proximaEvaluacion('2026-12-07', cfg)).toEqual({
      id: 'cepre1',
      fecha: '2026-12-13',
      dias: 6,
    });
  });

  it('diasRestantes cuenta días de calendario y nunca es negativo', () => {
    expect(diasRestantes('2026-10-26', '2026-12-06')).toBe(41);
    expect(diasRestantes('2026-12-31', '2027-01-03')).toBe(3);
    expect(diasRestantes('2026-12-06', '2026-12-06')).toBe(0);
    expect(diasRestantes('2026-12-10', '2026-12-06')).toBe(0);
  });
});
