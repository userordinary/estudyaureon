/**
 * Utilidades PWA, atajos de teclado globales, Badging API y notificaciones locales (PROMPT 10):
 * - Atajos de teclado en PC:
 *   `n` -> registrar tanda
 *   `r` -> repasar errores
 *   `h` -> hoy
 *   `f` -> enfoque
 * - Shortcuts de manifest (`?shortcut=registrar|errores|hoy|enfoque`)
 * - Badging API (`navigator.setAppBadge` / `navigator.clearAppBadge`) con repasos pendientes
 * - Notificaciones locales (fin de bloque de enfoque y repasos vencidos) con la app abierta/instalada
 * - Detección de guía de instalación (Android/PC prompt vs iOS "Añadir a pantalla de inicio")
 */

export type AccionAtajoGlobal = 'registrar' | 'errores' | 'hoy' | 'enfoque';

/**
 * Resuelve la acción de atajo de teclado en PC (`n`, `r`, `h`, `f`) ignorando eventos
 * cuando el foco está dentro de un campo de texto o se presionan teclas modificadoras.
 */
export function resolverAtajoTecladoGlobal(params: {
  key: string;
  tagName?: string;
  isContentEditable?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): AccionAtajoGlobal | null {
  const {
    key,
    tagName = '',
    isContentEditable = false,
    ctrlKey = false,
    metaKey = false,
    altKey = false,
  } = params;

  if (ctrlKey || metaKey || altKey || isContentEditable) return null;

  const tag = tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return null;

  const letra = key.toLowerCase();
  if (letra === 'n') return 'registrar';
  if (letra === 'r') return 'errores';
  if (letra === 'h') return 'hoy';
  if (letra === 'f') return 'enfoque';
  return null;
}

/**
 * Interpreta el parámetro `?shortcut=...` definido en los shortcuts del Web App Manifest.
 */
export function resolverShortcutUrl(search: string): AccionAtajoGlobal | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const val = params.get('shortcut')?.toLowerCase();
  if (val === 'registrar' || val === 'errores' || val === 'hoy' || val === 'enfoque') {
    return val;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Badging API (repasos pendientes en el ícono de la PWA instalada)
// ---------------------------------------------------------------------------

export interface ObjetoNavegadorConBadge {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

export async function actualizarBadgeRepasosPendientes(
  cantidadPendientes: number,
  nav: ObjetoNavegadorConBadge | undefined = typeof navigator !== 'undefined'
    ? (navigator as unknown as ObjetoNavegadorConBadge)
    : undefined,
): Promise<boolean> {
  if (!nav) return false;
  try {
    if (cantidadPendientes > 0 && typeof nav.setAppBadge === 'function') {
      await nav.setAppBadge(cantidadPendientes);
      return true;
    }
    if (cantidadPendientes <= 0 && typeof nav.clearAppBadge === 'function') {
      await nav.clearAppBadge();
      return true;
    }
  } catch {
    // Algunos navegadores rechazan la promesa si la PWA aún no está instalada
  }
  return false;
}

// ---------------------------------------------------------------------------
// Notificaciones locales (Capa B: con la app abierta o instalada)
// ---------------------------------------------------------------------------

export type EstadoPermisoNotificacion = 'granted' | 'denied' | 'default' | 'unsupported';

export function obtenerEstadoPermisoNotificaciones(): EstadoPermisoNotificacion {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export async function solicitarPermisoNotificacionesLocales(): Promise<EstadoPermisoNotificacion> {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported';
  }
  try {
    const res = await window.Notification.requestPermission();
    return res;
  } catch {
    return window.Notification.permission;
  }
}

export function emitirNotificacionLocal(titulo: string, cuerpo: string, tag?: string): boolean {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return false;
  }
  if (window.Notification.permission !== 'granted') {
    return false;
  }
  try {
    new window.Notification(titulo, {
      body: cuerpo,
      icon: '/pwa-192x192.svg',
      badge: '/pwa-192x192.svg',
      tag,
    });
    return true;
  } catch {
    return false;
  }
}

export function notificarFinDeBloqueEnfoque(cursoNombre: string, minutos: number): boolean {
  return emitirNotificacionLocal(
    'AUREON · ¡Bloque de enfoque completado!',
    `Terminaste ${minutos} min de enfoque en ${cursoNombre}. Clasifica tu fatiga y toma tu descanso.`,
    'aureon-fin-bloque',
  );
}

export function notificarRepasosVencidosHoy(cantidad: number): boolean {
  if (cantidad <= 0) return false;
  return emitirNotificacionLocal(
    `AUREON · ${cantidad} repaso(s) vencido(s) hoy`,
    `Tienes ${cantidad} error(es) en tu cola Leitner listos para repasar hoy.`,
    'aureon-repasos-vencidos',
  );
}

// ---------------------------------------------------------------------------
// Guía de instalación PWA (Android / PC vs iOS Safari)
// ---------------------------------------------------------------------------

export interface InfoPlataformaPWA {
  esIOS: boolean;
  esAndroid: boolean;
  estaInstaladaStandalone: boolean;
}

export function detectarPlataformaPWA(
  userAgent: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  standaloneMatch: boolean = typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false,
): InfoPlataformaPWA {
  const ua = userAgent.toLowerCase();
  const esIOS = /iphone|ipad|ipod/.test(ua);
  const esAndroid = /android/.test(ua);
  return {
    esIOS,
    esAndroid,
    estaInstaladaStandalone: standaloneMatch,
  };
}
