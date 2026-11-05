/**
 * Motor de audio para avisos y campana de enfoque (AUREON).
 *
 * Implementa síntesis acústica pura con Web Audio API (100 % offline, 0 dependencias externas).
 * Emula una campana tibetana/mindfulness moderna con armónicos resonantes y decaimiento
 * exponencial suave para evitar chasquidos o estridencias.
 */

export type TipoTonoCampana = 'fin_enfoque' | 'fin_descanso';

interface StrikeCampana {
  frecuencia: number;
  offsetSegundos: number;
  duracionSegundos: number;
  volumenRelativo: number;
}

/**
 * Parciales armónicos que dotan a la campana de su timbre metálico y cálido:
 * - Fundamental (f0): tono profundo y cuerpo del gong/campana
 * - Octava armónica (f0 * 2.003): presencia metálica suave
 * - Brillo cristalino (f0 * 2.756): sonido de campana de viento/tazón tibetano
 * - Pátina inicial (f0 * 5.404): ataque sutil sin chasquido
 */
const PARCIALES_CAMPANA = [
  { factorFreq: 1.0, factorGanancia: 0.65, factorDecaimiento: 1.0 },
  { factorFreq: 2.003, factorGanancia: 0.22, factorDecaimiento: 0.55 },
  { factorFreq: 2.756, factorGanancia: 0.14, factorDecaimiento: 0.38 },
  { factorFreq: 5.404, factorGanancia: 0.05, factorDecaimiento: 0.16 },
] as const;

/**
 * Tríada ascendente elegante para fin de enfoque:
 * C#5 (554.37 Hz) -> F#5 (739.99 Hz) -> B5 (987.77 Hz)
 */
const PATRON_FIN_ENFOQUE: readonly StrikeCampana[] = [
  { frecuencia: 554.37, offsetSegundos: 0.0, duracionSegundos: 2.2, volumenRelativo: 0.75 },
  { frecuencia: 739.99, offsetSegundos: 0.22, duracionSegundos: 2.4, volumenRelativo: 0.85 },
  { frecuencia: 987.77, offsetSegundos: 0.48, duracionSegundos: 3.0, volumenRelativo: 1.0 },
];

/**
 * Tono claro y refrescante de 2 notas para fin de descanso:
 * E5 (659.25 Hz) -> B5 (987.77 Hz)
 */
const PATRON_FIN_DESCANSO: readonly StrikeCampana[] = [
  { frecuencia: 659.25, offsetSegundos: 0.0, duracionSegundos: 1.8, volumenRelativo: 0.8 },
  { frecuencia: 987.77, offsetSegundos: 0.24, duracionSegundos: 2.5, volumenRelativo: 1.0 },
];

let audioCtxSingleton: AudioContext | null = null;

export function resetearAudioContextParaTests(): void {
  audioCtxSingleton = null;
}

/**
 * Obtiene o inicializa el singleton de AudioContext del navegador.
 * Seguro en SSR y entornos de test sin DOM / Web Audio.
 */
export function obtenerAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  try {
    if (!audioCtxSingleton || audioCtxSingleton.state === 'closed') {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return null;
      audioCtxSingleton = new AudioCtxClass();
    }
    return audioCtxSingleton;
  } catch {
    return null;
  }
}

/**
 * Permite desbloquear el AudioContext durante un gesto de usuario (click/tap)
 * para cumplir la política de reproducción automática del navegador.
 */
export async function desbloquearAudio(): Promise<boolean> {
  const ctx = obtenerAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

/**
 * Reproduce un golpe individual de campana con sus armónicos correspondientes.
 */
function programarStrikeCampana(
  ctx: AudioContext,
  filtroMaster: BiquadFilterNode,
  strike: StrikeCampana,
  tiempoBase: number,
  volumenMaster: number,
): void {
  const tStrike = tiempoBase + strike.offsetSegundos;

  for (const parcial of PARCIALES_CAMPANA) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(strike.frecuencia * parcial.factorFreq, tStrike);

    const gananciaPico = volumenMaster * strike.volumenRelativo * parcial.factorGanancia;
    const duracionParcial = Math.max(0.1, strike.duracionSegundos * parcial.factorDecaimiento);

    // Ataque suave anti-pop (12 ms) seguido de decaimiento exponencial natural
    const tAtaque = tStrike + 0.012;
    const tFin = tStrike + duracionParcial;

    gain.gain.setValueAtTime(0.00001, tStrike);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gananciaPico), tAtaque);
    gain.gain.exponentialRampToValueAtTime(0.00001, tFin);

    osc.connect(gain);
    gain.connect(filtroMaster);

    osc.start(tStrike);
    osc.stop(tFin + 0.05);
  }
}

export interface OpcionesCampana {
  volumenMaster?: number;
}

/**
 * Reproduce el tono de campana moderno y elegante.
 * Retorna true si pudo reproducirse o false si el entorno no lo soporta.
 */
export async function reproducirCampanaElegante(
  tipo: TipoTonoCampana = 'fin_enfoque',
  opciones: OpcionesCampana = {},
): Promise<boolean> {
  const ctx = obtenerAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const patron = tipo === 'fin_enfoque' ? PATRON_FIN_ENFOQUE : PATRON_FIN_DESCANSO;
    const volumenMaster = opciones.volumenMaster ?? 0.38;

    // Filtro pasa-bajos cálido para suavizar sobretonos metálicos (emulación campana acústica)
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.setValueAtTime(5500, ctx.currentTime);
    filtro.Q.setValueAtTime(0.85, ctx.currentTime);

    // Ganancia master
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.0, ctx.currentTime);

    filtro.connect(masterGain);
    masterGain.connect(ctx.destination);

    const t0 = ctx.currentTime + 0.02;

    for (const strike of patron) {
      programarStrikeCampana(ctx, filtro, strike, t0, volumenMaster);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Emite vibración háptica suave si el dispositivo la soporta.
 */
export function emitirVibracionAlerta(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([220, 100, 220]);
    }
  } catch {
    // Ignorar en entornos sin soporte
  }
}
