import { describe, expect, it } from 'vitest';
import {
  acumuladoReal,
  brecha,
  lineaRequeridaAcumulada,
  mejorPorTipo,
  metaSiguienteEvaluacion,
  objetivoTotal,
  type ResultadoEvaluacion,
} from './acumulado';
import { referenciasDeCarrera } from './benchmarks';

const MED = 'medicina-humana';

describe('lineaRequeridaAcumulada', () => {
  it('la suma de cepreLast de Medicina por evaluación da 1626.342', () => {
    const { ultimo } = referenciasDeCarrera(MED);
    const suma = Math.round((ultimo[0] + ultimo[1] + ultimo[2] + ultimo[3]) * 1000) / 1000;
    expect(suma).toBe(1626.342);
  });

  it('Medicina Humana: 242.976, 558.926, 985.542, 1626.342 (exactos)', () => {
    const l = lineaRequeridaAcumulada(MED);
    expect(l.acumulada).toEqual([242.976, 558.926, 985.542, 1626.342]);
    expect(l.total).toBe(1626.342);
    expect(l.esOficial).toBe(true);
  });

  it('una carrera sin datos oficiales usa la estimación (15+20+25+40 % = admMin) y se marca', () => {
    const l = lineaRequeridaAcumulada('obstetricia');
    expect(l.acumulada).toEqual([146.7, 342.3, 586.8, 978]);
    expect(l.esOficial).toBe(false);
  });
});

describe('acumuladoReal', () => {
  it('es la SUMA DIRECTA de las 4 evaluaciones, sin porcentajes extra', () => {
    const r = acumuladoReal([
      { tipo: 'cepre1', total: 200 },
      { tipo: 'cepre2', total: 300 },
      { tipo: 'cepre3', total: 400 },
      { tipo: 'cepre4', total: 600 },
    ]);
    expect(r.total).toBe(1500);
    // Contar el peso dos veces (200·0.15 + 300·0.20 + 400·0.25 + 600·0.40) daría 430: prohibido.
    expect(r.total).not.toBe(430);
  });

  it('cuatro puntajes perfectos acumulan 2000 (no 100 ni 2000·%)', () => {
    const r = acumuladoReal([
      { tipo: 'cepre1', total: 300 },
      { tipo: 'cepre2', total: 400 },
      { tipo: 'cepre3', total: 500 },
      { tipo: 'cepre4', total: 800 },
    ]);
    expect(r.total).toBe(2000);
  });

  it('suma exacta a 3 decimales (sin ruido de coma flotante)', () => {
    const r = acumuladoReal([
      { tipo: 'cepre1', total: 242.976 },
      { tipo: 'cepre2', total: 315.95 },
      { tipo: 'cepre3', total: 426.616 },
      { tipo: 'cepre4', total: 640.8 },
    ]);
    expect(r.total).toBe(1626.342);
  });

  it('toma el mejor intento por tipo', () => {
    const lista: ResultadoEvaluacion[] = [
      { tipo: 'cepre1', total: 180.5 },
      { tipo: 'cepre1', total: 210.336 },
      { tipo: 'cepre1', total: 195 },
    ];
    expect(mejorPorTipo(lista)).toEqual({
      cepre1: 210.336,
      cepre2: null,
      cepre3: null,
      cepre4: null,
    });
    const r = acumuladoReal(lista);
    expect(r.porEvaluacion.cepre1).toBe(210.336);
    expect(r.total).toBe(210.336);
  });

  it('ignora los simulacros de admisión', () => {
    const r = acumuladoReal([
      { tipo: 'admision', total: 1500 },
      { tipo: 'cepre1', total: 250 },
    ]);
    expect(r.total).toBe(250);
  });

  it('sin evaluaciones: 0 y las 4 pendientes en orden', () => {
    const r = acumuladoReal([]);
    expect(r.total).toBe(0);
    expect(r.rendidas).toEqual([]);
    expect(r.pendientes).toEqual(['cepre1', 'cepre2', 'cepre3', 'cepre4']);
  });

  it('rechaza puntajes fuera del rango de la evaluación', () => {
    expect(() => acumuladoReal([{ tipo: 'cepre1', total: 300.001 }])).toThrow(RangeError);
    expect(() => acumuladoReal([{ tipo: 'cepre1', total: -16.801 }])).toThrow(RangeError);
    expect(() => acumuladoReal([{ tipo: 'cepre2', total: Number.NaN }])).toThrow(RangeError);
  });
});

describe('objetivoTotal y brecha', () => {
  it('sin meta personal el objetivo es el corte de la carrera', () => {
    expect(objetivoTotal(MED, null)).toEqual({ fuente: 'corte', total: 1626.342 });
  });

  it('la meta personal reemplaza al corte como objetivo', () => {
    expect(objetivoTotal(MED, 1650)).toEqual({ fuente: 'meta', total: 1650 });
  });

  it('rechaza metas personales imposibles', () => {
    expect(() => objetivoTotal(MED, 2000.5)).toThrow(RangeError);
    expect(() => objetivoTotal(MED, 0)).toThrow(RangeError);
  });

  it('brecha = objetivo − acumulado (exacta a 3 decimales)', () => {
    expect(brecha(1500, objetivoTotal(MED, 1650))).toBe(150);
    expect(brecha(985.542, objetivoTotal(MED, null))).toBe(640.8);
    expect(brecha(0.1, 0.3)).toBe(0.2);
  });

  it('brecha negativa cuando el acumulado supera el objetivo', () => {
    expect(brecha(1700, 1626.342)).toBe(-73.658);
  });
});

describe('metaSiguienteEvaluacion', () => {
  const corteMed = objetivoTotal(MED, null);

  it('sin evaluaciones rendidas reparte el corte según los máximos (300/2000)', () => {
    const m = metaSiguienteEvaluacion(acumuladoReal([]), corteMed);
    expect(m).toMatchObject({
      evaluacion: 'cepre1',
      faltante: 1626.342,
      maxRestante: 2000,
      meta: 243.951,
      alcanzable: true,
      buenasNecesarias: 82,
    });
  });

  it('tras la 1.ª evaluación reparte el faltante entre los 1700 puntos restantes', () => {
    const m = metaSiguienteEvaluacion(acumuladoReal([{ tipo: 'cepre1', total: 250 }]), corteMed);
    expect(m).toMatchObject({
      evaluacion: 'cepre2',
      faltante: 1376.342,
      maxRestante: 1700,
      meta: 323.845,
      buenasNecesarias: 81,
    });
  });

  it('usa la meta personal cuando existe', () => {
    const m = metaSiguienteEvaluacion(acumuladoReal([]), objetivoTotal(MED, 1650));
    expect(m?.meta).toBe(247.5);
  });

  it('marca como no alcanzable si el faltante supera lo que queda en juego', () => {
    const res: ResultadoEvaluacion[] = [
      { tipo: 'cepre1', total: 0 },
      { tipo: 'cepre2', total: 0 },
      { tipo: 'cepre3', total: 0 },
    ];
    const m = metaSiguienteEvaluacion(acumuladoReal(res), corteMed);
    expect(m?.evaluacion).toBe('cepre4');
    expect(m?.alcanzable).toBe(false);
    expect(m?.buenasNecesarias).toBe(100);
  });

  it('meta 0 si el objetivo ya está cubierto', () => {
    const res: ResultadoEvaluacion[] = [
      { tipo: 'cepre1', total: 300 },
      { tipo: 'cepre2', total: 400 },
      { tipo: 'cepre3', total: 500 },
    ];
    const m = metaSiguienteEvaluacion(acumuladoReal(res), 1000);
    expect(m).toMatchObject({ evaluacion: 'cepre4', faltante: 0, meta: 0, buenasNecesarias: 0 });
  });

  it('devuelve null cuando ya se rindieron las 4', () => {
    const res: ResultadoEvaluacion[] = [
      { tipo: 'cepre1', total: 250 },
      { tipo: 'cepre2', total: 300 },
      { tipo: 'cepre3', total: 400 },
      { tipo: 'cepre4', total: 700 },
    ];
    expect(metaSiguienteEvaluacion(acumuladoReal(res), corteMed)).toBeNull();
  });
});
