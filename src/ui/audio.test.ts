// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  desbloquearAudio,
  emitirVibracionAlerta,
  obtenerAudioContext,
  reproducirCampanaElegante,
  resetearAudioContextParaTests,
} from './audio';

describe('Audio System — Síntesis de Campana Moderna de Enfoque', () => {
  let createdOscillators: Array<{
    type: string;
    frequency: { value: number; setValueAtTime: ReturnType<typeof vi.fn> };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
  }> = [];

  let mockContextInstance: {
    state: AudioContextState;
    currentTime: number;
    destination: Record<string, unknown>;
    resume: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    createOscillator: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    createBiquadFilter: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    resetearAudioContextParaTests();
    createdOscillators = [];

    mockContextInstance = {
      state: 'suspended',
      currentTime: 10,
      destination: {},
      resume: vi.fn().mockImplementation(async () => {
        mockContextInstance.state = 'running';
      }),
      close: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn().mockImplementation(() => {
        const osc = {
          type: 'sine',
          frequency: {
            value: 440,
            setValueAtTime: vi.fn(),
          },
          start: vi.fn(),
          stop: vi.fn(),
          connect: vi.fn(),
        };
        createdOscillators.push(osc);
        return osc;
      }),
      createGain: vi.fn().mockImplementation(() => ({
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      })),
      createBiquadFilter: vi.fn().mockImplementation(() => ({
        type: 'lowpass',
        frequency: { setValueAtTime: vi.fn() },
        Q: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
    };

    function MockAudioContextConstructor() {
      return mockContextInstance;
    }

    (window as unknown as { AudioContext: unknown }).AudioContext = MockAudioContextConstructor;
  });

  afterEach(() => {
    resetearAudioContextParaTests();
    vi.restoreAllMocks();
  });

  it('desbloquea el AudioContext si está suspendido al ocurrir una interacción', async () => {
    expect(mockContextInstance.state).toBe('suspended');
    const desbloqueado = await desbloquearAudio();
    expect(desbloqueado).toBe(true);
    expect(mockContextInstance.resume).toHaveBeenCalled();
    expect(mockContextInstance.state).toBe('running');
  });

  it('reproduce tríada de campana elegante para fin de enfoque sin cerrar el contexto inmediatamente', async () => {
    const ok = await reproducirCampanaElegante('fin_enfoque');
    expect(ok).toBe(true);

    // Debe haber resumido el contexto si estaba suspendido
    expect(mockContextInstance.resume).toHaveBeenCalled();

    // NO debe llamar a ctx.close() sincrónicamente (error previo que impedía escuchar el audio)
    expect(mockContextInstance.close).not.toHaveBeenCalled();

    // Patrón fin de enfoque: 3 strikes con 4 parciales armónicos cada uno = 12 osciladores
    expect(createdOscillators.length).toBe(12);

    // Verificar que los osciladores se iniciaron y programaron para apagarse con cola natural
    for (const osc of createdOscillators) {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    }

    // Verificar presencia de las fundamentales de la tríada C#5 (~554 Hz), F#5 (~739 Hz), B5 (~987 Hz)
    const frecuenciasProgramadas = createdOscillators.map(
      (o) => o.frequency.setValueAtTime.mock.calls[0]?.[0],
    );

    const tieneFundamentalC = frecuenciasProgramadas.some(
      (f) => typeof f === 'number' && Math.abs(f - 554.37) < 1,
    );
    const tieneFundamentalF = frecuenciasProgramadas.some(
      (f) => typeof f === 'number' && Math.abs(f - 739.99) < 1,
    );
    const tieneFundamentalB = frecuenciasProgramadas.some(
      (f) => typeof f === 'number' && Math.abs(f - 987.77) < 1,
    );

    expect(tieneFundamentalC).toBe(true);
    expect(tieneFundamentalF).toBe(true);
    expect(tieneFundamentalB).toBe(true);
  });

  it('reproduce campana clara de 2 notas para fin de descanso', async () => {
    const ok = await reproducirCampanaElegante('fin_descanso');
    expect(ok).toBe(true);

    // Patrón fin de descanso: 2 strikes con 4 parciales = 8 osciladores
    expect(createdOscillators.length).toBe(8);

    const frecuencias = createdOscillators.map(
      (o) => o.frequency.setValueAtTime.mock.calls[0]?.[0],
    );
    const tieneNotaE = frecuencias.some((f) => typeof f === 'number' && Math.abs(f - 659.25) < 1);
    const tieneNotaB = frecuencias.some((f) => typeof f === 'number' && Math.abs(f - 987.77) < 1);

    expect(tieneNotaE).toBe(true);
    expect(tieneNotaB).toBe(true);
  });

  it('maneja con elegancia y sin arrojar excepción entornos sin AudioContext', async () => {
    // Simular navegador sin AudioContext
    const win = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
    delete win.AudioContext;
    delete win.webkitAudioContext;

    expect(obtenerAudioContext()).toBeNull();
    const resultado = await reproducirCampanaElegante('fin_enfoque');
    expect(resultado).toBe(false);
  });

  it('emite vibración háptica con patrón [220, 100, 220] si el dispositivo la soporta', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    emitirVibracionAlerta();
    expect(vibrateMock).toHaveBeenCalledWith([220, 100, 220]);
  });
});
