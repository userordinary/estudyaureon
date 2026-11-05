/**
 * Exportación e importación versionada de AUREON (.json), autorrespaldo semanal
 * (8 copias rotativas en IndexedDB), recordatorio de descarga manual (>14 días)
 * y persistencia de almacenamiento (navigator.storage.persist()).
 */
import { diasEntre, fechaEnLima, lunesDe } from '../domain';
import { db as defaultDb, type AureonDB } from './db';
import {
  AUREON_BACKUP_FORMAT,
  AUREON_BACKUP_VERSION,
  aureonExportSchema,
  type AureonExportFile,
  type AutoBackupEntry,
  type BackupMeta,
} from './schema';

export const MAX_COPIAS_AUTORRESPALDO = 8;
export const DIAS_RECORDATORIO_DESCARGA_MANUAL = 14;

/**
 * Construye el objeto de exportación versionado de AUREON leyendo de la base de datos.
 */
export async function crearSnapshotExportacion(
  database: AureonDB = defaultDb,
  ahora = Date.now(),
): Promise<AureonExportFile> {
  const datos = await database.leerSnapshotDatos();
  const fechaExportacion = fechaEnLima(new Date(ahora));
  return aureonExportSchema.parse({
    app: AUREON_BACKUP_FORMAT,
    version: AUREON_BACKUP_VERSION,
    exportadoEn: ahora,
    fechaExportacion,
    datos,
  });
}

/**
 * Exporta la base de datos de AUREON a una cadena JSON versionada.
 * Si `marcarDescargaManual` es true, actualiza `ultimaDescargaManualEn` en `backupMeta`.
 */
export async function exportarAureonJSON(
  database: AureonDB = defaultDb,
  opciones: { marcarDescargaManual?: boolean; ahora?: number } = {},
): Promise<string> {
  const ahora = opciones.ahora ?? Date.now();
  const snapshot = await crearSnapshotExportacion(database, ahora);

  if (opciones.marcarDescargaManual) {
    await database.transaction('rw', database.backupMeta, async () => {
      const meta = await database.obtenerBackupMeta();
      await database.backupMeta.put({
        ...meta,
        ultimaDescargaManualEn: ahora,
      });
    });
  }

  return JSON.stringify(snapshot, null, 2);
}

/**
 * Valida y parsea un archivo `.json` de respaldo nativo de AUREON.
 */
export function parsearRespaldoAureon(contenido: unknown): AureonExportFile {
  const obj = typeof contenido === 'string' ? (JSON.parse(contenido) as unknown) : contenido;
  return aureonExportSchema.parse(obj);
}

/**
 * Importa un respaldo `.json` versionado de AUREON reemplazando las tablas en transacción.
 */
export async function importarAureonJSON(
  contenido: unknown,
  database: AureonDB = defaultDb,
): Promise<AureonExportFile> {
  const validado = parsearRespaldoAureon(contenido);
  await database.reemplazarDatosEnTransaccion(validado.datos);
  return validado;
}

/**
 * Guarda una copia en `autoBackups` y rota la cola para conservar como máximo 8 copias
 * (ordenadas de más reciente a más antigua por `creadoEn`).
 */
export async function guardarCopiaRotativa(
  database: AureonDB = defaultDb,
  opciones: {
    ahora?: number;
    motivo?: AutoBackupEntry['motivo'];
    forzarNuevaCopia?: boolean;
  } = {},
): Promise<AutoBackupEntry> {
  const ahora = opciones.ahora ?? Date.now();
  const motivo = opciones.motivo ?? 'semanal';
  const snapshot = await crearSnapshotExportacion(database, ahora);
  const fecha = snapshot.fechaExportacion;
  const semanaClave = lunesDe(fecha);
  const id =
    motivo === 'semanal' && !opciones.forzarNuevaCopia
      ? `autobackup-${semanaClave}`
      : `autobackup-${semanaClave}-${ahora}`;

  const nuevaEntrada: AutoBackupEntry = {
    id,
    semanaClave,
    creadoEn: ahora,
    fecha,
    motivo,
    snapshot,
  };

  await database.transaction('rw', database.autoBackups, database.backupMeta, async () => {
    await database.autoBackups.put(nuevaEntrada);

    // Rotación: mantener solo las 8 copias más recientes
    const todas = await database.autoBackups.orderBy('creadoEn').reverse().toArray();
    if (todas.length > MAX_COPIAS_AUTORRESPALDO) {
      const sobrantes = todas.slice(MAX_COPIAS_AUTORRESPALDO).map((c) => c.id);
      await database.autoBackups.bulkDelete(sobrantes);
    }

    const meta = await database.obtenerBackupMeta();
    await database.backupMeta.put({
      ...meta,
      ultimoAutoBackupEn: ahora,
      ultimaSemanaAutoBackup: semanaClave,
    });
  });

  return nuevaEntrada;
}

/**
 * Ejecuta el autorrespaldo semanal si aún no existe copia para la semana actual (lunes ISO).
 * Devuelve la copia creada o `null` si la semana ya estaba respaldada.
 */
export async function ejecutarAutorrespaldoSemanalSiCorresponde(
  database: AureonDB = defaultDb,
  ahora = Date.now(),
): Promise<AutoBackupEntry | null> {
  const fechaHoy = fechaEnLima(new Date(ahora));
  const semanaActual = lunesDe(fechaHoy);
  const meta = await database.obtenerBackupMeta();

  if (meta.ultimaSemanaAutoBackup === semanaActual) {
    const existente = await database.autoBackups.where('semanaClave').equals(semanaActual).first();
    if (existente) return null;
  }

  return guardarCopiaRotativa(database, { ahora, motivo: 'semanal' });
}

/**
 * Lista las copias automáticas almacenadas en IndexedDB de la más reciente a la más antigua.
 */
export async function listarCopiasAutorrespaldo(
  database: AureonDB = defaultDb,
): Promise<AutoBackupEntry[]> {
  return database.autoBackups.orderBy('creadoEn').reverse().toArray();
}

/**
 * Restaura el estado completo de AUREON a partir de una copia guardada en `autoBackups`.
 */
export async function restaurarDesdeCopiaAutorrespaldo(
  backupId: string,
  database: AureonDB = defaultDb,
): Promise<AureonExportFile> {
  const entrada = await database.autoBackups.get(backupId);
  if (!entrada) {
    throw new Error(`No existe la copia de autorrespaldo con id "${backupId}"`);
  }
  const validado = aureonExportSchema.parse(entrada.snapshot);
  await database.reemplazarDatosEnTransaccion(validado.datos);
  return validado;
}

export interface EstadoRecordatorioDescarga {
  debeRecordar: boolean;
  diasSinDescargar: number | null;
  nuncaDescargado: boolean;
}

/**
 * Determina si han pasado más de 14 días desde la última descarga manual de respaldo
 * (o si nunca se ha descargado pero ya existen eventos registrados).
 */
export function evaluarRecordatorioDescargaManual(
  meta: BackupMeta,
  ahora = Date.now(),
  tieneDatos = true,
): EstadoRecordatorioDescarga {
  if (meta.ultimaDescargaManualEn === null) {
    return {
      debeRecordar: tieneDatos,
      diasSinDescargar: null,
      nuncaDescargado: true,
    };
  }
  const fechaUltima = fechaEnLima(new Date(meta.ultimaDescargaManualEn));
  const fechaHoy = fechaEnLima(new Date(ahora));
  const dias = Math.max(0, diasEntre(fechaUltima, fechaHoy));
  return {
    debeRecordar: dias > DIAS_RECORDATORIO_DESCARGA_MANUAL,
    diasSinDescargar: dias,
    nuncaDescargado: false,
  };
}

export async function verificarRecordatorioDescargaManual(
  database: AureonDB = defaultDb,
  ahora = Date.now(),
): Promise<EstadoRecordatorioDescarga> {
  const [meta, totalPractices, totalMistakes, totalSims] = await Promise.all([
    database.obtenerBackupMeta(),
    database.practices.count(),
    database.mistakes.count(),
    database.simulacros.count(),
  ]);
  const tieneDatos = totalPractices + totalMistakes + totalSims > 0;
  return evaluarRecordatorioDescargaManual(meta, ahora, tieneDatos);
}

export interface ResultadoPersistenciaStorage {
  soportado: boolean;
  persistente: boolean;
}

/**
 * Solicita almacenamiento persistente al navegador (`navigator.storage.persist()`)
 * para evitar que el sistema operativo purgue IndexedDB bajo presión de espacio.
 */
export async function solicitarPersistenciaAlmacenamiento(
  nav: {
    storage?: {
      persist?: () => Promise<boolean>;
      persisted?: () => Promise<boolean>;
    };
  } | null = typeof navigator !== 'undefined' ? navigator : null,
): Promise<ResultadoPersistenciaStorage> {
  const storage = nav?.storage;
  if (!storage || typeof storage.persist !== 'function') {
    return { soportado: false, persistente: false };
  }
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) {
      return { soportado: true, persistente: true };
    }
    const concedido = await storage.persist();
    return { soportado: true, persistente: Boolean(concedido) };
  } catch {
    return { soportado: true, persistente: false };
  }
}
