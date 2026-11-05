/**
 * Motor de sincronización bidireccional Offline-First entre Celular y PC (`src/data/sync-engine.ts` — PROMPT 11):
 * - Dexie sigue siendo la fuente local primaria; la app nunca se bloquea esperando red y sin cuenta todo funciona local.
 * - Cada evento (`Practice`, `Mistake`, `FocusSession`, `TopicProgress`, `Simulacro`, `Settings`)
 *   lleva `uuid`, `updatedAt` y `deletedAt` (borrado lógico / tombstone).
 * - Resolución determinista de conflictos:
 *   1) Gana el `updatedAt` más reciente por registro.
 *   2) El borrado (`deletedAt !== null`) gana sobre ediciones más viejas o simultáneas (`deletedAt >= edicion.updatedAt`).
 * - Reglas de seguridad (RLS): cada fila solo es accesible por su dueño (`ownerId === sesion.userId`).
 * - Adaptador Supabase (login por enlace mágico / Magic Link + PostgREST) y almacén en memoria para tests E2E multi-dispositivo.
 * - Soporte opcional de Web Push con función programada para el recordatorio diario y los repasos vencidos.
 */
import type { AureonDB } from './db';
import type { FocusSession, Mistake, Practice, Settings, Simulacro, TopicProgress } from './schema';

export type TipoEntidadSync =
  'practice' | 'mistake' | 'focusSession' | 'topicProgress' | 'simulacro' | 'settings';

export const ENTIDADES_SYNC: readonly TipoEntidadSync[] = [
  'practice',
  'mistake',
  'focusSession',
  'topicProgress',
  'simulacro',
  'settings',
] as const;

export type PayloadEntidadSyncMap = {
  practice: Practice;
  mistake: Mistake;
  focusSession: FocusSession;
  topicProgress: TopicProgress;
  simulacro: Simulacro;
  settings: Settings;
};

/**
 * Sobre canónico de sincronización con `uuid`, `updatedAt`, `deletedAt` (borrado lógico) y `ownerId`.
 */
export interface SobreSync<K extends TipoEntidadSync = TipoEntidadSync> {
  uuid: string;
  entidad: K;
  ownerId: string;
  updatedAt: number;
  deletedAt: number | null;
  payload: PayloadEntidadSyncMap[K] | null;
}

export type EstadoIndicadorSync =
  'local' | 'sincronizando' | 'sincronizado' | 'pendiente_offline' | 'error';

export interface SesionUsuarioSync {
  userId: string;
  email: string;
  accessToken?: string;
}

export interface ResultadoCicloSync {
  exito: boolean;
  estado: EstadoIndicadorSync;
  enviados: number;
  recibidos: number;
  aplicadosEnLocal: number;
  eliminadosEnLocal: number;
  timestampSync: number;
  mensajeError?: string;
}

// ---------------------------------------------------------------------------
// 1. Normalización de UUID, updatedAt y deletedAt por tipo de evento
// ---------------------------------------------------------------------------

export function obtenerUuidDeEvento<K extends TipoEntidadSync>(
  entidad: K,
  registro: PayloadEntidadSyncMap[K],
): string {
  if (registro.uuid && registro.uuid.trim().length > 0) {
    return registro.uuid;
  }
  switch (entidad) {
    case 'practice':
      return (registro as Practice).id;
    case 'mistake':
      return (registro as Mistake).id;
    case 'focusSession':
      return (registro as FocusSession).id;
    case 'simulacro':
      return (registro as Simulacro).id;
    case 'topicProgress': {
      const tp = registro as TopicProgress;
      return `tp:${tp.cursoId}:${tp.temaId}`;
    }
    case 'settings':
      return 'settings:default';
  }
}

export function obtenerUpdatedAtDeEvento<K extends TipoEntidadSync>(
  entidad: K,
  registro: PayloadEntidadSyncMap[K],
): number {
  if (typeof registro.updatedAt === 'number' && Number.isFinite(registro.updatedAt)) {
    return registro.updatedAt;
  }
  switch (entidad) {
    case 'practice':
      return (registro as Practice).ts;
    case 'mistake': {
      const m = registro as Mistake;
      const ultimoHist = m.historial[m.historial.length - 1]?.ts ?? 0;
      return Math.max(m.creadoEn, ultimoHist);
    }
    case 'focusSession':
      return (registro as FocusSession).fin;
    case 'topicProgress':
      return (registro as TopicProgress).actualizadoEn;
    case 'simulacro':
      return (registro as Simulacro).ts;
    case 'settings':
      return (registro as Settings).actualizadoEn;
  }
}

export function envolverEventoParaSync<K extends TipoEntidadSync>(
  entidad: K,
  registro: PayloadEntidadSyncMap[K],
  ownerId: string,
  opciones: { updatedAt?: number; deletedAt?: number | null } = {},
): SobreSync<K> {
  const uuid = obtenerUuidDeEvento(entidad, registro);
  const deletedAt = opciones.deletedAt ?? registro.deletedAt ?? null;
  const baseUpdated = opciones.updatedAt ?? obtenerUpdatedAtDeEvento(entidad, registro);
  const updatedAt = deletedAt !== null ? Math.max(baseUpdated, deletedAt) : baseUpdated;

  const payloadConMetadatos: PayloadEntidadSyncMap[K] = {
    ...registro,
    uuid,
    updatedAt,
    deletedAt,
  };

  return {
    uuid,
    entidad,
    ownerId,
    updatedAt,
    deletedAt,
    payload: payloadConMetadatos,
  };
}

export function crearTombstoneSync<K extends TipoEntidadSync>(
  entidad: K,
  uuid: string,
  ownerId: string,
  deletedAt: number,
  ultimoPayload: PayloadEntidadSyncMap[K] | null = null,
): SobreSync<K> {
  return {
    uuid,
    entidad,
    ownerId,
    updatedAt: deletedAt,
    deletedAt,
    payload: ultimoPayload
      ? {
          ...ultimoPayload,
          uuid,
          updatedAt: deletedAt,
          deletedAt,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// 2. Resolución determinista de conflictos (LWW + prioridad de borrado lógico)
// ---------------------------------------------------------------------------

/**
 * Resuelve el conflicto entre la versión local y la versión remota de un mismo registro (`uuid`):
 * - Regla 1: Si uno o ambos tienen `deletedAt !== null` (borrado lógico):
 *   - El borrado gana sobre cualquier edición cuyo `updatedAt` sea más viejo o igual al `deletedAt` (`deletedAt >= edicion.updatedAt`).
 *   - Solo una edición explícita estrictamente posterior (`edicion.updatedAt > borrado.deletedAt` con `edicion.deletedAt === null`)
 *     puede reactivar el registro.
 * - Regla 2: Si ambos son ediciones activas (`deletedAt === null`):
 *   - Gana el `updatedAt` más reciente. En caso de empate exacto de `updatedAt`, se conserva de forma determinista.
 */
export function resolverConflictoSync<K extends TipoEntidadSync>(
  a: SobreSync<K>,
  b: SobreSync<K>,
): SobreSync<K> {
  const aBorrado = a.deletedAt !== null;
  const bBorrado = b.deletedAt !== null;

  if (aBorrado && bBorrado) {
    const tsA = Math.max(a.updatedAt, a.deletedAt ?? 0);
    const tsB = Math.max(b.updatedAt, b.deletedAt ?? 0);
    return tsB > tsA ? b : a;
  }

  if (aBorrado && !bBorrado) {
    const tsBorrado = Math.max(a.updatedAt, a.deletedAt ?? 0);
    // El borrado gana sobre ediciones más viejas o simultáneas
    if (tsBorrado >= b.updatedAt) {
      return {
        ...a,
        updatedAt: tsBorrado,
        deletedAt: tsBorrado,
      };
    }
    return b;
  }

  if (!aBorrado && bBorrado) {
    const tsBorrado = Math.max(b.updatedAt, b.deletedAt ?? 0);
    // El borrado gana sobre ediciones más viejas o simultáneas
    if (tsBorrado >= a.updatedAt) {
      return {
        ...b,
        updatedAt: tsBorrado,
        deletedAt: tsBorrado,
      };
    }
    return a;
  }

  // Ambos activos: gana el updatedAt más reciente
  if (b.updatedAt > a.updatedAt) {
    return b;
  }
  return a;
}

/**
 * Fusiona dos colecciones de registros sincronizables sin duplicados (clave `entidad + uuid`),
 * aplicando `resolverConflictoSync` en cada colisión.
 */
export function fusionarLotesSync(
  existentes: readonly SobreSync[],
  entrantes: readonly SobreSync[],
  ownerIdRequerido?: string,
): SobreSync[] {
  const mapa = new Map<string, SobreSync>();

  const insertarOCombinar = (item: SobreSync) => {
    if (ownerIdRequerido && item.ownerId !== ownerIdRequerido) {
      // Regla de seguridad (RLS): se descarta cualquier fila que no pertenezca al dueño
      return;
    }
    const clave = `${item.entidad}::${item.uuid}`;
    const previo = mapa.get(clave);
    if (!previo) {
      mapa.set(clave, item);
    } else {
      mapa.set(clave, resolverConflictoSync(previo, item));
    }
  };

  for (const r of existentes) insertarOCombinar(r);
  for (const r of entrantes) insertarOCombinar(r);

  return Array.from(mapa.values());
}

// ---------------------------------------------------------------------------
// 3. Reglas de seguridad (RLS: cada fila solo accesible por su dueño)
// ---------------------------------------------------------------------------

export function verificarPropiedadFila(fila: SobreSync, userIdActual: string): boolean {
  return Boolean(userIdActual) && fila.ownerId === userIdActual;
}

export const SQL_RLS_SUPABASE_AUREON = `
-- Tabla unificada de sincronización de eventos AUREON en Supabase
create table if not exists public.aureon_sync_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  entidad text not null check (entidad in ('practice', 'mistake', 'focusSession', 'topicProgress', 'simulacro', 'settings')),
  uuid text not null,
  updated_at bigint not null,
  deleted_at bigint null,
  payload jsonb null,
  primary key (owner_id, entidad, uuid)
);

create index if not exists idx_aureon_sync_owner_updated
  on public.aureon_sync_records (owner_id, updated_at);

-- Activar Row Level Security (RLS): cada fila solo es accesible por su dueño
alter table public.aureon_sync_records enable row level security;

create policy "Dueño lee solo sus propias filas"
  on public.aureon_sync_records for select
  using (auth.uid() = owner_id);

create policy "Dueño inserta solo sus propias filas"
  on public.aureon_sync_records for insert
  with check (auth.uid() = owner_id);

create policy "Dueño actualiza solo sus propias filas"
  on public.aureon_sync_records for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
`.trim();

// ---------------------------------------------------------------------------
// 4. Proveedores de Nube: Almacén en Memoria (tests E2E Celular<->PC) y Supabase (Magic Link)
// ---------------------------------------------------------------------------

export interface ProveedorNubeSync {
  pushCambios(sesion: SesionUsuarioSync, cambios: readonly SobreSync[]): Promise<number>;
  pullCambios(sesion: SesionUsuarioSync, desdeUpdatedAt?: number): Promise<SobreSync[]>;
}

/**
 * Proveedor de nube con aislamiento estricto por dueño (RLS en memoria),
 * ideal para pruebas E2E multi-dispositivo (Celular offline -> Nube -> PC) y modo demo.
 */
export class NubeSyncEnMemoria implements ProveedorNubeSync {
  private registrosPorClave = new Map<string, SobreSync>();

  async pushCambios(sesion: SesionUsuarioSync, cambios: readonly SobreSync[]): Promise<number> {
    if (!sesion.userId) {
      throw new Error('Acceso denegado: se requiere usuario autenticado.');
    }
    let aplicados = 0;
    for (const entrante of cambios) {
      if (!verificarPropiedadFila(entrante, sesion.userId)) {
        throw new Error(
          `Violación RLS: el usuario ${sesion.userId} no puede modificar filas de ${entrante.ownerId}`,
        );
      }
      const clave = `${sesion.userId}::${entrante.entidad}::${entrante.uuid}`;
      const existente = this.registrosPorClave.get(clave);
      const ganador = existente ? resolverConflictoSync(existente, entrante) : entrante;
      this.registrosPorClave.set(clave, ganador);
      aplicados += 1;
    }
    return aplicados;
  }

  async pullCambios(sesion: SesionUsuarioSync, desdeUpdatedAt = 0): Promise<SobreSync[]> {
    if (!sesion.userId) {
      throw new Error('Acceso denegado: se requiere usuario autenticado.');
    }
    const resultado: SobreSync[] = [];
    for (const fila of this.registrosPorClave.values()) {
      // RLS: solo devuelve filas cuyo ownerId coincide exactamente con sesion.userId
      if (verificarPropiedadFila(fila, sesion.userId) && fila.updatedAt >= desdeUpdatedAt) {
        resultado.push(fila);
      }
    }
    return resultado;
  }
}

export interface ConfigSupabaseSync {
  supabaseUrl: string;
  supabaseAnonKey: string;
  fetchImpl?: typeof fetch;
}

export const SUPABASE_URL_DEFAULT =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  'https://ahmzeqvzsdadqihpfked.supabase.co';

export const SUPABASE_ANON_KEY_DEFAULT =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFobXplcXZ6c2RhZHFpaHBma2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMzU1MjksImV4cCI6MjEwODYxMTUyOX0.jAKVwsUEuFTnELcoeBwaWLl9X5KO41_pbvAl13L3QTw';

export const SUPABASE_CONFIG_DEFAULT: ConfigSupabaseSync = {
  supabaseUrl: SUPABASE_URL_DEFAULT,
  supabaseAnonKey: SUPABASE_ANON_KEY_DEFAULT,
};

export const CLAVE_STORAGE_SESION_SYNC = 'aureon-sesion-sync-v1';

export function guardarSesionSyncStorage(sesion: SesionUsuarioSync | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!sesion) {
      localStorage.removeItem(CLAVE_STORAGE_SESION_SYNC);
    } else {
      localStorage.setItem(CLAVE_STORAGE_SESION_SYNC, JSON.stringify(sesion));
    }
  } catch {
    // ignorar en entornos sin localStorage
  }
}

export function leerSesionSyncStorage(): SesionUsuarioSync | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CLAVE_STORAGE_SESION_SYNC);
    if (!raw) return null;
    return JSON.parse(raw) as SesionUsuarioSync;
  } catch {
    return null;
  }
}

/**
 * Extrae tokens de autenticación de la URL tras volver del Enlace Mágico.
 */
export function extraerTokensDeUrl(urlOrHash: string): {
  accessToken: string;
  refreshToken?: string;
} | null {
  try {
    const rawHash = urlOrHash.includes('#') ? urlOrHash.split('#')[1] : urlOrHash;
    if (!rawHash || !rawHash.includes('access_token')) return null;
    const params = new URLSearchParams(rawHash);
    const accessToken = params.get('access_token');
    if (!accessToken) return null;
    return {
      accessToken,
      refreshToken: params.get('refresh_token') ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Obtiene los datos del usuario autenticado en Supabase Auth con su access token.
 */
export async function obtenerUsuarioSupabase(
  config: ConfigSupabaseSync,
  accessToken: string,
): Promise<{ id: string; email: string }> {
  const fetcher = config.fetchImpl ?? fetch;
  const url = `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/user`;
  const resp = await fetcher(url, {
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!resp.ok) {
    throw new Error(`Error obteniendo usuario de Supabase (${resp.status})`);
  }
  const data = (await resp.json()) as { id: string; email: string };
  return { id: data.id, email: data.email };
}

/**
 * Inicia sesión o registra usuario con email y contraseña en Supabase (sin requerir confirmación por correo).
 */
export async function autenticarConPasswordSupabase(
  config: ConfigSupabaseSync,
  email: string,
  password: string,
): Promise<{ sesion: SesionUsuarioSync; esNuevo: boolean }> {
  const fetcher = config.fetchImpl ?? fetch;
  const baseUrl = config.supabaseUrl.replace(/\/$/, '');
  const emailLimpio = email.trim().toLowerCase();

  // 1. Intentar login
  const respLogin = await fetcher(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: emailLimpio, password }),
  });

  if (respLogin.ok) {
    const data = (await respLogin.json()) as {
      access_token: string;
      user: { id: string; email: string };
    };
    return {
      sesion: {
        userId: data.user.id,
        email: data.user.email,
        accessToken: data.access_token,
      },
      esNuevo: false,
    };
  }

  // 2. Si no existe, intentar signup
  const respSignup = await fetcher(`${baseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: emailLimpio, password }),
  });

  if (!respSignup.ok) {
    const errorBody = (await respSignup.json().catch(() => ({}))) as {
      msg?: string;
      message?: string;
      error_description?: string;
    };
    const mensaje =
      errorBody.msg ||
      errorBody.message ||
      errorBody.error_description ||
      `Error de autenticación (${respSignup.status})`;
    throw new Error(mensaje);
  }

  const dataSignup = (await respSignup.json()) as {
    access_token?: string;
    id?: string;
    user?: { id: string; email: string };
  };

  const userId = dataSignup.user?.id || dataSignup.id;
  if (!userId) {
    throw new Error('Supabase no devolvió el ID del usuario');
  }

  return {
    sesion: {
      userId,
      email: emailLimpio,
      accessToken: dataSignup.access_token,
    },
    esNuevo: true,
  };
}

/**
 * Envía el enlace mágico (Magic Link OTP) de Supabase Auth al correo del estudiante.
 */
export async function enviarEnlaceMagicoSupabase(
  config: ConfigSupabaseSync,
  email: string,
  redirectTo?: string,
): Promise<{ enviado: boolean; mensaje: string }> {
  const fetcher = config.fetchImpl ?? fetch;
  const url = `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/otp`;
  const resp = await fetcher(url, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.trim(),
      create_user: true,
      ...(redirectTo ? { options: { emailRedirectTo: redirectTo } } : {}),
    }),
  });

  if (!resp.ok) {
    throw new Error(`Error enviando enlace mágico (${resp.status})`);
  }

  return {
    enviado: true,
    mensaje: `Enlace mágico enviado a ${email.trim()}. Ábrelo en tu celular o PC para vincular el dispositivo.`,
  };
}

/**
 * Adaptador REST/PostgREST de Supabase para `public.aureon_sync_records`.
 */
export class ProveedorSupabaseSync implements ProveedorNubeSync {
  private readonly config: ConfigSupabaseSync;

  constructor(config: ConfigSupabaseSync) {
    this.config = config;
  }

  private get fetcher(): typeof fetch {
    return this.config.fetchImpl ?? fetch;
  }

  private headers(sesion: SesionUsuarioSync): Record<string, string> {
    const token = sesion.accessToken ?? this.config.supabaseAnonKey;
    return {
      apikey: this.config.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    };
  }

  async pushCambios(sesion: SesionUsuarioSync, cambios: readonly SobreSync[]): Promise<number> {
    if (cambios.length === 0) return 0;
    const remotos = await this.pullCambios(sesion, 0);
    const fusionados = fusionarLotesSync(remotos, cambios, sesion.userId);

    const filasPostgrest = fusionados.map((s) => ({
      owner_id: sesion.userId,
      entidad: s.entidad,
      uuid: s.uuid,
      updated_at: s.updatedAt,
      deleted_at: s.deletedAt,
      payload: s.payload,
    }));

    const endpoint = `${this.config.supabaseUrl.replace(/\/$/, '')}/rest/v1/aureon_sync_records?on_conflict=owner_id,entidad,uuid`;
    const resp = await this.fetcher(endpoint, {
      method: 'POST',
      headers: this.headers(sesion),
      body: JSON.stringify(filasPostgrest),
    });

    if (!resp.ok) {
      throw new Error(`Error en push Supabase (${resp.status})`);
    }
    return cambios.length;
  }

  async pullCambios(sesion: SesionUsuarioSync, desdeUpdatedAt = 0): Promise<SobreSync[]> {
    const base = `${this.config.supabaseUrl.replace(/\/$/, '')}/rest/v1/aureon_sync_records`;
    const query = `?owner_id=eq.${encodeURIComponent(sesion.userId)}&updated_at=gte.${desdeUpdatedAt}&select=*`;
    const resp = await this.fetcher(base + query, {
      method: 'GET',
      headers: this.headers(sesion),
    });

    if (!resp.ok) {
      throw new Error(`Error en pull Supabase (${resp.status})`);
    }

    const filas = (await resp.json()) as Array<{
      owner_id: string;
      entidad: TipoEntidadSync;
      uuid: string;
      updated_at: number;
      deleted_at: number | null;
      payload: PayloadEntidadSyncMap[TipoEntidadSync] | null;
    }>;

    return filas
      .filter((f) => f.owner_id === sesion.userId)
      .map((f) => ({
        uuid: f.uuid,
        entidad: f.entidad,
        ownerId: f.owner_id,
        updatedAt: Number(f.updated_at),
        deletedAt: f.deleted_at !== null ? Number(f.deleted_at) : null,
        payload: f.payload,
      }));
  }
}

// ---------------------------------------------------------------------------
// 5. Cola bidireccional y motor de sincronización sobre Dexie (`SincronizadorDispositivo`)
// ---------------------------------------------------------------------------

/**
 * Extrae todos los registros actuales de una instancia `AureonDB` como `SobreSync[]`,
 * combinándolos con la cola local de borrados lógicos (`tombstones`) para que los borrados
 * hechos sin red se propaguen al reconectar.
 */
export async function recolectarSobresLocalesDeDB(
  database: AureonDB,
  ownerId: string,
  colaOutbox: readonly SobreSync[] = [],
): Promise<SobreSync[]> {
  const snap = await database.leerSnapshotDatos();
  const sobres: SobreSync[] = [];

  for (const p of snap.practices) {
    sobres.push(envolverEventoParaSync('practice', p, ownerId));
  }
  for (const m of snap.mistakes) {
    sobres.push(envolverEventoParaSync('mistake', m, ownerId));
  }
  for (const f of snap.focusSessions) {
    sobres.push(envolverEventoParaSync('focusSession', f, ownerId));
  }
  for (const tp of snap.topicProgress) {
    sobres.push(envolverEventoParaSync('topicProgress', tp, ownerId));
  }
  for (const s of snap.simulacros) {
    sobres.push(envolverEventoParaSync('simulacro', s, ownerId));
  }
  if (snap.settings.actualizadoEn > 0 || (snap.settings.updatedAt ?? 0) > 0) {
    sobres.push(envolverEventoParaSync('settings', snap.settings, ownerId));
  }

  return fusionarLotesSync(sobres, colaOutbox, ownerId);
}

/**
 * Aplica los sobres ganadores tras el merge bidireccional en la base de datos local `AureonDB`:
 * - Inserta o actualiza los registros activos (`deletedAt === null`) sin duplicar jamás.
 * - Elimina de las tablas activas los registros cuyo ganador es un tombstone (`deletedAt !== null`).
 */
export async function aplicarSobresFusionadosEnDB(
  database: AureonDB,
  sobresFusionados: readonly SobreSync[],
): Promise<{ aplicados: number; eliminados: number }> {
  let aplicados = 0;
  let eliminados = 0;

  await database.transaction('rw', database.tablasDatos, async () => {
    for (const sobre of sobresFusionados) {
      if (sobre.deletedAt !== null || !sobre.payload) {
        // Borrado lógico ganador: eliminar de la tabla activa si existía
        eliminados += 1;
        switch (sobre.entidad) {
          case 'practice':
            await database.practices.delete(sobre.uuid);
            break;
          case 'mistake':
            await database.mistakes.delete(sobre.uuid);
            break;
          case 'focusSession':
            await database.focusSessions.delete(sobre.uuid);
            break;
          case 'simulacro':
            await database.simulacros.delete(sobre.uuid);
            break;
          case 'topicProgress': {
            const partes = sobre.uuid.split(':');
            if (partes.length === 3 && partes[1] && partes[2]) {
              await database.topicProgress.delete([partes[1], partes[2]]);
            }
            break;
          }
          case 'settings':
            break;
        }
        continue;
      }

      aplicados += 1;
      switch (sobre.entidad) {
        case 'practice':
          await database.practices.put(sobre.payload as Practice);
          break;
        case 'mistake':
          await database.mistakes.put(sobre.payload as Mistake);
          break;
        case 'focusSession':
          await database.focusSessions.put(sobre.payload as FocusSession);
          break;
        case 'topicProgress':
          await database.topicProgress.put(sobre.payload as TopicProgress);
          break;
        case 'simulacro':
          await database.simulacros.put(sobre.payload as Simulacro);
          break;
        case 'settings':
          await database.settings.put(sobre.payload as Settings);
          break;
      }
    }
  });

  return { aplicados, eliminados };
}

/**
 * Coordinador de sincronización bidireccional para un dispositivo (Celular o PC).
 * Nunca bloquea la interfaz cuando está offline (`enLinea = false`): encola los cambios
 * (incluyendo borrados lógicos) y los sincroniza al reconectar.
 */
export class CoordinadorSyncDispositivo {
  private readonly database: AureonDB;
  private readonly proveedor: ProveedorNubeSync;
  private sesion: SesionUsuarioSync | null;
  private enLinea: boolean;
  private outbox = new Map<string, SobreSync>();
  private estadoActual: EstadoIndicadorSync = 'local';
  private ultimoSyncEn = 0;

  constructor(params: {
    database: AureonDB;
    proveedor: ProveedorNubeSync;
    sesion?: SesionUsuarioSync | null;
    enLinea?: boolean;
  }) {
    this.database = params.database;
    this.proveedor = params.proveedor;
    this.sesion = params.sesion ?? null;
    this.enLinea = params.enLinea ?? true;
    this.estadoActual = this.sesion
      ? this.enLinea
        ? 'sincronizado'
        : 'pendiente_offline'
      : 'local';
  }

  get estado(): EstadoIndicadorSync {
    return this.estadoActual;
  }

  get pendientesEnCola(): number {
    return this.outbox.size;
  }

  get ultimoTimestampSync(): number {
    return this.ultimoSyncEn;
  }

  configurarSesion(nuevaSesion: SesionUsuarioSync | null): void {
    this.sesion = nuevaSesion;
    if (!nuevaSesion) {
      this.estadoActual = 'local';
    } else {
      this.estadoActual = this.enLinea ? 'sincronizado' : 'pendiente_offline';
    }
  }

  establecerConexion(online: boolean): void {
    this.enLinea = online;
    if (!this.sesion) {
      this.estadoActual = 'local';
    } else if (!online) {
      this.estadoActual = 'pendiente_offline';
    }
  }

  /**
   * Encola un cambio o un borrado lógico (`deletedAt`) en la cola de salida.
   * Nunca falla ni bloquea aunque no haya conexión o no exista sesión activa.
   */
  encolarCambio<K extends TipoEntidadSync>(
    entidad: K,
    registro: PayloadEntidadSyncMap[K],
    opciones: { updatedAt?: number; deletedAt?: number | null } = {},
  ): SobreSync<K> {
    const ownerId = this.sesion?.userId ?? 'local-user';
    const sobre = envolverEventoParaSync(entidad, registro, ownerId, opciones);
    const clave = `${entidad}::${sobre.uuid}`;
    const previo = this.outbox.get(clave) as SobreSync<K> | undefined;
    const ganador = previo ? resolverConflictoSync(previo, sobre) : sobre;
    this.outbox.set(clave, ganador);

    if (this.sesion && !this.enLinea) {
      this.estadoActual = 'pendiente_offline';
    }
    return ganador;
  }

  encolarBorradoLogico<K extends TipoEntidadSync>(
    entidad: K,
    uuid: string,
    deletedAt = Date.now(),
    ultimoPayload: PayloadEntidadSyncMap[K] | null = null,
  ): SobreSync<K> {
    const ownerId = this.sesion?.userId ?? 'local-user';
    const tombstone = crearTombstoneSync(entidad, uuid, ownerId, deletedAt, ultimoPayload);
    const clave = `${entidad}::${uuid}`;
    const previo = this.outbox.get(clave) as SobreSync<K> | undefined;
    const ganador = previo ? resolverConflictoSync(previo, tombstone) : tombstone;
    this.outbox.set(clave, ganador);

    if (this.sesion && !this.enLinea) {
      this.estadoActual = 'pendiente_offline';
    }
    return ganador;
  }

  /**
   * Ejecuta un ciclo bidireccional completo (Push + Pull + Merge en Dexie).
   * Si no hay cuenta o no hay red, retorna inmediatamente sin bloquear la app.
   */
  async sincronizarAhora(ahora = Date.now()): Promise<ResultadoCicloSync> {
    if (!this.sesion) {
      this.estadoActual = 'local';
      return {
        exito: true,
        estado: 'local',
        enviados: 0,
        recibidos: 0,
        aplicadosEnLocal: 0,
        eliminadosEnLocal: 0,
        timestampSync: ahora,
      };
    }

    if (!this.enLinea) {
      this.estadoActual = 'pendiente_offline';
      return {
        exito: false,
        estado: 'pendiente_offline',
        enviados: 0,
        recibidos: 0,
        aplicadosEnLocal: 0,
        eliminadosEnLocal: 0,
        timestampSync: ahora,
        mensajeError: 'Sin conexión: los cambios permanecen seguros en la cola local.',
      };
    }

    this.estadoActual = 'sincronizando';

    try {
      const ownerId = this.sesion.userId;
      // Normalizar ownerId de los elementos que se encolaron antes de iniciar sesión
      const colaNormalizada = Array.from(this.outbox.values()).map((item) => ({
        ...item,
        ownerId,
      }));

      // 1. Recolectar estado local completo de Dexie + outbox de tombstones
      const locales = await recolectarSobresLocalesDeDB(this.database, ownerId, colaNormalizada);

      // 2. Pull de los registros remotos del usuario
      const remotos = await this.proveedor.pullCambios(this.sesion, 0);

      // 3. Merge bidireccional determinista (LWW + prioridad de borrado lógico)
      const fusionados = fusionarLotesSync(locales, remotos, ownerId);

      // 4. Push de los sobres fusionados hacia la nube
      const enviados = await this.proveedor.pushCambios(this.sesion, fusionados);

      // 5. Aplicar el resultado fusionado en la base de datos local Dexie (sin duplicados)
      const { aplicados, eliminados } = await aplicarSobresFusionadosEnDB(
        this.database,
        fusionados,
      );

      // Conservar en memoria solo los tombstones para que no revivan localmente, vaciando las ediciones ya subidas
      const nuevosTombstones = new Map<string, SobreSync>();
      for (const s of fusionados) {
        if (s.deletedAt !== null) {
          nuevosTombstones.set(`${s.entidad}::${s.uuid}`, s);
        }
      }
      this.outbox = nuevosTombstones;
      this.ultimoSyncEn = ahora;
      this.estadoActual = 'sincronizado';

      return {
        exito: true,
        estado: 'sincronizado',
        enviados,
        recibidos: remotos.length,
        aplicadosEnLocal: aplicados,
        eliminadosEnLocal: eliminados,
        timestampSync: ahora,
      };
    } catch (err) {
      this.estadoActual = 'error';
      return {
        exito: false,
        estado: 'error',
        enviados: 0,
        recibidos: 0,
        aplicadosEnLocal: 0,
        eliminadosEnLocal: 0,
        timestampSync: ahora,
        mensajeError: err instanceof Error ? err.message : 'Error de red durante la sincronización',
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Opcional: Web Push con función programada para recordatorio diario y repasos vencidos
// ---------------------------------------------------------------------------

export interface SuscripcionWebPushConfig {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  horaRecordatorioDiario: string;
  userId: string;
}

export const ESPECIFICACION_CRON_WEB_PUSH = `
// Supabase Edge Function programada con pg_cron (todos los días 08:00 y 19:30 America/Lima):
// Consulta errores en estado 'repaso' con proximoRepaso <= hoy del dueño (deleted_at is null)
// y envía notificación Web Push firmada con VAPID para el recordatorio diario y repasos vencidos.
select cron.schedule(
  'aureon-web-push-diario',
  '30 19 * * *',
  $$ select net.http_post(url := current_setting('app.edge_push_url')) $$
);
`.trim();
