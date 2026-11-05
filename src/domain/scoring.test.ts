import { describe, expect, it } from 'vitest';
import {
  calcularPuntaje,
  capacidadSecciones,
  porcentajeInformativo,
  puntajeMaximo,
  reglaDe,
  seccionesDesdePorCurso,
  type PorCurso,
} from './scoring';
import { EVALUACIONES_CEPRE, TIPOS_EVAL } from './tipos';

const vacio = { ok: 0, bad: 0 };

describe('calcularPuntaje', () => {
  it.each(TIPOS_EVAL)('0 respuestas = 0 puntos en %s (y 100 en blanco)', (tipo) => {
    const r = calcularPuntaje(tipo, { secciones: { act: vacio, hab: vacio, conoc: vacio } });
    expect(r).toEqual({ act: 0, hab: 0, conoc: 0, total: 0, buenas: 0, malas: 0, blancos: 100 });
  });

  it('0 respuestas por curso (porCurso vacío) = 0 puntos', () => {
    expect(calcularPuntaje('cepre2', { porCurso: {} }).total).toBe(0);
  });

  it.each([
    ['cepre1', 300],
    ['cepre2', 400],
    ['cepre3', 500],
    ['cepre4', 800],
    ['admision', 2000],
  ] as const)('todas buenas en %s da el máximo %d', (tipo, max) => {
    const cap = capacidadSecciones(tipo);
    const r = calcularPuntaje(tipo, {
      secciones: {
        act: { ok: cap.act, bad: 0 },
        hab: { ok: cap.hab, bad: 0 },
        conoc: { ok: cap.conoc, bad: 0 },
      },
    });
    expect(r.total).toBe(max);
    expect(puntajeMaximo(tipo)).toBe(max);
  });

  it('las 4 evaluaciones con puntaje perfecto suman 2000', () => {
    const total = EVALUACIONES_CEPRE.reduce((s, tipo) => {
      const cap = capacidadSecciones(tipo);
      return (
        s +
        calcularPuntaje(tipo, {
          secciones: {
            act: { ok: cap.act, bad: 0 },
            hab: { ok: cap.hab, bad: 0 },
            conoc: { ok: cap.conoc, bad: 0 },
          },
        }).total
      );
    }, 0);
    expect(total).toBe(2000);
  });

  it('1.ª evaluación: +3.00 / −0.168 por sección', () => {
    const r = calcularPuntaje('cepre1', {
      secciones: { hab: { ok: 20, bad: 5 }, conoc: { ok: 50, bad: 10 } },
    });
    expect(r.hab).toBe(59.16);
    expect(r.conoc).toBe(148.32);
    expect(r.total).toBe(207.48);
    expect([r.buenas, r.malas, r.blancos]).toEqual([70, 15, 15]);
  });

  it('2.ª evaluación: +4.00 / −0.225', () => {
    const r = calcularPuntaje('cepre2', { secciones: { hab: { ok: 1, bad: 1 }, conoc: vacio } });
    expect(r.total).toBe(3.775);
  });

  it('3.ª evaluación: −0.282 por mala; el puntaje puede ser negativo', () => {
    const r = calcularPuntaje('cepre3', { secciones: { hab: vacio, conoc: { ok: 0, bad: 7 } } });
    expect(r.total).toBe(-1.974);
  });

  it('4.ª evaluación: incluye Actitudinal (+8.00 / −0.450)', () => {
    const r = calcularPuntaje('cepre4', {
      secciones: { act: { ok: 8, bad: 2 }, hab: { ok: 15, bad: 3 }, conoc: { ok: 60, bad: 5 } },
    });
    expect(r.act).toBe(63.1);
    expect(r.hab).toBe(118.65);
    expect(r.conoc).toBe(477.75);
    expect(r.total).toBe(659.5);
  });

  it('simulacro de admisión: +20 / −1.125', () => {
    const r = calcularPuntaje('admision', {
      secciones: { act: vacio, hab: vacio, conoc: { ok: 1, bad: 1 } },
    });
    expect(r.total).toBe(18.875);
  });

  it('el desglose porCurso da el mismo resultado que por secciones', () => {
    const porCurso: PorCurso = {
      hv: { ok: 10, bad: 2 },
      hm: { ok: 8, bad: 1 },
      quim: { ok: 5, bad: 1 },
      bio: { ok: 4, bad: 0 },
    };
    expect(seccionesDesdePorCurso(porCurso)).toEqual({
      act: { ok: 0, bad: 0, blanco: 0 },
      hab: { ok: 18, bad: 3, blanco: 0 },
      conoc: { ok: 9, bad: 1, blanco: 0 },
    });
    expect(reglaDe('cepre2').buena).toBe(4);
    const a = calcularPuntaje('cepre2', { porCurso });
    const b = calcularPuntaje('cepre2', {
      secciones: { hab: { ok: 18, bad: 3 }, conoc: { ok: 9, bad: 1 } },
    });
    expect(a).toEqual(b);
    expect(a.total).toBe(107.1);
  });

  it('porCurso acepta Actitudinal con la clave "act" en la 4.ª evaluación', () => {
    const r = calcularPuntaje('cepre4', { porCurso: { act: { ok: 10, bad: 0 } } });
    expect(r.act).toBe(80);
    expect(r.total).toBe(80);
  });

  it('el resultado siempre tiene como máximo 3 decimales', () => {
    for (const tipo of TIPOS_EVAL) {
      for (let bad = 0; bad <= capacidadSecciones(tipo).hab; bad++) {
        const r = calcularPuntaje(tipo, {
          secciones: { hab: { ok: 0, bad }, conoc: { ok: 37, bad: 0 } },
        });
        expect(Number.isInteger(Math.round(r.total * 1000))).toBe(true);
        expect(r.total.toString()).toMatch(/^-?\d+(\.\d{1,3})?$/);
      }
    }
  });

  it('rechaza Actitudinal en evaluaciones que no lo tienen', () => {
    expect(() =>
      calcularPuntaje('cepre1', {
        secciones: { act: { ok: 1, bad: 0 }, hab: vacio, conoc: vacio },
      }),
    ).toThrow(RangeError);
  });

  it('rechaza más respuestas que preguntas en una sección', () => {
    expect(() =>
      calcularPuntaje('cepre1', { secciones: { hab: { ok: 31, bad: 0 }, conoc: vacio } }),
    ).toThrow(RangeError);
    expect(() =>
      calcularPuntaje('cepre4', {
        secciones: { act: vacio, hab: { ok: 15, bad: 6 }, conoc: vacio },
      }),
    ).toThrow(RangeError);
  });

  it('rechaza cantidades negativas o no enteras', () => {
    expect(() =>
      calcularPuntaje('cepre1', { secciones: { hab: { ok: -1, bad: 0 }, conoc: vacio } }),
    ).toThrow(RangeError);
    expect(() =>
      calcularPuntaje('cepre1', { secciones: { hab: { ok: 1.5, bad: 0 }, conoc: vacio } }),
    ).toThrow(RangeError);
  });

  it('rechaza cursos desconocidos en porCurso', () => {
    const malo = { xyz: { ok: 1, bad: 0 } } as unknown as PorCurso;
    expect(() => calcularPuntaje('cepre1', { porCurso: malo })).toThrow(RangeError);
  });
});

describe('capacidadSecciones y porcentajes', () => {
  it('estructura 15+15+70 en las evaluaciones 1–3 y 10+20+70 en la 4.ª', () => {
    expect(capacidadSecciones('cepre1')).toEqual({ act: 0, hab: 30, conoc: 70 });
    expect(capacidadSecciones('cepre3')).toEqual({ act: 0, hab: 30, conoc: 70 });
    expect(capacidadSecciones('cepre4')).toEqual({ act: 10, hab: 20, conoc: 70 });
  });

  it('los porcentajes informativos son 15/20/25/40 y suman 100', () => {
    const p = EVALUACIONES_CEPRE.map(porcentajeInformativo);
    expect(p).toEqual([15, 20, 25, 40]);
    expect(p.reduce((s, x) => s + x, 0)).toBe(100);
  });
});
