/**
 * Sistema de temas de AUREON (4 perfiles con contraste WCAG AA >= 4.5:1).
 * Contiene las definiciones de tokens, la verificación matemática de contraste
 * y la aplicación sin recarga de `data-theme` sobre `<html>`.
 */
import {
  FUENTE_UI_POR_DEFECTO,
  FUENTES_UI,
  TEMA_PERSONALIZADO_POR_DEFECTO,
  TEMA_UI_POR_DEFECTO,
  TEMAS_UI,
  type FuenteUI,
  type TemaPersonalizadoConfig,
  type TemaUI,
} from '../data/schema';

export {
  FUENTE_UI_POR_DEFECTO,
  FUENTES_UI,
  TEMA_PERSONALIZADO_POR_DEFECTO,
  TEMA_UI_POR_DEFECTO,
  TEMAS_UI,
  type FuenteUI,
  type TemaPersonalizadoConfig,
  type TemaUI,
};

export interface TokensTema {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accent2: string;
  success: string;
  warn: string;
  danger: string;
  focus: string;
  rest: string;
  gold1: string;
  gold2: string;
  gold3: string;
  gold4: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  chart6: string;
}

export interface InfoPerfilTema {
  id: TemaUI;
  nombre: string;
  resumen: string;
  permiteAnimaciones: boolean;
  permiteEfectoRgb85: boolean;
  tokens: TokensTema;
}

export const PERFILES_TEMA: Readonly<Record<TemaUI, InfoPerfilTema>> = {
  'dark-modern': {
    id: 'dark-modern',
    nombre: 'Dark Modern',
    resumen: 'Azul medianoche; neón sutil (cian, fucsia, violeta) en KPIs, radar y acciones.',
    permiteAnimaciones: true,
    permiteEfectoRgb85: false,
    tokens: {
      bg: '#0b1120',
      surface: '#111827',
      surface2: '#1e293b',
      border: '#283548',
      text: '#f1f5f9',
      textMuted: '#94a3b8',
      accent: '#22d3ee',
      accent2: '#e879f9',
      success: '#34d399',
      warn: '#fbbf24',
      danger: '#fb7185',
      focus: '#a78bfa',
      rest: '#22d3ee',
      gold1: '#fff3b0',
      gold2: '#f5c542',
      gold3: '#c8941a',
      gold4: '#f7d774',
      chart1: '#22d3ee',
      chart2: '#e879f9',
      chart3: '#a78bfa',
      chart4: '#34d399',
      chart5: '#fbbf24',
      chart6: '#fb7185',
    },
  },
  gamificado: {
    id: 'gamificado',
    nombre: 'Gamificado',
    resumen: 'Slate-900 con acentos vibrantes y efecto RGB animado al superar el 85 %.',
    permiteAnimaciones: true,
    permiteEfectoRgb85: true,
    tokens: {
      bg: '#0f172a',
      surface: '#1e293b',
      surface2: '#334155',
      border: '#475569',
      text: '#f8fafc',
      textMuted: '#cbd5e1',
      accent: '#38bdf8',
      accent2: '#f472b6',
      success: '#4ade80',
      warn: '#facc15',
      danger: '#fda4af',
      focus: '#818cf8',
      rest: '#2dd4bf',
      gold1: '#fff3b0',
      gold2: '#f5c542',
      gold3: '#c8941a',
      gold4: '#f7d774',
      chart1: '#38bdf8',
      chart2: '#f472b6',
      chart3: '#4ade80',
      chart4: '#facc15',
      chart5: '#a78bfa',
      chart6: '#fb7185',
    },
  },
  oled: {
    id: 'oled',
    nombre: 'OLED Puro',
    resumen: 'Negro #000 y zinc-900 en escala de grises pura, alto contraste y cero animaciones.',
    permiteAnimaciones: false,
    permiteEfectoRgb85: false,
    tokens: {
      bg: '#000000',
      surface: '#18181b',
      surface2: '#27272a',
      border: '#3f3f46',
      text: '#f4f4f5',
      textMuted: '#b4b4bb',
      accent: '#e4e4e7',
      accent2: '#a1a1aa',
      success: '#d4d4d8',
      warn: '#bdbdc2',
      danger: '#e4e4e7',
      focus: '#e4e4e7',
      rest: '#a1a1aa',
      gold1: '#f4f3ef',
      gold2: '#d6d3cb',
      gold3: '#a8a49c',
      gold4: '#e5e2dc',
      chart1: '#fafafa',
      chart2: '#d4d4d8',
      chart3: '#a1a1aa',
      chart4: '#71717a',
      chart5: '#e4e4e7',
      chart6: '#b4b4bb',
    },
  },
  clinico: {
    id: 'clinico',
    nombre: 'Clínico',
    resumen: 'Fondo hueso/slate-50, azul acero y esmeralda sobrio; estética de diagnóstico.',
    permiteAnimaciones: true,
    permiteEfectoRgb85: false,
    tokens: {
      bg: '#f8fafc',
      surface: '#ffffff',
      surface2: '#f1f5f9',
      border: '#cbd5e1',
      text: '#0f172a',
      textMuted: '#475569',
      accent: '#0369a1',
      accent2: '#334155',
      success: '#047857',
      warn: '#92400e',
      danger: '#b91c1c',
      focus: '#0369a1',
      rest: '#047857',
      gold1: '#92400e',
      gold2: '#78350f',
      gold3: '#451a03',
      gold4: '#b45309',
      chart1: '#0369a1',
      chart2: '#047857',
      chart3: '#334155',
      chart4: '#b45309',
      chart5: '#b91c1c',
      chart6: '#4338ca',
    },
  },
};

export function esTemaUI(valor: unknown): valor is TemaUI {
  return typeof valor === 'string' && (TEMAS_UI as readonly string[]).includes(valor);
}

export const CLAVE_STORAGE_TEMA = 'aureon-theme';
export const CLAVE_STORAGE_TEMA_PERSONALIZADO = 'aureon-custom-theme-v1';

export const CLAVE_STORAGE_FUENTE = 'aureon-fuente-v1';

export interface InfoFuenteUI {
  id: FuenteUI;
  nombre: string;
  subtitulo: string;
  css: string;
  muestra: string;
  categoria: 'sans' | 'mono' | 'serif' | 'display' | 'accesibilidad';
}

export const MAPA_FUENTES: Record<FuenteUI, InfoFuenteUI> = {
  sans: {
    id: 'sans',
    nombre: 'Inter / Sans Moderna',
    subtitulo: 'Estándar balanceado y neutral',
    css: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'sans',
  },
  geist: {
    id: 'geist',
    nombre: 'Outfit / Geist',
    subtitulo: 'Geométrica moderna y minimalista',
    css: '"Outfit", "Geist", -apple-system, sans-serif',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'sans',
  },
  jakarta: {
    id: 'jakarta',
    nombre: 'Plus Jakarta Sans',
    subtitulo: 'Limpia, elegante y contemporánea',
    css: '"Plus Jakarta Sans", -apple-system, sans-serif',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'sans',
  },
  lexend: {
    id: 'lexend',
    nombre: 'Lexend (Lectura Ágil)',
    subtitulo: 'Diseñada para reducir la fatiga visual',
    css: '"Lexend", -apple-system, sans-serif',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'sans',
  },
  mono: {
    id: 'mono',
    nombre: 'JetBrains / Hacker Mono',
    subtitulo: 'Espaciado fijo de terminal de código',
    css: '"JetBrains Mono", "Fira Code", monospace',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'mono',
  },
  'space-mono': {
    id: 'space-mono',
    nombre: 'Space Mono (Retro Tech)',
    subtitulo: 'Estética arcade / terminal retro',
    css: '"Space Mono", "Courier New", monospace',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'mono',
  },
  serif: {
    id: 'serif',
    nombre: 'Merriweather (Libro / Estudio)',
    subtitulo: 'Serif clásico para lectura profunda',
    css: '"Merriweather", "Georgia", "Cambria", serif',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'serif',
  },
  playfair: {
    id: 'playfair',
    nombre: 'Playfair Display (Alta Gama)',
    subtitulo: 'Serif de alto contraste y refinamiento',
    css: '"Playfair Display", "Didot", serif',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'serif',
  },
  redondeada: {
    id: 'redondeada',
    nombre: 'Poppins / Redondeada',
    subtitulo: 'Trazos suaves, amigables y abiertos',
    css: '"Poppins", "Nunito", sans-serif',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'sans',
  },
  syne: {
    id: 'syne',
    nombre: 'Syne / Futurista',
    subtitulo: 'Vanguardista con fuerte personalidad',
    css: '"Syne", "Montserrat", sans-serif',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'display',
  },
  dislexica: {
    id: 'dislexica',
    nombre: 'Alta Legibilidad / Disléxica',
    subtitulo: 'Bases pesadas que evitan rotación de letras',
    css: '"OpenDyslexic", "Comic Sans MS", cursive, sans-serif',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'accesibilidad',
  },
  'rubik-paint': {
    id: 'rubik-paint',
    nombre: 'Rubik Wet Paint',
    subtitulo: 'Trazos líquidos, llamativos y artísticos',
    css: '"Rubik Wet Paint", cursive, sans-serif',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'display',
  },
  quicksand: {
    id: 'quicksand',
    nombre: 'Quicksand',
    subtitulo: 'Geométrica redondeada, limpia y amigable',
    css: '"Quicksand", -apple-system, sans-serif',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'sans',
  },
  soria: {
    id: 'soria',
    nombre: 'Soria (Art Nouveau)',
    subtitulo: 'Inspiración modernista con ligaduras Didot',
    css: '"Soria", "Didot", "Playfair Display", serif',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'serif',
  },
  arvo: {
    id: 'arvo',
    nombre: 'Arvo (Slab Serif)',
    subtitulo: 'Geométrica, sólida y con gran presencia',
    css: '"Arvo", "Rockwell", serif',
    muestra: 'AaBbCc 123 · Preparación CEPRE San Marcos',
    categoria: 'serif',
  },
};

export const CLAVE_STORAGE_TRANSPARENCIA = 'aureon-tarjetas-transparencia-v1';

export function leerTransparenciaStorage(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const val = window.localStorage.getItem(CLAVE_STORAGE_TRANSPARENCIA);
    if (!val) return 0;
    const num = Number(val);
    return Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : 0;
  } catch {
    return 0;
  }
}

export function guardarTransparenciaStorage(transparencia: number): void {
  if (typeof window === 'undefined') return;
  try {
    const t = Math.max(0, Math.min(100, Math.round(transparencia)));
    window.localStorage.setItem(CLAVE_STORAGE_TRANSPARENCIA, String(t));
  } catch {
    // Silencioso
  }
}

export function aplicarTransparenciaEnDom(
  transparencia: number,
  temaActivo?: TemaUI,
  root: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null,
): void {
  if (!root) return;
  const t = Math.max(0, Math.min(100, Math.round(transparencia)));
  guardarTransparenciaStorage(t);

  const tUI = temaActivo ?? leerTemaDeDom(root);
  const infoTema = PERFILES_TEMA[tUI] ?? PERFILES_TEMA[TEMA_UI_POR_DEFECTO];

  if (t > 5) {
    // 0% -> alpha 1.0 (sólido), 100% -> alpha 0.15 (ultratranslúcido cristal)
    const alpha = Math.max(0.15, 1 - (t / 100) * 0.85);
    const alpha2 = Math.min(1, alpha + 0.08);
    root.style.setProperty('--surface', hexARgba(infoTema.tokens.surface, alpha));
    root.style.setProperty('--surface-2', hexARgba(infoTema.tokens.surface2, alpha2));
    root.setAttribute('data-glass', 'true');
  } else {
    root.style.removeProperty('--surface');
    root.style.removeProperty('--surface-2');
    root.removeAttribute('data-glass');
  }
}

export function esFuenteUI(valor: unknown): valor is FuenteUI {
  return typeof valor === 'string' && (FUENTES_UI as readonly string[]).includes(valor);
}

export function leerFuenteStorage(): FuenteUI {
  if (typeof window === 'undefined') return FUENTE_UI_POR_DEFECTO;
  try {
    const val = window.localStorage.getItem(CLAVE_STORAGE_FUENTE);
    return esFuenteUI(val) ? val : FUENTE_UI_POR_DEFECTO;
  } catch {
    return FUENTE_UI_POR_DEFECTO;
  }
}

export function guardarFuenteStorage(fuente: FuenteUI): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE_STORAGE_FUENTE, fuente);
  } catch {
    // Silencioso
  }
}

export function aplicarFuenteEnDom(
  fuente: FuenteUI,
  root: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null,
): void {
  if (!root) return;
  const def = MAPA_FUENTES[fuente] ?? MAPA_FUENTES[FUENTE_UI_POR_DEFECTO];
  root.style.fontFamily = def.css;
  guardarFuenteStorage(fuente);
}

export interface PresetsTemaPersonalizado {
  id: string;
  nombre: string;
  icono: string;
  config: TemaPersonalizadoConfig;
}

export const PRESETS_TEMA_PERSONALIZADO: readonly PresetsTemaPersonalizado[] = [
  {
    id: 'cyberpunk',
    nombre: 'Cyberpunk Neón',
    icono: '🌆',
    config: {
      bg: '#05050d',
      surface: '#0f0e1f',
      surface2: '#1c1b33',
      border: '#ff007f',
      text: '#00ffff',
      textMuted: '#ff77a8',
      accent: '#00ffff',
      accent2: '#ff007f',
      transparencia: 0.85,
      rgbArcoiris: true,
      fuente: 'geist',
    },
  },
  {
    id: 'esmeralda',
    nombre: 'Bosque Esmeralda',
    icono: '🌿',
    config: {
      bg: '#04120e',
      surface: '#0b201a',
      surface2: '#13332a',
      border: '#10b981',
      text: '#ecfdf5',
      textMuted: '#6ee7b7',
      accent: '#34d399',
      accent2: '#10b981',
      transparencia: 0.9,
      rgbArcoiris: false,
      fuente: 'sans',
    },
  },
  {
    id: 'sakura',
    nombre: 'Sakura / Rose Gold',
    icono: '🌸',
    config: {
      bg: '#140c12',
      surface: '#24141e',
      surface2: '#381f30',
      border: '#f472b6',
      text: '#fdf2f8',
      textMuted: '#fbcfe8',
      accent: '#f472b6',
      accent2: '#fb7185',
      transparencia: 0.88,
      rgbArcoiris: false,
      fuente: 'redondeada',
    },
  },
  {
    id: 'obsidian',
    nombre: 'Obsidiana Dorada',
    icono: '👑',
    config: {
      bg: '#080808',
      surface: '#141414',
      surface2: '#222222',
      border: '#f5c542',
      text: '#fffdf5',
      textMuted: '#d4af37',
      accent: '#f5c542',
      accent2: '#e6a817',
      transparencia: 0.92,
      rgbArcoiris: false,
      fuente: 'serif',
    },
  },
  {
    id: 'matrix',
    nombre: 'Terminal Hacker',
    icono: '💻',
    config: {
      bg: '#000800',
      surface: '#001400',
      surface2: '#002800',
      border: '#22c55e',
      text: '#4ade80',
      textMuted: '#86efac',
      accent: '#22c55e',
      accent2: '#4ade80',
      transparencia: 0.85,
      rgbArcoiris: false,
      fuente: 'mono',
    },
  },
  {
    id: 'sunset',
    nombre: 'Atardecer Violeta',
    icono: '🌅',
    config: {
      bg: '#120b1e',
      surface: '#1f1335',
      surface2: '#311f52',
      border: '#c084fc',
      text: '#faf5ff',
      textMuted: '#d8b4fe',
      accent: '#fb923c',
      accent2: '#c084fc',
      transparencia: 0.9,
      rgbArcoiris: true,
      fuente: 'geist',
    },
  },
];

export function hexARgba(hex: string, alpha: number): string {
  const limpio = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) {
    return hex;
  }
  const n = Number.parseInt(limpio, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function leerConfigPersonalizadaStorage(): TemaPersonalizadoConfig {
  if (typeof window === 'undefined') return TEMA_PERSONALIZADO_POR_DEFECTO;
  try {
    const raw = window.localStorage.getItem(CLAVE_STORAGE_TEMA_PERSONALIZADO);
    if (!raw) return TEMA_PERSONALIZADO_POR_DEFECTO;
    const parsed = JSON.parse(raw) as Partial<TemaPersonalizadoConfig>;
    return { ...TEMA_PERSONALIZADO_POR_DEFECTO, ...parsed };
  } catch {
    return TEMA_PERSONALIZADO_POR_DEFECTO;
  }
}

export function guardarConfigPersonalizadaStorage(config: TemaPersonalizadoConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE_STORAGE_TEMA_PERSONALIZADO, JSON.stringify(config));
  } catch {
    // Silencioso
  }
}

export function leerTemaDeStorage(): TemaUI | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const val = window.localStorage.getItem(CLAVE_STORAGE_TEMA);
    return esTemaUI(val) ? val : null;
  } catch {
    return null;
  }
}

export function guardarTemaEnStorage(tema: TemaUI): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(CLAVE_STORAGE_TEMA, tema);
  } catch {
    // Silencioso si localStorage está restringido o lleno
  }
}

/**
 * Aplica el tema al atributo `data-theme` de `<html>` sin recargar la página
 * y sincroniza la preferencia en `localStorage`. Si el tema es 'personalizado',
 * inyecta las variables CSS dinámicas y estilo de fuente.
 */
export function aplicarTemaEnDom(
  tema: TemaUI,
  _configLegacy?: unknown,
  root: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null,
): void {
  if (!root) return;
  const temaFinal = esTemaUI(tema) ? tema : TEMA_UI_POR_DEFECTO;
  root.setAttribute('data-theme', temaFinal);
  guardarTemaEnStorage(temaFinal);

  root.style.removeProperty('--bg');
  root.style.removeProperty('--border');
  root.style.removeProperty('--text');
  root.style.removeProperty('--text-muted');
  root.style.removeProperty('--accent');
  root.style.removeProperty('--accent-2');
  root.style.removeProperty('--focus');
  root.style.removeProperty('--rest');
  root.removeAttribute('data-rainbow');

  // Aplicar transparencia de tarjetas rescatada (0 a 100 %) sobre el tema activo
  const t = leerTransparenciaStorage();
  aplicarTransparenciaEnDom(t, temaFinal, root);

  // La tipografía de la interfaz es una preferencia global independiente del tema
  const fuenteActual = leerFuenteStorage();
  aplicarFuenteEnDom(fuenteActual, root);
}

export function leerTemaDeDom(
  root: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null,
): TemaUI {
  const attr = root?.getAttribute('data-theme');
  if (esTemaUI(attr)) return attr;
  const enStorage = leerTemaDeStorage();
  return enStorage ?? TEMA_UI_POR_DEFECTO;
}

/** Devuelve el siguiente tema en orden cíclico para el botón rápido de la barra superior. */
export function siguienteTema(actual: TemaUI): TemaUI {
  const idx = TEMAS_UI.indexOf(actual);
  const sig = TEMAS_UI[(idx + 1) % TEMAS_UI.length];
  return sig ?? TEMA_UI_POR_DEFECTO;
}

// ---------------------------------------------------------------------------
// Verificación matemática de contraste WCAG 2.1 AA (>= 4.5:1)
// ---------------------------------------------------------------------------

function hexARgb(hex: string): [number, number, number] {
  const limpio = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) {
    throw new Error(`Color hex inválido: ${hex}`);
  }
  const n = Number.parseInt(limpio, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminanciaRelativa(hex: string): number {
  const [r, g, b] = hexARgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG 2.1 entre dos colores hex (1 a 21, redondeado a 2 decimales). */
export function calcularContrasteHex(fg: string, bg: string): number {
  const l1 = luminanciaRelativa(fg);
  const l2 = luminanciaRelativa(bg);
  const mayor = Math.max(l1, l2);
  const menor = Math.min(l1, l2);
  return Math.round(((mayor + 0.05) / (menor + 0.05)) * 100) / 100;
}

export interface ReporteContrasteTema {
  tema: TemaUI;
  textSobreBg: number;
  textSobreSurface: number;
  textMutedSobreBg: number;
  textMutedSobreSurface: number;
  accentSobreSurface: number;
  goldSobreSurface: number;
  cumpleAA: boolean;
}

/**
 * Audita los pares críticos de lectura de un tema contra el umbral WCAG AA (4.5:1).
 */
export function auditarContrasteTema(tema: TemaUI): ReporteContrasteTema {
  const t = PERFILES_TEMA[tema].tokens;
  const textSobreBg = calcularContrasteHex(t.text, t.bg);
  const textSobreSurface = calcularContrasteHex(t.text, t.surface);
  const textMutedSobreBg = calcularContrasteHex(t.textMuted, t.bg);
  const textMutedSobreSurface = calcularContrasteHex(t.textMuted, t.surface);
  const accentSobreSurface = calcularContrasteHex(t.accent, t.surface);
  const goldSobreSurface = calcularContrasteHex(t.gold2, t.surface);

  const cumpleAA =
    textSobreBg >= 4.5 &&
    textSobreSurface >= 4.5 &&
    textMutedSobreBg >= 4.5 &&
    textMutedSobreSurface >= 4.5 &&
    accentSobreSurface >= 4.5 &&
    goldSobreSurface >= 4.5;

  return {
    tema,
    textSobreBg,
    textSobreSurface,
    textMutedSobreBg,
    textMutedSobreSurface,
    accentSobreSurface,
    goldSobreSurface,
    cumpleAA,
  };
}
