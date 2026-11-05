/**
 * Base de datos IndexedDB con Dexie, versionada y con soporte de migraciones de esquema.
 */
import Dexie, { type Table, type Transaction } from 'dexie';
import {
  BACKUP_META_INICIAL,
  SETTINGS_POR_DEFECTO,
  type AureonDataPayload,
  type AutoBackupEntry,
  type BackupMeta,
  type FocusSession,
  type Mistake,
  type MistakePhoto,
  type Practice,
  type Settings,
  type Simulacro,
  type TopicProgress,
} from './schema';

export const AUREON_DB_NAME = 'aureon-db';
export const AUREON_SCHEMA_VERSION = 3;

/**
 * Normaliza un registro Mistake garantizando los invariantes entre `estado`, `caja` y `proximoRepaso`
 * durante la migración v1 -> v2 o saneamiento de registros.
 */
export function normalizarMistakeMigracion(m: Mistake): Mistake {
  const caja = Math.max(0, Math.min(7, Math.trunc(m.caja)));
  const estado =
    caja >= 7
      ? 'dominado'
      : m.estado === 'dominado'
        ? 'dominado'
        : caja >= 1
          ? 'repaso'
          : m.estado === 'repaso'
            ? 'repaso'
            : 'abierto';
  const proximoRepaso = estado === 'dominado' || estado === 'abierto' ? null : m.proximoRepaso;
  return {
    ...m,
    caja: estado === 'dominado' ? 7 : estado === 'abierto' ? 0 : Math.max(1, caja),
    estado,
    proximoRepaso,
    historial: Array.isArray(m.historial) ? m.historial : [],
  };
}

export class AureonDB extends Dexie {
  practices!: Table<Practice, string>;
  mistakes!: Table<Mistake, string>;
  focusSessions!: Table<FocusSession, string>;
  topicProgress!: Table<TopicProgress, [string, string]>;
  simulacros!: Table<Simulacro, string>;
  settings!: Table<Settings, 'default'>;
  autoBackups!: Table<AutoBackupEntry, string>;
  backupMeta!: Table<BackupMeta, 'backup-meta'>;
  mistakePhotos!: Table<MistakePhoto, string>;

  constructor(nombre = AUREON_DB_NAME) {
    super(nombre);

    // v1: tablas núcleo de eventos y ajustes
    this.version(1).stores({
      practices: 'id, ts, fecha, cursoId, temaId, origen, [fecha+cursoId]',
      mistakes: 'id, creadoEn, cursoId, temaId, categoria, estado, caja, proximoRepaso',
      focusSessions: 'id, inicio, fecha, cursoId, modo, tipoTarea',
      topicProgress: '[cursoId+temaId], cursoId, temaId, estado, actualizadoEn',
      simulacros: 'id, ts, fecha, tipo, revisado',
      settings: 'id',
    });

    // v2: tablas de autorrespaldo rotativo + metadatos de respaldo y saneamiento de Mistakes
    this.version(2)
      .stores({
        practices: 'id, ts, fecha, cursoId, temaId, origen, [fecha+cursoId]',
        mistakes: 'id, creadoEn, cursoId, temaId, categoria, estado, caja, proximoRepaso',
        focusSessions: 'id, inicio, fecha, cursoId, modo, tipoTarea',
        topicProgress: '[cursoId+temaId], cursoId, temaId, estado, actualizadoEn',
        simulacros: 'id, ts, fecha, tipo, revisado',
        settings: 'id',
        autoBackups: 'id, creadoEn, semanaClave, fecha',
        backupMeta: 'id',
      })
      .upgrade(async (tx: Transaction) => {
        await tx
          .table<Mistake, string>('mistakes')
          .toCollection()
          .modify((m) => {
            const norm = normalizarMistakeMigracion(m);
            m.caja = norm.caja;
            m.estado = norm.estado;
            m.proximoRepaso = norm.proximoRepaso;
            m.historial = norm.historial;
          });
      });

    // v3: tabla mistakePhotos para almacenar capturas Blob + miniatura en IndexedDB
    this.version(AUREON_SCHEMA_VERSION).stores({
      practices: 'id, ts, fecha, cursoId, temaId, origen, [fecha+cursoId]',
      mistakes: 'id, creadoEn, cursoId, temaId, categoria, estado, caja, proximoRepaso',
      focusSessions: 'id, inicio, fecha, cursoId, modo, tipoTarea',
      topicProgress: '[cursoId+temaId], cursoId, temaId, estado, actualizadoEn',
      simulacros: 'id, ts, fecha, tipo, revisado',
      settings: 'id',
      autoBackups: 'id, creadoEn, semanaClave, fecha',
      backupMeta: 'id',
      mistakePhotos: 'id, creadoEn',
    });
  }

  /**Tablas de dominio (excluyendo las copias de seguridad rotativas). */
  get tablasDatos(): Table[] {
    return [
      this.practices,
      this.mistakes,
      this.focusSessions,
      this.topicProgress,
      this.simulacros,
      this.settings,
      this.mistakePhotos,
    ];
  }

  /** Lee una instantánea atómica de todos los datos de estudio, ajustes y fotos de errores. */
  async leerSnapshotDatos(): Promise<AureonDataPayload> {
    return this.transaction('r', this.tablasDatos, async () => {
      const [
        practices,
        mistakes,
        focusSessions,
        topicProgress,
        simulacros,
        settingsActual,
        fotosRaw,
      ] = await Promise.all([
        this.practices.toArray(),
        this.mistakes.toArray(),
        this.focusSessions.toArray(),
        this.topicProgress.toArray(),
        this.simulacros.toArray(),
        this.settings.get('default'),
        this.mistakePhotos.toArray(),
      ]);
      const mistakePhotos = fotosRaw.map((f) => ({
        id: f.id,
        mimeType: f.mimeType,
        miniaturaDataUrl: f.miniaturaDataUrl,
        creadoEn: f.creadoEn,
      }));
      return {
        practices,
        mistakes,
        focusSessions,
        topicProgress,
        simulacros,
        settings: settingsActual ?? { ...SETTINGS_POR_DEFECTO },
        ...(mistakePhotos.length > 0 ? { mistakePhotos } : {}),
      };
    });
  }

  /** Reemplaza atómicamente todas las tablas de datos en una única transacción rw. */
  async reemplazarDatosEnTransaccion(datos: AureonDataPayload): Promise<void> {
    await this.transaction('rw', this.tablasDatos, async () => {
      await Promise.all([
        this.practices.clear(),
        this.mistakes.clear(),
        this.focusSessions.clear(),
        this.topicProgress.clear(),
        this.simulacros.clear(),
        this.settings.clear(),
        this.mistakePhotos.clear(),
      ]);
      const fotosRestauradas: MistakePhoto[] = (datos.mistakePhotos ?? []).map((f) => ({
        id: f.id,
        blob: new Blob([], { type: f.mimeType || 'image/jpeg' }),
        mimeType: f.mimeType,
        miniaturaDataUrl: f.miniaturaDataUrl,
        creadoEn: f.creadoEn,
      }));
      await Promise.all([
        datos.practices.length > 0 ? this.practices.bulkPut(datos.practices) : Promise.resolve(),
        datos.mistakes.length > 0 ? this.mistakes.bulkPut(datos.mistakes) : Promise.resolve(),
        datos.focusSessions.length > 0
          ? this.focusSessions.bulkPut(datos.focusSessions)
          : Promise.resolve(),
        datos.topicProgress.length > 0
          ? this.topicProgress.bulkPut(datos.topicProgress)
          : Promise.resolve(),
        datos.simulacros.length > 0 ? this.simulacros.bulkPut(datos.simulacros) : Promise.resolve(),
        this.settings.put(datos.settings),
        fotosRestauradas.length > 0
          ? this.mistakePhotos.bulkPut(fotosRestauradas)
          : Promise.resolve(),
      ]);
    });
  }

  /** Vacía todas las tablas de datos de estudio y restaura ajustes por defecto en transacción. */
  async borrarDatosEstudio(): Promise<void> {
    await this.reemplazarDatosEnTransaccion({
      practices: [],
      mistakes: [],
      focusSessions: [],
      topicProgress: [],
      simulacros: [],
      settings: { ...SETTINGS_POR_DEFECTO },
    });
  }

  async obtenerBackupMeta(): Promise<BackupMeta> {
    const meta = await this.backupMeta.get('backup-meta');
    return meta ?? { ...BACKUP_META_INICIAL };
  }
}

export function crearBaseDeDatos(nombre = AUREON_DB_NAME): AureonDB {
  return new AureonDB(nombre);
}

export const db = crearBaseDeDatos();
