/**
 * Repositorios tipados para el modelo de eventos y selectores puros de agregación.
 * Todas las escrituras se ejecutan en transacciones Dexie y devuelven función de deshacer (Undo).
 */
import { lunesDe, sumarDias, type CursoId, type FechaISO } from '../domain';
import { db as defaultDb, type AureonDB } from './db';
import {
  focusSessionSchema,
  mistakeSchema,
  practiceSchema,
  preguntasDePractice,
  SETTINGS_POR_DEFECTO,
  settingsSchema,
  simulacroSchema,
  topicProgressSchema,
  type CursoOMixId,
  type EstadoMistake,
  type FocusSession,
  type Mistake,
  type MistakePhoto,
  type Practice,
  type Settings,
  type Simulacro,
  type TopicProgress,
} from './schema';

export interface OperacionConDeshacer<T> {
  valor: T;
  /** Revierte la mutación en una transacción rw. */
  deshacer: () => Promise<void>;
}

/**
 * Genera un identificador único estable basado en `crypto.randomUUID()` (o fallback determinista con entropía).
 */
export function generarIdEstable(prefijo: string, ahora = Date.now()): string {
  const uuidCorto =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().split('-')[0]
      : Math.random().toString(36).slice(2, 10);
  return `${prefijo}-${ahora}-${uuidCorto}`;
}

function esActivoSync<T extends { deletedAt?: number | null }>(registro: T): boolean {
  return registro.deletedAt === undefined || registro.deletedAt === null;
}

// ---------------------------------------------------------------------------
// Selectores puros sobre listas de eventos (nunca se guardan totales en DB)
// ---------------------------------------------------------------------------

export interface TotalesPractica {
  /** Total de preguntas (incluye registros "sin detalle" del v4). */
  preguntas: number;
  /** Preguntas con desglose de aciertos/errores. */
  conDetalle: number;
  /** Preguntas importadas del v4 editadas en tabla sin sesión (`sinDetalle: true`). */
  sinDetalle: number;
  ok: number;
  bad: number;
  /** Precisión en % (0–100) sobre preguntas con detalle, o null si no hay ninguna. */
  precision: number | null;
}

export function calcularTotalesPractica(practices: readonly Practice[]): TotalesPractica {
  let preguntas = 0;
  let conDetalle = 0;
  let sinDetalle = 0;
  let ok = 0;
  let bad = 0;

  for (const p of practices) {
    const q = preguntasDePractice(p);
    preguntas += q;
    if (p.sinDetalle) {
      sinDetalle += q;
    } else {
      conDetalle += p.ok + p.bad;
      ok += p.ok;
      bad += p.bad;
    }
  }

  const precision = conDetalle > 0 ? Math.min(100, Math.round((ok * 100) / conDetalle)) : null;
  return { preguntas, conDetalle, sinDetalle, ok, bad, precision };
}

export function filtrarPracticesEnRango(
  practices: readonly Practice[],
  desde: FechaISO,
  hasta: FechaISO,
  cursoId?: CursoOMixId,
): Practice[] {
  return practices.filter(
    (p) => p.fecha >= desde && p.fecha <= hasta && (cursoId === undefined || p.cursoId === cursoId),
  );
}

export function totalesPracticaSemana(
  practices: readonly Practice[],
  fechaReferencia: FechaISO,
  cursoId?: CursoOMixId,
): TotalesPractica {
  const lunes = lunesDe(fechaReferencia);
  const domingo = sumarDias(lunes, 6);
  return calcularTotalesPractica(filtrarPracticesEnRango(practices, lunes, domingo, cursoId));
}

export function contarErroresPorEstado(
  mistakes: readonly Mistake[],
): Record<EstadoMistake | 'porClasificar', number> {
  let abierto = 0;
  let repaso = 0;
  let dominado = 0;
  let porClasificar = 0;
  for (const m of mistakes) {
    if (m.estado === 'abierto') abierto++;
    else if (m.estado === 'repaso') repaso++;
    else dominado++;
    if (m.categoria === null) porClasificar++;
  }
  return { abierto, repaso, dominado, porClasificar };
}

export function calcularMinutosEnfoque(
  sessions: readonly FocusSession[],
  desde?: FechaISO,
  hasta?: FechaISO,
): number {
  return sessions.reduce((acc, s) => {
    if (desde !== undefined && s.fecha < desde) return acc;
    if (hasta !== undefined && s.fecha > hasta) return acc;
    return acc + s.minutosEnfoque;
  }, 0);
}

// ---------------------------------------------------------------------------
// Repositorios tipados con escrituras en transacción
// ---------------------------------------------------------------------------

export function crearRepositorios(database: AureonDB = defaultDb) {
  const practices = {
    async listar(): Promise<Practice[]> {
      const todos = await database.practices.orderBy('ts').reverse().toArray();
      return todos.filter(esActivoSync);
    },

    async porFechaRango(desde: FechaISO, hasta: FechaISO): Promise<Practice[]> {
      const todos = await database.practices
        .where('fecha')
        .between(desde, hasta, true, true)
        .toArray();
      return todos.filter(esActivoSync);
    },

    async porCurso(cursoId: CursoOMixId): Promise<Practice[]> {
      const todos = await database.practices.where('cursoId').equals(cursoId).toArray();
      return todos.filter(esActivoSync);
    },

    async registrar(
      entrada: Practice,
      estadoTema?: TopicProgress,
    ): Promise<OperacionConDeshacer<Practice>> {
      const validado = practiceSchema.parse({
        ...entrada,
        uuid: entrada.uuid ?? entrada.id,
        updatedAt: entrada.updatedAt ?? entrada.ts,
        deletedAt: entrada.deletedAt ?? null,
      });
      const validadoTema = estadoTema
        ? topicProgressSchema.parse({
            ...estadoTema,
            uuid: estadoTema.uuid ?? `tp:${estadoTema.cursoId}:${estadoTema.temaId}`,
            updatedAt: estadoTema.updatedAt ?? estadoTema.actualizadoEn,
            deletedAt: estadoTema.deletedAt ?? null,
          })
        : undefined;
      let previoPractice: Practice | undefined;
      let previoTema: TopicProgress | undefined;
      let previoSettings: Settings | undefined;

      await database.transaction(
        'rw',
        database.practices,
        database.topicProgress,
        database.settings,
        async () => {
          previoPractice = await database.practices.get(validado.id);
          await database.practices.put(validado);

          if (validadoTema) {
            previoTema = await database.topicProgress.get([
              validadoTema.cursoId,
              validadoTema.temaId,
            ]);
            await database.topicProgress.put(validadoTema);
          }

          previoSettings = await database.settings.get('default');
          const actualSettings = previoSettings ?? {
            ...SETTINGS_POR_DEFECTO,
          };
          const recientesPrevios = actualSettings.cursosRecientes ?? [];
          const nuevosRecientes = [
            validado.cursoId,
            ...recientesPrevios.filter((c) => c !== validado.cursoId),
          ].slice(0, 5);
          await database.settings.put({
            ...actualSettings,
            ultimoCursoId: validado.cursoId,
            cursosRecientes: nuevosRecientes,
            actualizadoEn: validado.ts,
            uuid: actualSettings.uuid ?? 'settings:default',
            updatedAt: validado.ts,
            deletedAt: null,
          });
        },
      );

      return {
        valor: validado,
        deshacer: async () => {
          await database.transaction(
            'rw',
            database.practices,
            database.topicProgress,
            database.settings,
            async () => {
              if (previoPractice) await database.practices.put(previoPractice);
              else await database.practices.delete(validado.id);

              if (validadoTema) {
                if (previoTema) await database.topicProgress.put(previoTema);
                else
                  await database.topicProgress.delete([validadoTema.cursoId, validadoTema.temaId]);
              }

              if (previoSettings) await database.settings.put(previoSettings);
              else await database.settings.delete('default');
            },
          );
        },
      };
    },

    async eliminar(id: string): Promise<OperacionConDeshacer<Practice | null>> {
      let eliminado: Practice | undefined;
      await database.transaction('rw', database.practices, async () => {
        eliminado = await database.practices.get(id);
        if (eliminado) await database.practices.delete(id);
      });
      return {
        valor: eliminado ?? null,
        deshacer: async () => {
          if (!eliminado) return;
          const copia = eliminado;
          await database.transaction('rw', database.practices, async () => {
            await database.practices.put(copia);
          });
        },
      };
    },
  };

  const mistakes = {
    async listar(): Promise<Mistake[]> {
      const todos = await database.mistakes.orderBy('creadoEn').reverse().toArray();
      return todos.filter(esActivoSync);
    },

    async listarAbiertos(): Promise<Mistake[]> {
      const todos = await database.mistakes.where('estado').equals('abierto').toArray();
      return todos.filter(esActivoSync);
    },

    async pendientesRepaso(hoy: FechaISO): Promise<Mistake[]> {
      const enRepaso = await database.mistakes.where('estado').equals('repaso').toArray();
      return enRepaso
        .filter(
          (m) =>
            esActivoSync(m) &&
            m.caja >= 1 &&
            m.caja <= 6 &&
            m.proximoRepaso !== null &&
            m.proximoRepaso <= hoy,
        )
        .sort((a, b) => (a.proximoRepaso ?? '').localeCompare(b.proximoRepaso ?? ''));
    },

    async guardar(entrada: Mistake): Promise<OperacionConDeshacer<Mistake>> {
      const ultimoHistTs = entrada.historial[entrada.historial.length - 1]?.ts ?? 0;
      const validado = mistakeSchema.parse({
        ...entrada,
        uuid: entrada.uuid ?? entrada.id,
        updatedAt: entrada.updatedAt ?? Math.max(entrada.creadoEn, ultimoHistTs),
        deletedAt: entrada.deletedAt ?? null,
      });
      let previo: Mistake | undefined;
      await database.transaction('rw', database.mistakes, async () => {
        previo = await database.mistakes.get(validado.id);
        await database.mistakes.put(validado);
      });
      return {
        valor: validado,
        deshacer: async () => {
          await database.transaction('rw', database.mistakes, async () => {
            if (previo) await database.mistakes.put(previo);
            else await database.mistakes.delete(validado.id);
          });
        },
      };
    },

    async guardarLote(entradas: readonly Mistake[]): Promise<OperacionConDeshacer<Mistake[]>> {
      const validados = entradas.map((e) => {
        const ultimoHistTs = e.historial[e.historial.length - 1]?.ts ?? 0;
        return mistakeSchema.parse({
          ...e,
          uuid: e.uuid ?? e.id,
          updatedAt: e.updatedAt ?? Math.max(e.creadoEn, ultimoHistTs),
          deletedAt: e.deletedAt ?? null,
        });
      });
      const ids = validados.map((e) => e.id);
      let previos: (Mistake | undefined)[] = [];
      await database.transaction('rw', database.mistakes, async () => {
        previos = await database.mistakes.bulkGet(ids);
        await database.mistakes.bulkPut(validados);
      });
      return {
        valor: validados,
        deshacer: async () => {
          await database.transaction('rw', database.mistakes, async () => {
            const restaurar = previos.filter((p): p is Mistake => p !== undefined);
            const borrar = ids.filter((_, idx) => previos[idx] === undefined);
            if (borrar.length > 0) await database.mistakes.bulkDelete(borrar);
            if (restaurar.length > 0) await database.mistakes.bulkPut(restaurar);
          });
        },
      };
    },

    async eliminar(id: string): Promise<OperacionConDeshacer<Mistake | null>> {
      let previo: Mistake | undefined;
      await database.transaction('rw', database.mistakes, async () => {
        previo = await database.mistakes.get(id);
        if (previo) await database.mistakes.delete(id);
      });
      return {
        valor: previo ?? null,
        deshacer: async () => {
          if (!previo) return;
          const copia = previo;
          await database.transaction('rw', database.mistakes, async () => {
            await database.mistakes.put(copia);
          });
        },
      };
    },
  };

  const focusSessions = {
    async listar(): Promise<FocusSession[]> {
      const todos = await database.focusSessions.orderBy('inicio').reverse().toArray();
      return todos.filter(esActivoSync);
    },

    async guardar(entrada: FocusSession): Promise<OperacionConDeshacer<FocusSession>> {
      const validado = focusSessionSchema.parse({
        ...entrada,
        uuid: entrada.uuid ?? entrada.id,
        updatedAt: entrada.updatedAt ?? entrada.fin,
        deletedAt: entrada.deletedAt ?? null,
      });
      let previo: FocusSession | undefined;
      await database.transaction('rw', database.focusSessions, async () => {
        previo = await database.focusSessions.get(validado.id);
        await database.focusSessions.put(validado);
      });
      return {
        valor: validado,
        deshacer: async () => {
          await database.transaction('rw', database.focusSessions, async () => {
            if (previo) await database.focusSessions.put(previo);
            else await database.focusSessions.delete(validado.id);
          });
        },
      };
    },

    async eliminar(id: string): Promise<OperacionConDeshacer<FocusSession | null>> {
      let previo: FocusSession | undefined;
      await database.transaction('rw', database.focusSessions, async () => {
        previo = await database.focusSessions.get(id);
        if (previo) await database.focusSessions.delete(id);
      });
      return {
        valor: previo ?? null,
        deshacer: async () => {
          if (!previo) return;
          const copia = previo;
          await database.transaction('rw', database.focusSessions, async () => {
            await database.focusSessions.put(copia);
          });
        },
      };
    },
  };

  const topicProgress = {
    async listar(): Promise<TopicProgress[]> {
      const todos = await database.topicProgress.toArray();
      return todos.filter(esActivoSync);
    },

    async porCurso(cursoId: CursoId): Promise<TopicProgress[]> {
      const todos = await database.topicProgress.where('cursoId').equals(cursoId).toArray();
      return todos.filter(esActivoSync);
    },

    async guardar(entrada: TopicProgress): Promise<OperacionConDeshacer<TopicProgress>> {
      const validado = topicProgressSchema.parse({
        ...entrada,
        uuid: entrada.uuid ?? `tp:${entrada.cursoId}:${entrada.temaId}`,
        updatedAt: entrada.updatedAt ?? entrada.actualizadoEn,
        deletedAt: entrada.deletedAt ?? null,
      });
      const clave: [string, string] = [validado.cursoId, validado.temaId];
      let previo: TopicProgress | undefined;
      await database.transaction('rw', database.topicProgress, async () => {
        previo = await database.topicProgress.get(clave);
        await database.topicProgress.put(validado);
      });
      return {
        valor: validado,
        deshacer: async () => {
          await database.transaction('rw', database.topicProgress, async () => {
            if (previo) await database.topicProgress.put(previo);
            else await database.topicProgress.delete(clave);
          });
        },
      };
    },
  };

  const simulacros = {
    async listar(): Promise<Simulacro[]> {
      const todos = await database.simulacros.orderBy('ts').reverse().toArray();
      return todos.filter(esActivoSync);
    },

    async guardar(
      entrada: Simulacro,
      erroresAsociados: readonly Mistake[] = [],
    ): Promise<OperacionConDeshacer<Simulacro>> {
      const validado = simulacroSchema.parse({
        ...entrada,
        uuid: entrada.uuid ?? entrada.id,
        updatedAt: entrada.updatedAt ?? entrada.ts,
        deletedAt: entrada.deletedAt ?? null,
      });
      const erroresVal = erroresAsociados.map((e) =>
        mistakeSchema.parse({
          ...e,
          uuid: e.uuid ?? e.id,
          updatedAt: e.updatedAt ?? e.creadoEn,
          deletedAt: e.deletedAt ?? null,
        }),
      );
      let previoSim: Simulacro | undefined;

      await database.transaction('rw', database.simulacros, database.mistakes, async () => {
        previoSim = await database.simulacros.get(validado.id);
        await database.simulacros.put(validado);
        if (erroresVal.length > 0) await database.mistakes.bulkPut(erroresVal);
      });

      return {
        valor: validado,
        deshacer: async () => {
          await database.transaction('rw', database.simulacros, database.mistakes, async () => {
            if (previoSim) await database.simulacros.put(previoSim);
            else await database.simulacros.delete(validado.id);
            if (erroresVal.length > 0) {
              await database.mistakes.bulkDelete(erroresVal.map((e) => e.id));
            }
          });
        },
      };
    },

    async eliminar(id: string): Promise<OperacionConDeshacer<Simulacro | null>> {
      let previo: Simulacro | undefined;
      await database.transaction('rw', database.simulacros, async () => {
        previo = await database.simulacros.get(id);
        if (previo) await database.simulacros.delete(id);
      });
      return {
        valor: previo ?? null,
        deshacer: async () => {
          if (!previo) return;
          const copia = previo;
          await database.transaction('rw', database.simulacros, async () => {
            await database.simulacros.put(copia);
          });
        },
      };
    },
  };

  const settings = {
    async obtener(): Promise<Settings> {
      const s = await database.settings.get('default');
      return s ?? { ...SETTINGS_POR_DEFECTO };
    },

    async actualizar(
      parcial: Partial<Omit<Settings, 'id'>>,
    ): Promise<OperacionConDeshacer<Settings>> {
      let previo: Settings = { ...SETTINGS_POR_DEFECTO };
      let nuevo: Settings = { ...SETTINGS_POR_DEFECTO };

      await database.transaction('rw', database.settings, async () => {
        previo = (await database.settings.get('default')) ?? { ...SETTINGS_POR_DEFECTO };
        const tsActual = parcial.actualizadoEn ?? Date.now();
        nuevo = settingsSchema.parse({
          ...previo,
          ...parcial,
          id: 'default',
          actualizadoEn: tsActual,
          uuid: previo.uuid ?? 'settings:default',
          updatedAt: parcial.updatedAt ?? tsActual,
          deletedAt: null,
        });
        await database.settings.put(nuevo);
      });

      return {
        valor: nuevo,
        deshacer: async () => {
          await database.transaction('rw', database.settings, async () => {
            await database.settings.put(previo);
          });
        },
      };
    },
  };

  const mistakePhotos = {
    async obtener(id: string): Promise<MistakePhoto | undefined> {
      return database.mistakePhotos.get(id);
    },

    async guardar(foto: MistakePhoto): Promise<OperacionConDeshacer<MistakePhoto>> {
      let previo: MistakePhoto | undefined;
      await database.transaction('rw', database.mistakePhotos, async () => {
        previo = await database.mistakePhotos.get(foto.id);
        await database.mistakePhotos.put(foto);
      });
      return {
        valor: foto,
        deshacer: async () => {
          await database.transaction('rw', database.mistakePhotos, async () => {
            if (previo) await database.mistakePhotos.put(previo);
            else await database.mistakePhotos.delete(foto.id);
          });
        },
      };
    },

    async eliminar(id: string): Promise<OperacionConDeshacer<MistakePhoto | null>> {
      let previo: MistakePhoto | undefined;
      await database.transaction('rw', database.mistakePhotos, async () => {
        previo = await database.mistakePhotos.get(id);
        if (previo) await database.mistakePhotos.delete(id);
      });
      return {
        valor: previo ?? null,
        deshacer: async () => {
          if (!previo) return;
          const copia = previo;
          await database.transaction('rw', database.mistakePhotos, async () => {
            await database.mistakePhotos.put(copia);
          });
        },
      };
    },
  };

  return {
    practices,
    mistakes,
    focusSessions,
    topicProgress,
    simulacros,
    settings,
    mistakePhotos,
  };
}

export const repositorios = crearRepositorios();
