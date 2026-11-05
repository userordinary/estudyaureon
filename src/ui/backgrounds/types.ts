import { FONDOS_ANIMADOS, type FondoAnimadoId } from '../../data';

export { FONDOS_ANIMADOS, type FondoAnimadoId };

export const STORAGE_KEY_FONDO_ANIMADO = 'aureon-fondo-animado-v1';

export interface InfoFondoAnimado {
  id: FondoAnimadoId;
  nombre: string;
  subtitulo: string;
  descripcion: string;
  etiqueta: string;
  icono: string;
}

export const CATALOGO_FONDOS_ANIMADOS: Record<FondoAnimadoId, InfoFondoAnimado> = {
  ninguno: {
    id: 'ninguno',
    nombre: 'Ninguno (Estático)',
    subtitulo: 'Rendimiento y minimalismo',
    descripcion: 'Fondo plano y limpio según la paleta del tema activo, sin consumo de GPU.',
    etiqueta: 'Estático',
    icono: '⚪',
  },
  'digital-rain': {
    id: 'digital-rain',
    nombre: 'Lluvia Digital',
    subtitulo: 'Matrix & Océano Zen',
    descripcion:
      'Caracteres katakana y matemáticos en caída con superficie de agua, ondas y reflejos.',
    etiqueta: 'Canvas 2D',
    icono: '⚡',
  },
  'rain-glass': {
    id: 'rain-glass',
    nombre: 'Lluvia en el Cristal',
    subtitulo: 'Gotas con refracción y ciudad nocturna',
    descripcion:
      'Física de gotas, condensación y shader de refracción óptica sobre bokeh de ciudad.',
    etiqueta: 'WebGL Shader',
    icono: '🌧️',
  },
  'moonlit-ripple': {
    id: 'moonlit-ripple',
    nombre: 'Olas Luz de Luna',
    subtitulo: 'Mar nocturno en 3D con reflejo lunar',
    descripcion:
      'Simulación de oleaje con raymarching, luna texturizada y ondas reactivas al cursor.',
    etiqueta: 'Raymarching 3D',
    icono: '🌕',
  },
  galaxy: {
    id: 'galaxy',
    nombre: 'Galaxia Interactiva',
    subtitulo: 'Vuelo estelar tridimensional',
    descripcion:
      'Capas de estrellas con brillo volumétrico, repulsión al puntero y aceleración Warp.',
    etiqueta: 'WebGL 2',
    icono: '🌌',
  },
  threads: {
    id: 'threads',
    nombre: 'Hilos Fluidos',
    subtitulo: 'Ondas armónicas de ruido Perlin',
    descripcion:
      'Líneas rojas vectoriales con física armónica y separación reactiva al pasar el cursor.',
    etiqueta: 'Instanced Lines',
    icono: '🧶',
  },
  'metal-esmeralda': {
    id: 'metal-esmeralda',
    nombre: 'Metal Esmeralda',
    subtitulo: 'Molten Metal & destellos cuánticos',
    descripcion:
      'Metal líquido fluido en verde azulado (#12605c) con estela reactiva al ratón y ráfagas blancas.',
    etiqueta: 'WebGL 2',
    icono: '💎',
  },
};

export function leerFondoStorage(): FondoAnimadoId {
  if (typeof window === 'undefined') return 'ninguno';
  try {
    const val = window.localStorage.getItem(STORAGE_KEY_FONDO_ANIMADO);
    if (val && (FONDOS_ANIMADOS as readonly string[]).includes(val)) {
      return val as FondoAnimadoId;
    }
  } catch {
    // Silencioso en caso de bloqueo de cookies/storage
  }
  return 'ninguno';
}

export function guardarFondoStorage(fondo: FondoAnimadoId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_FONDO_ANIMADO, fondo);
  } catch {
    // Ignorar errores de cuota
  }
}
