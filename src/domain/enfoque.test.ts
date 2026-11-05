import { describe, expect, it } from 'vitest';
import {
  calcularCalidadEnfoque,
  calcularProgresoTemporizador,
  descansoAjustado,
  DURACIONES,
  duracionesPorModo,
  esFatiga,
  formatearPalitosDistraccion,
  formatearRelojMMSS,
  pausarMarcaTiempo,
  reanudarMarcaTiempo,
  type Fatiga,
  type MarcaTiempoTemporizador,
} from './enfoque';

describe('duraciones por modo', () => {
  it.each([
    ['sprint', 25, 5],
    ['inmersion', 50, 10],
    ['simulacro', 90, 15],
  ] as const)('%s: %d min de enfoque y %d de descanso', (modo, enfoque, descanso) => {
    expect(duracionesPorModo(modo)).toEqual({ enfoque, descanso });
  });

  it('duracionesPorModo devuelve una copia (no se puede alterar la tabla)', () => {
    const d = duracionesPorModo('sprint');
    d.enfoque = 999;
    expect(DURACIONES.sprint.enfoque).toBe(25);
  });
});

describe('descansoAjustado', () => {
  it.each([
    [1, 5],
    [2, 5],
    [3, 5],
    [4, 10],
    [5, 10],
  ] as const)('fatiga %d con descanso base 5 → %d min', (fatiga, esperado) => {
    expect(descansoAjustado(5, fatiga)).toBe(esperado);
  });

  it.each([1, 2, 3, 4, 5] as const)('fatiga %d con cada modo suma +5 solo si fatiga ≥ 4', (f) => {
    for (const modo of ['sprint', 'inmersion', 'simulacro'] as const) {
      const base = DURACIONES[modo].descanso;
      expect(descansoAjustado(base, f)).toBe(f >= 4 ? base + 5 : base);
    }
  });

  it('sin reporte de fatiga (null) mantiene el descanso base', () => {
    expect(descansoAjustado(10, null)).toBe(10);
  });

  it('rechaza fatigas fuera de 1–5 y descansos inválidos', () => {
    expect(esFatiga(1)).toBe(true);
    expect(esFatiga(5)).toBe(true);
    expect(esFatiga(0)).toBe(false);
    expect(esFatiga(6)).toBe(false);
    expect(esFatiga(3.5)).toBe(false);
    expect(() => descansoAjustado(5, 0 as Fatiga)).toThrow(RangeError);
    expect(() => descansoAjustado(5, 6 as Fatiga)).toThrow(RangeError);
    expect(() => descansoAjustado(5, 4.5 as Fatiga)).toThrow(RangeError);
    expect(() => descansoAjustado(-1, 3)).toThrow(RangeError);
  });
});

describe('cálculo por marca de tiempo tras recarga y segundo plano', () => {
  it('reconstruye el progreso exacto tras una recarga o cambio de pestaña', () => {
    const t0 = 1_710_000_000_000;
    const marca: MarcaTiempoTemporizador = {
      fase: 'enfoque',
      duracionTotalMs: 25 * 60_000, // 25 min = 1_500_000 ms
      inicioTramoMs: t0,
      acumuladoPrevioMs: 0,
    };

    // Tras 10 minutos exactos (600_000 ms) en segundo plano o tras F5
    const prog10m = calcularProgresoTemporizador(marca, t0 + 10 * 60_000);
    expect(prog10m.transcurridoSegundos).toBe(600);
    expect(prog10m.restanteSegundos).toBe(900);
    expect(prog10m.progreso).toBeCloseTo(0.4, 5);
    expect(prog10m.porcentaje).toBe(40);
    expect(prog10m.faseTerminada).toBe(false);
    expect(prog10m.minutosTranscurridos).toBe(10);
    expect(formatearRelojMMSS(prog10m.restanteSegundos)).toBe('15:00');

    // Al llegar o superar los 25 minutos
    const progFin = calcularProgresoTemporizador(marca, t0 + 26 * 60_000);
    expect(progFin.faseTerminada).toBe(true);
    expect(progFin.restanteSegundos).toBe(0);
    expect(progFin.progreso).toBe(1);
    expect(progFin.minutosTranscurridos).toBe(25);
  });

  it('conserva el acumulado al pausar y reanudar por marca de tiempo', () => {
    const t0 = 1_710_000_000_000;
    const inicial: MarcaTiempoTemporizador = {
      fase: 'enfoque',
      duracionTotalMs: 50 * 60_000,
      inicioTramoMs: t0,
      acumuladoPrevioMs: 0,
    };

    // Pausa a los 12 minutos
    const enPausa = pausarMarcaTiempo(inicial, t0 + 12 * 60_000);
    expect(enPausa.inicioTramoMs).toBeNull();
    expect(enPausa.acumuladoPrevioMs).toBe(12 * 60_000);

    // Pasan 30 minutos estando en pausa -> el tiempo transcurrido sigue siendo 12 min
    const durantePausa = calcularProgresoTemporizador(enPausa, t0 + 42 * 60_000);
    expect(durantePausa.minutosTranscurridos).toBe(12);

    // Reanuda en t0 + 42 min y corre 8 min más -> total 20 min
    const reanudada = reanudarMarcaTiempo(enPausa, t0 + 42 * 60_000);
    const trasReanudar = calcularProgresoTemporizador(reanudada, t0 + 50 * 60_000);
    expect(trasReanudar.minutosTranscurridos).toBe(20);
  });
});

describe('calidad de enfoque = distracciones por hora (selector puro)', () => {
  it('calcula distracciones por hora y clasifica el nivel de calidad', () => {
    // 120 minutos (2 horas) con 3 distracciones = 1.5 distracciones/hora -> calidad 'alta'
    const alta = calcularCalidadEnfoque([
      { minutosEnfoque: 50, distracciones: 1 },
      { minutosEnfoque: 70, distracciones: 2 },
    ]);
    expect(alta.totalMinutos).toBe(120);
    expect(alta.totalHoras).toBe(2);
    expect(alta.totalDistracciones).toBe(3);
    expect(alta.distraccionesPorHora).toBe(1.5);
    expect(alta.nivel).toBe('alta');

    // 30 minutos (0.5 h) con 2 distracciones = 4 distracciones/hora -> calidad 'media'
    const media = calcularCalidadEnfoque([{ minutosEnfoque: 30, distracciones: 2 }]);
    expect(media.distraccionesPorHora).toBe(4);
    expect(media.nivel).toBe('media');

    // 25 minutos con 4 distracciones = 9.6 distracciones/hora -> calidad 'baja'
    const baja = calcularCalidadEnfoque([{ minutosEnfoque: 25, distracciones: 4 }]);
    expect(baja.distraccionesPorHora).toBe(9.6);
    expect(baja.nivel).toBe('baja');

    // Sin sesiones = 0 distracciones/hora
    expect(calcularCalidadEnfoque([]).distraccionesPorHora).toBe(0);
  });

  it('formatea los palitos de distracción en grupos de 5', () => {
    expect(formatearPalitosDistraccion(0)).toBe('—');
    expect(formatearPalitosDistraccion(3)).toBe('|||');
    expect(formatearPalitosDistraccion(5)).toBe('||||/');
    expect(formatearPalitosDistraccion(7)).toBe('||||/ ||');
  });
});
