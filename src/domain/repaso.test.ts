import { describe, expect, it } from 'vitest';
import {
  activarRepasoError,
  calcularRacha,
  escalonRepasoTema,
  esDiaCumplido,
  evaluarRespuestaLeitner,
  INTERVALOS_LEITNER,
  INTERVALOS_REPASO_TEMA,
  planificarColaLeitner,
} from './index';

describe('domain/repaso — Leitner (1/2/5/10/20/60d), tope diario y racha con día de gracia', () => {
  it('define los intervalos Leitner exactos {1:1, 2:2, 3:5, 4:10, 5:20, 6:60} y de temas [1, 3, 7, 14, 30]', () => {
    expect(INTERVALOS_LEITNER).toEqual({
      1: 1,
      2: 2,
      3: 5,
      4: 10,
      5: 20,
      6: 60,
    });
    expect(INTERVALOS_REPASO_TEMA).toEqual([1, 3, 7, 14, 30]);
    expect(escalonRepasoTema(0)).toBeNull();
    expect(escalonRepasoTema(1)).toBe(1);
    expect(escalonRepasoTema(5)).toBe(3);
    expect(escalonRepasoTema(15)).toBe(14);
  });

  it('activarRepasoError y evaluarRespuestaLeitner avanzan cajas 1..6 hasta dominado (7) y reinician a caja 1 al fallar', () => {
    expect(activarRepasoError('2026-03-10')).toEqual({
      estado: 'repaso',
      cajaAnterior: 0,
      cajaNueva: 1,
      proximoRepaso: '2026-03-11',
    });

    // De caja 1 con 'ok' pasa a caja 2 (+2 días)
    const c2 = evaluarRespuestaLeitner(1, 'ok', '2026-03-11');
    expect(c2).toEqual({
      estado: 'repaso',
      cajaAnterior: 1,
      cajaNueva: 2,
      proximoRepaso: '2026-03-13',
    });

    // De caja 5 con 'ok' pasa a caja 6 (+60 días)
    const c6 = evaluarRespuestaLeitner(5, 'ok', '2026-03-20');
    expect(c6).toEqual({
      estado: 'repaso',
      cajaAnterior: 5,
      cajaNueva: 6,
      proximoRepaso: '2026-05-19',
    });

    // De caja 6 con 'ok' pasa a caja 7 ('dominado')
    const dom = evaluarRespuestaLeitner(6, 'ok', '2026-05-19');
    expect(dom).toEqual({
      estado: 'dominado',
      cajaAnterior: 6,
      cajaNueva: 7,
      proximoRepaso: null,
    });

    // Fallar en cualquier caja devuelve a caja 1 (+1 día)
    const fallo = evaluarRespuestaLeitner(4, 'fail', '2026-04-01');
    expect(fallo).toEqual({
      estado: 'repaso',
      cajaAnterior: 4,
      cajaNueva: 1,
      proximoRepaso: '2026-04-02',
    });
  });

  it('planificarColaLeitner respeta el tope diario (15) y reparte el excedente en días siguientes', () => {
    const items = Array.from({ length: 35 }, (_, i) => ({
      id: `err-${i + 1}`,
      caja: ((i % 4) + 1) as 1 | 2 | 3 | 4,
      proximoRepaso: '2026-03-15',
      estado: 'repaso' as const,
      fecha: '2026-03-10',
    }));

    const plan = planificarColaLeitner(items, '2026-03-16', 15);
    expect(plan.totalVencidos).toBe(35);
    expect(plan.paraHoy).toHaveLength(15);
    expect(plan.excedenteRepartido).toHaveLength(20);
    // Primer bloque de 15 excedentes pasa al día siguiente (2026-03-17) y los 5 restantes al subsiguiente (2026-03-18)
    expect(plan.excedenteRepartido[0]?.fechaReprogramada).toBe('2026-03-17');
    expect(plan.excedenteRepartido[14]?.fechaReprogramada).toBe('2026-03-17');
    expect(plan.excedenteRepartido[15]?.fechaReprogramada).toBe('2026-03-18');
  });

  it('esDiaCumplido y calcularRacha evalúan >=10 preguntas O >=25 min y aplican 1 día de gracia por semana', () => {
    expect(esDiaCumplido(10, 0)).toBe(true);
    expect(esDiaCumplido(4, 25)).toBe(true);
    expect(esDiaCumplido(9, 24)).toBe(false);

    // Semana con 1 día vacío en medio (miércoles 2026-03-11 sin actividad, cubierto por el día de gracia)
    const historial = [
      { fecha: '2026-03-09', preguntas: 12, minutosEnfoque: 0 }, // Lunes
      { fecha: '2026-03-10', preguntas: 15, minutosEnfoque: 0 }, // Martes
      // Miércoles 2026-03-11: 0 preguntas (usa 1 día de gracia semanal)
      { fecha: '2026-03-12', preguntas: 0, minutosEnfoque: 30 }, // Jueves
      { fecha: '2026-03-13', preguntas: 20, minutosEnfoque: 25 }, // Viernes
    ];

    const racha = calcularRacha(historial, '2026-03-13', 1);
    expect(racha.hoyCumplido).toBe(true);
    expect(racha.rachaActual).toBe(4);
    expect(racha.recordPersonal).toBe(4);
    expect(racha.diasGraciaUsadosSemana).toBe(1);
  });
});
