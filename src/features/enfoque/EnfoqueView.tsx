/**
 * Feature `enfoque` (Deep Work — `src/features/enfoque/EnfoqueView.tsx`):
 * 1. Selección de modo antes de iniciar: Sprint 25/5, Inmersión 50/10, Simulacro 90/15, con duraciones editables.
 * 2. Etiquetado obligatorio: Curso y Tipo de tarea (Teoría, Práctica DECO, Corrección de errores, Repaso espaciado).
 *    Prellenados desde "Hoy" o con lo último usado (1 toque en el caso normal). Botón Iniciar deshabilitado solo si falta alguno.
 * 3. Temporizador por marca de tiempo (sobrevive a recargas en localStorage y pestañas en segundo plano),
 *    Wake Lock de pantalla y aviso sonoro/vibración al terminar.
 * 4. Monitor de fatiga: al terminar un bloque de enfoque aparece un micro-popup de 1 clic "¿Nivel de fatiga? 1–5".
 *    Mientras no respondas, el descanso NO se deja en blanco (ya corre con la duración base y tras 8 s sin respuesta el popup se cierra solo).
 *    Si respondes 4 o 5, el descanso se alarga +5 min (`descansoAjustado`).
 * 5. Modo Zen: atenúa/colapsa el resto de la interfaz para que el temporizador domine la pantalla.
 * 6. Anillo SVG (`<RingProgress />`): fase de enfoque en `focus`, descanso en `rest`, gradiente animado al >= 85 % en `gamificado` y escala de grises en `oled`.
 * 7. Botón pequeño "Interrupción interna": suma 1 palito al contador de distracciones y calcula Calidad de Enfoque = distracciones por hora.
 * 8. Guarda `FocusSession` al terminar (`completa: true`) o cancelar (`completa: false`). Si fue "Práctica DECO", sugiere registrar la tanda con el curso prellenado.
 */
import { useEffect, useState } from 'react';
import {
  generarIdEstable,
  notificarFinDeBloqueEnfoque,
  TIPOS_TAREA_ENFOQUE,
  type CursoOMixId,
  type FocusSession,
  type TipoTareaEnfoque,
} from '../../data';
import {
  calcularCalidadEnfoque,
  calcularProgresoTemporizador,
  CURSOS,
  descansoAjustado,
  duracionesPorModo,
  formatearPalitosDistraccion,
  formatearRelojMMSS,
  pausarMarcaTiempo,
  reanudarMarcaTiempo,
  temasDeCurso,
  TIMEOUT_POPUP_FATIGA_MS,
  type CursoId,
  type Fatiga,
  type FechaISO,
  type MarcaTiempoTemporizador,
  type ModoTemporizado,
} from '../../domain';
import {
  Button,
  Chip,
  desbloquearAudio,
  emitirVibracionAlerta,
  KpiCard,
  reproducirCampanaElegante,
  RingProgress,
  type TipoTonoCampana,
} from '../../ui';
import { nombreCursoOMix } from '../practica/QuickRegisterSheet';

export const STORAGE_KEY_SESION_ENFOQUE = 'aureon-enfoque-activo-v1';

export interface EtiquetasEnfoquePrefill {
  modo?: ModoTemporizado;
  cursoId: CursoOMixId;
  temaId?: string | null;
  tipoTarea: TipoTareaEnfoque;
  minutosEnfoque?: number;
  minutosDescanso?: number;
  preguntasSugeridas?: number;
}

export interface SesionEnfoqueActiva {
  id: string;
  fecha: FechaISO;
  modo: ModoTemporizado;
  cursoId: CursoOMixId;
  temaId: string | null;
  tipoTarea: TipoTareaEnfoque;
  minutosEnfoqueConfig: number;
  minutosDescansoBase: number;
  minutosDescansoActual: number;
  preguntasSugeridas: number;
  inicioSesionMs: number;
  finEnfoqueMs: number | null;
  marca: MarcaTiempoTemporizador;
  distracciones: number;
  fatiga: Fatiga | null;
  popupFatigaExpiraMs: number | null;
  guardadaEnDb: boolean;
  zenActivo: boolean;
}

export function leerSesionEnfoquePersistida(): SesionEnfoqueActiva | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_SESION_ENFOQUE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SesionEnfoqueActiva;
    if (!parsed || typeof parsed.id !== 'string' || !parsed.marca) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function guardarSesionEnfoquePersistida(sesion: SesionEnfoqueActiva | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!sesion) {
      window.localStorage.removeItem(STORAGE_KEY_SESION_ENFOQUE);
    } else {
      window.localStorage.setItem(STORAGE_KEY_SESION_ENFOQUE, JSON.stringify(sesion));
    }
  } catch {
    // Ignorar errores de cuota de almacenamiento
  }
}

export function crearSesionEnfoqueActiva(params: {
  fechaHoy: FechaISO;
  modo: ModoTemporizado;
  cursoId: CursoOMixId;
  temaId: string | null;
  tipoTarea: TipoTareaEnfoque;
  minutosEnfoque: number;
  minutosDescanso: number;
  preguntasSugeridas?: number;
  ahoraMs?: number;
}): SesionEnfoqueActiva {
  const ahora = params.ahoraMs ?? Date.now();
  const minEnf = Math.max(1, Math.min(240, Math.trunc(params.minutosEnfoque)));
  const minDesc = Math.max(1, Math.min(60, Math.trunc(params.minutosDescanso)));

  return {
    id: generarIdEstable('foc', ahora),
    fecha: params.fechaHoy,
    modo: params.modo,
    cursoId: params.cursoId,
    temaId: params.temaId,
    tipoTarea: params.tipoTarea,
    minutosEnfoqueConfig: minEnf,
    minutosDescansoBase: minDesc,
    minutosDescansoActual: minDesc,
    preguntasSugeridas: params.preguntasSugeridas ?? Math.max(8, Math.round(minEnf * 0.6)),
    inicioSesionMs: ahora,
    finEnfoqueMs: null,
    marca: {
      fase: 'enfoque',
      duracionTotalMs: minEnf * 60_000,
      inicioTramoMs: ahora,
      acumuladoPrevioMs: 0,
    },
    distracciones: 0,
    fatiga: null,
    popupFatigaExpiraMs: null,
    guardadaEnDb: false,
    zenActivo: true,
  };
}

export const CATALOGO_MODOS_ENFOQUE: Readonly<
  Record<ModoTemporizado, { titulo: string; subtitulo: string; descripcion: string }>
> = {
  sprint: {
    titulo: 'Sprint 25/5',
    subtitulo: '25 min enfoque · 5 min descanso',
    descripcion: 'Repasos rápidos y flashcards Leitner.',
  },
  inmersion: {
    titulo: 'Inmersión 50/10',
    subtitulo: '50 min enfoque · 10 min descanso',
    descripcion: 'Teoría profunda, boletín y mapas mentales.',
  },
  simulacro: {
    titulo: 'Simulacro 90/15',
    subtitulo: '90 min enfoque · 15 min descanso',
    descripcion: 'Bloques ininterrumpidos de preguntas DECO.',
  },
};

export const ETIQUETAS_TIPO_TAREA: Readonly<Record<TipoTareaEnfoque, string>> = {
  teoria: 'Teoría',
  practica_deco: 'Práctica DECO',
  correccion_errores: 'Corrección de errores',
  repaso: 'Repaso espaciado',
};

function emitirAvisoFinFase(
  tipo: TipoTonoCampana,
  cursoNombre?: string,
  minutosEnfoque?: number,
): void {
  if (cursoNombre && minutosEnfoque) {
    notificarFinDeBloqueEnfoque(cursoNombre, minutosEnfoque);
  }
  emitirVibracionAlerta();
  void reproducirCampanaElegante(tipo);
}

export interface EnfoqueViewProps {
  fechaHoy: FechaISO;
  focusSessions: readonly FocusSession[];
  ultimoCursoId: CursoOMixId | null;
  sesionActiva: SesionEnfoqueActiva | null;
  onCambiarSesionActiva: (nueva: SesionEnfoqueActiva | null) => void;
  onGuardarFocusSession: (sesion: FocusSession) => Promise<void> | void;
  onSugerirRegistrarTandaDeco: (params: {
    cursoId: CursoOMixId;
    temaId: string | null;
    preguntasSugeridas: number;
  }) => void;
  ahoraMsOverride?: number;
}

export function EnfoqueView({
  fechaHoy,
  focusSessions,
  ultimoCursoId,
  sesionActiva,
  onCambiarSesionActiva,
  onGuardarFocusSession,
  onSugerirRegistrarTandaDeco,
  ahoraMsOverride,
}: EnfoqueViewProps) {
  // Configuración previa al inicio (prellenada con lo último usado para que cueste 1 toque)
  const [modoSeleccionado, setModoSeleccionado] = useState<ModoTemporizado>('sprint');
  const [minutosEnfoqueEdit, setMinutosEnfoqueEdit] = useState<number>(25);
  const [minutosDescansoEdit, setMinutosDescansoEdit] = useState<number>(5);
  const [cursoSeleccionado, setCursoSeleccionado] = useState<CursoOMixId | ''>(
    ultimoCursoId ?? 'quim',
  );
  const [temaSeleccionado, setTemaSeleccionado] = useState<string>('');
  const [tipoTareaSeleccionado, setTipoTareaSeleccionado] = useState<TipoTareaEnfoque | ''>(
    'practica_deco',
  );

  // Reloj reactivo para re-evaluar las marcas de tiempo
  const [relojMs, setRelojMs] = useState<number>(() => ahoraMsOverride ?? Date.now());
  const ahoraEfectivoMs = ahoraMsOverride ?? relojMs;

  // Wake Lock API para evitar que la pantalla se apague mientras el temporizador está corriendo
  useEffect(() => {
    const corriendo = sesionActiva !== null && sesionActiva.marca.inicioTramoMs !== null;
    if (!corriendo) return;

    let sentinel: { release: () => Promise<void> } | null = null;
    const navConWakeLock = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };

    if (typeof navConWakeLock?.wakeLock?.request === 'function') {
      void navConWakeLock.wakeLock
        .request('screen')
        .then((s) => {
          sentinel = s;
        })
        .catch(() => {
          // Ignorar rechazo de permiso en segundo plano
        });
    }

    return () => {
      if (sentinel) {
        void sentinel.release().catch(() => {});
      }
    };
  }, [sesionActiva]);

  // Tick cada 250 ms cuando hay una sesión activa corriendo (y escucha visibilitychange al volver de segundo plano)
  useEffect(() => {
    if (!sesionActiva || ahoraMsOverride !== undefined) return;

    const actualizarReloj = () => setRelojMs(Date.now());
    const idIntervalo = window.setInterval(actualizarReloj, 250);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        actualizarReloj();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(idIntervalo);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sesionActiva, ahoraMsOverride]);

  // Transiciones automáticas por marca de tiempo (fin de enfoque -> descanso + popup fatiga 8s; fin de popup 8s; fin de descanso)
  useEffect(() => {
    if (!sesionActiva) return;

    const prog = calcularProgresoTemporizador(sesionActiva.marca, ahoraEfectivoMs);

    // 1) Si terminó la fase de enfoque -> pasa de inmediato a descanso con duración base y abre popup de fatiga por 8 s
    if (sesionActiva.marca.fase === 'enfoque' && prog.faseTerminada) {
      emitirAvisoFinFase(
        'fin_enfoque',
        nombreCursoOMix(sesionActiva.cursoId),
        sesionActiva.minutosEnfoqueConfig,
      );
      const finEnf = sesionActiva.inicioSesionMs + sesionActiva.marca.duracionTotalMs;
      const focoCompletado: FocusSession = {
        id: sesionActiva.id,
        inicio: sesionActiva.inicioSesionMs,
        fin: ahoraEfectivoMs,
        fecha: sesionActiva.fecha,
        modo: sesionActiva.modo,
        cursoId: sesionActiva.cursoId,
        tipoTarea: sesionActiva.tipoTarea,
        minutosEnfoque: sesionActiva.minutosEnfoqueConfig,
        fatiga: sesionActiva.fatiga,
        distracciones: sesionActiva.distracciones,
        completa: true,
      };
      void onGuardarFocusSession(focoCompletado);

      // Si fue Práctica DECO, sugerir/abrir de inmediato la hoja para registrar la tanda con las preguntas resueltas
      if (sesionActiva.tipoTarea === 'practica_deco') {
        onSugerirRegistrarTandaDeco({
          cursoId: sesionActiva.cursoId,
          temaId: sesionActiva.temaId,
          preguntasSugeridas: sesionActiva.preguntasSugeridas,
        });
      }

      const enDescanso: SesionEnfoqueActiva = {
        ...sesionActiva,
        finEnfoqueMs: finEnf,
        guardadaEnDb: true,
        popupFatigaExpiraMs: ahoraEfectivoMs + TIMEOUT_POPUP_FATIGA_MS,
        marca: {
          fase: 'descanso',
          duracionTotalMs: sesionActiva.minutosDescansoBase * 60_000,
          inicioTramoMs: ahoraEfectivoMs,
          acumuladoPrevioMs: 0,
        },
      };
      onCambiarSesionActiva(enDescanso);
      return;
    }

    // 2) Si está en descanso y vencieron los 8 s del popup de fatiga sin respuesta -> cerrar popup manteniendo descansoBase
    if (
      sesionActiva.marca.fase === 'descanso' &&
      sesionActiva.popupFatigaExpiraMs !== null &&
      ahoraEfectivoMs >= sesionActiva.popupFatigaExpiraMs
    ) {
      onCambiarSesionActiva({
        ...sesionActiva,
        popupFatigaExpiraMs: null,
      });
      return;
    }

    // 3) Si terminó la fase de descanso -> pasa a estado 'completado'
    if (sesionActiva.marca.fase === 'descanso' && prog.faseTerminada) {
      emitirAvisoFinFase('fin_descanso');
      onCambiarSesionActiva({
        ...sesionActiva,
        popupFatigaExpiraMs: null,
        zenActivo: false,
        marca: {
          ...sesionActiva.marca,
          fase: 'completado',
          inicioTramoMs: null,
          acumuladoPrevioMs: sesionActiva.marca.duracionTotalMs,
        },
      });
    }
  }, [
    ahoraEfectivoMs,
    onCambiarSesionActiva,
    onGuardarFocusSession,
    onSugerirRegistrarTandaDeco,
    sesionActiva,
  ]);

  const cambiarModo = (nuevoModo: ModoTemporizado) => {
    setModoSeleccionado(nuevoModo);
    const d = duracionesPorModo(nuevoModo);
    setMinutosEnfoqueEdit(d.enfoque);
    setMinutosDescansoEdit(d.descanso);
  };

  const etiquetaValida = cursoSeleccionado !== '' && tipoTareaSeleccionado !== '';

  const iniciarBloqueManual = () => {
    if (!cursoSeleccionado || !tipoTareaSeleccionado) return;
    void desbloquearAudio();
    const ahora = ahoraMsOverride ?? Date.now();
    const nueva = crearSesionEnfoqueActiva({
      fechaHoy,
      modo: modoSeleccionado,
      cursoId: cursoSeleccionado,
      temaId: temaSeleccionado || null,
      tipoTarea: tipoTareaSeleccionado,
      minutosEnfoque: minutosEnfoqueEdit,
      minutosDescanso: minutosDescansoEdit,
      ahoraMs: ahora,
    });
    setRelojMs(ahora);
    onCambiarSesionActiva(nueva);
  };

  const alternarPausa = () => {
    if (!sesionActiva || sesionActiva.marca.fase === 'completado') return;
    void desbloquearAudio();
    const ahora = ahoraMsOverride ?? Date.now();
    const nuevaMarca =
      sesionActiva.marca.inicioTramoMs !== null
        ? pausarMarcaTiempo(sesionActiva.marca, ahora)
        : reanudarMarcaTiempo(sesionActiva.marca, ahora);
    onCambiarSesionActiva({
      ...sesionActiva,
      marca: nuevaMarca,
    });
  };

  const registrarInterrupcionInterna = () => {
    if (!sesionActiva) return;
    onCambiarSesionActiva({
      ...sesionActiva,
      distracciones: sesionActiva.distracciones + 1,
    });
  };

  const responderFatiga = async (nivel: Fatiga) => {
    if (!sesionActiva) return;
    const descansoFinalMin = descansoAjustado(sesionActiva.minutosDescansoBase, nivel);

    const actualizada: SesionEnfoqueActiva = {
      ...sesionActiva,
      fatiga: nivel,
      minutosDescansoActual: descansoFinalMin,
      popupFatigaExpiraMs: null,
      marca:
        sesionActiva.marca.fase === 'descanso'
          ? {
              ...sesionActiva.marca,
              duracionTotalMs: descansoFinalMin * 60_000,
            }
          : sesionActiva.marca,
    };
    onCambiarSesionActiva(actualizada);

    if (actualizada.guardadaEnDb) {
      await onGuardarFocusSession({
        id: actualizada.id,
        inicio: actualizada.inicioSesionMs,
        fin: actualizada.finEnfoqueMs ?? ahoraEfectivoMs,
        fecha: actualizada.fecha,
        modo: actualizada.modo,
        cursoId: actualizada.cursoId,
        tipoTarea: actualizada.tipoTarea,
        minutosEnfoque: actualizada.minutosEnfoqueConfig,
        fatiga: nivel,
        distracciones: actualizada.distracciones,
        completa: true,
      });
    }
  };

  // Terminar el bloque de enfoque ahora mismo (completa: true -> pasa a descanso y abre monitor de fatiga)
  const completarBloqueEnfoqueAhora = () => {
    if (!sesionActiva || sesionActiva.marca.fase !== 'enfoque') return;
    void desbloquearAudio();
    onCambiarSesionActiva({
      ...sesionActiva,
      marca: {
        ...sesionActiva.marca,
        inicioTramoMs: null,
        acumuladoPrevioMs: sesionActiva.marca.duracionTotalMs,
      },
    });
  };

  // Cancelar sesión antes de tiempo (guarda FocusSession con completa: false)
  const cancelarSesion = async () => {
    if (!sesionActiva) return;
    if (!sesionActiva.guardadaEnDb) {
      const prog = calcularProgresoTemporizador(sesionActiva.marca, ahoraEfectivoMs);
      const minutosReales = Math.max(1, prog.minutosTranscurridos);
      await onGuardarFocusSession({
        id: sesionActiva.id,
        inicio: sesionActiva.inicioSesionMs,
        fin: ahoraEfectivoMs,
        fecha: sesionActiva.fecha,
        modo: sesionActiva.modo,
        cursoId: sesionActiva.cursoId,
        tipoTarea: sesionActiva.tipoTarea,
        minutosEnfoque: minutosReales,
        fatiga: sesionActiva.fatiga,
        distracciones: sesionActiva.distracciones,
        completa: false,
      });
    }
    onCambiarSesionActiva(null);
  };

  const cerrarSesionCompletada = () => {
    onCambiarSesionActiva(null);
  };

  // Calidad de enfoque histórica / semanal (selector puro)
  const calidadGlobal = calcularCalidadEnfoque(focusSessions);
  const temasDisponibles =
    !cursoSeleccionado || cursoSeleccionado === 'mix'
      ? []
      : temasDeCurso(cursoSeleccionado as CursoId);

  const progresoActual = sesionActiva
    ? calcularProgresoTemporizador(sesionActiva.marca, ahoraEfectivoMs)
    : null;

  const popupFatigaVisible =
    sesionActiva !== null &&
    sesionActiva.popupFatigaExpiraMs !== null &&
    ahoraEfectivoMs < sesionActiva.popupFatigaExpiraMs &&
    sesionActiva.fatiga === null;

  const faseAnillo = sesionActiva?.marca.fase === 'descanso' ? 'rest' : 'focus';

  return (
    <div
      data-testid="enfoque-view"
      data-zen={sesionActiva?.zenActivo ? 'true' : 'false'}
      className="space-y-5"
    >
      {/* Si NO hay sesión activa: Configuración en 1 toque + KPIs de Calidad de Enfoque */}
      {!sesionActiva && (
        <>
          <section
            aria-label="Métricas de Calidad de Enfoque"
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <KpiCard
              label="Calidad de enfoque"
              value={`${calidadGlobal.distraccionesPorHora} / h`}
              badge={
                <Chip
                  tone={
                    calidadGlobal.nivel === 'alta'
                      ? 'success'
                      : calidadGlobal.nivel === 'media'
                        ? 'warn'
                        : 'danger'
                  }
                >
                  Calidad {calidadGlobal.nivel}
                </Chip>
              }
              subtitle="Distracciones por hora (selector puro)"
            />
            <KpiCard
              label="Tiempo de enfoque acumulado"
              value={`${calidadGlobal.totalHoras} h`}
              subtitle={`${calidadGlobal.totalMinutos} min en ${focusSessions.length} sesiones`}
            />
            <KpiCard
              label="Interrupciones registradas"
              value={calidadGlobal.totalDistracciones}
              subtitle={formatearPalitosDistraccion(calidadGlobal.totalDistracciones)}
            />
          </section>

          <section
            aria-labelledby="titulo-config-enfoque"
            data-testid="panel-config-enfoque"
            className="space-y-4 rounded-2xl border border-border bg-surface p-5"
          >
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 id="titulo-config-enfoque" className="text-base font-bold text-text">
                  Iniciar Bloque de Enfoque (Deep Work)
                </h1>
                <p className="text-xs text-text-muted">
                  Etiquetas prellenadas con tu última sesión: arranca con 1 solo toque.
                </p>
              </div>
              <Chip tone="accent">Wake Lock + Marca de tiempo</Chip>
            </header>

            {/* 1. Selección de modo (Sprint 25/5, Inmersión 50/10, Simulacro 90/15) */}
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">
                1. Modo de Enfoque (duraciones editables)
              </span>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {(['sprint', 'inmersion', 'simulacro'] as const).map((m) => {
                  const info = CATALOGO_MODOS_ENFOQUE[m];
                  const activo = modoSeleccionado === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      data-testid={`modo-enfoque-${m}`}
                      aria-pressed={activo}
                      onClick={() => cambiarModo(m)}
                      className={`flex min-h-11 flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                        activo
                          ? 'border-accent bg-surface-2 text-text'
                          : 'border-border bg-surface text-text hover:bg-surface-2'
                      }`}
                    >
                      <span className="text-sm font-bold text-accent">{info.titulo}</span>
                      <span className="font-mono text-xs text-text">{info.subtitulo}</span>
                      <span className="mt-1 text-[11px] text-text-muted">{info.descripcion}</span>
                    </button>
                  );
                })}
              </div>

              {/* Duraciones editables */}
              <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface-2 p-3 text-xs">
                <label className="flex items-center gap-2 text-text">
                  Enfoque (min):
                  <input
                    type="number"
                    aria-label="Minutos de enfoque"
                    data-testid="input-minutos-enfoque"
                    min={1}
                    max={240}
                    value={minutosEnfoqueEdit}
                    onChange={(e) =>
                      setMinutosEnfoqueEdit(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="min-h-11 w-20 rounded-lg border border-border bg-surface px-2.5 text-center font-mono text-sm font-bold text-text"
                  />
                </label>

                <label className="flex items-center gap-2 text-text">
                  Descanso base (min):
                  <input
                    type="number"
                    aria-label="Minutos de descanso"
                    data-testid="input-minutos-descanso"
                    min={1}
                    max={60}
                    value={minutosDescansoEdit}
                    onChange={(e) =>
                      setMinutosDescansoEdit(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="min-h-11 w-20 rounded-lg border border-border bg-surface px-2.5 text-center font-mono text-sm font-bold text-text"
                  />
                </label>
              </div>
            </div>

            {/* 2. Etiquetado obligatorio: Curso y Tipo de tarea */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-xs text-text-muted">
                2. Curso (obligatorio)
                <select
                  aria-label="Curso de enfoque"
                  data-testid="select-curso-enfoque"
                  value={cursoSeleccionado}
                  onChange={(e) => {
                    setCursoSeleccionado(e.target.value as CursoOMixId | '');
                    setTemaSeleccionado('');
                  }}
                  className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text"
                >
                  <option value="">— Selecciona un curso —</option>
                  {CURSOS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                  <option value="mix">MIX (Varios)</option>
                </select>
              </label>

              <label className="block text-xs text-text-muted">
                3. Tipo de tarea (obligatorio)
                <select
                  aria-label="Tipo de tarea de enfoque"
                  data-testid="select-tarea-enfoque"
                  value={tipoTareaSeleccionado}
                  onChange={(e) =>
                    setTipoTareaSeleccionado(e.target.value as TipoTareaEnfoque | '')
                  }
                  className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text"
                >
                  <option value="">— Selecciona tipo de tarea —</option>
                  {TIPOS_TAREA_ENFOQUE.map((t) => (
                    <option key={t} value={t}>
                      {ETIQUETAS_TIPO_TAREA[t]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-text-muted">
                Tema (opcional)
                <select
                  aria-label="Tema de enfoque"
                  value={temaSeleccionado}
                  disabled={!cursoSeleccionado || cursoSeleccionado === 'mix'}
                  onChange={(e) => setTemaSeleccionado(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text"
                >
                  <option value="">— General del curso —</option>
                  {temasDisponibles.map((t) => (
                    <option key={t.id} value={t.id}>
                      S{t.semana} · {t.titulo}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                data-testid="btn-iniciar-enfoque"
                disabled={!etiquetaValida}
                onClick={iniciarBloqueManual}
              >
                Iniciar Enfoque ({minutosEnfoqueEdit}/{minutosDescansoEdit} min)
              </Button>
            </div>
          </section>
        </>
      )}

      {/* Si HAY sesión activa: Temporizador dominante (Modo Zen) */}
      {sesionActiva && progresoActual && (
        <section
          aria-label="Temporizador de Enfoque Activo"
          data-testid="enfoque-activo-card"
          className={`mx-auto flex flex-col items-center justify-between gap-6 rounded-3xl border-2 p-6 transition-all ${
            sesionActiva.marca.fase === 'descanso'
              ? 'border-rest bg-surface'
              : 'border-focus bg-surface'
          } ${sesionActiva.zenActivo ? 'max-w-2xl py-10 shadow-2xl' : 'max-w-3xl'}`}
        >
          {/* Barra superior de etiquetas y botón Modo Zen */}
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={sesionActiva.marca.fase === 'descanso' ? 'accent' : 'warn'}>
                {sesionActiva.marca.fase === 'enfoque'
                  ? 'FASE ENFOQUE'
                  : sesionActiva.marca.fase === 'descanso'
                    ? `FASE DESCANSO (${sesionActiva.minutosDescansoActual}m)`
                    : 'SESIÓN COMPLETADA'}
              </Chip>
              <span className="text-sm font-bold text-text" data-testid="enfoque-etiqueta-curso">
                {nombreCursoOMix(sesionActiva.cursoId)}
              </span>
              <span className="text-xs text-text-muted" data-testid="enfoque-etiqueta-tarea">
                · {ETIQUETAS_TIPO_TAREA[sesionActiva.tipoTarea]}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                data-testid="btn-toggle-zen"
                onClick={() =>
                  onCambiarSesionActiva({
                    ...sesionActiva,
                    zenActivo: !sesionActiva.zenActivo,
                  })
                }
              >
                {sesionActiva.zenActivo ? 'Salir de Modo Zen' : 'Modo Zen'}
              </Button>
            </div>
          </div>

          {/* Anillo SVG <RingProgress /> con color por fase (focus vs rest) */}
          <div className="my-2 flex flex-col items-center">
            <RingProgress
              value={progresoActual.transcurridoSegundos}
              max={Math.max(1, Math.round(sesionActiva.marca.duracionTotalMs / 1_000))}
              size={220}
              strokeWidth={14}
              phase={faseAnillo}
              label={
                sesionActiva.marca.fase === 'descanso'
                  ? 'Progreso del descanso'
                  : 'Progreso del enfoque'
              }
              centerContent={
                <div className="space-y-1">
                  <div
                    data-testid="reloj-temporizador"
                    className="font-mono text-4xl font-extrabold tracking-tight text-text"
                  >
                    {formatearRelojMMSS(progresoActual.restanteSegundos)}
                  </div>
                  <div className="text-xs uppercase tracking-wider text-text-muted">
                    {sesionActiva.marca.fase === 'enfoque'
                      ? `${progresoActual.porcentaje}% del bloque`
                      : sesionActiva.marca.fase === 'descanso'
                        ? 'Recuperación activa'
                        : '¡Bloque cumplido!'}
                  </div>
                </div>
              }
            />
          </div>

          {/* Micro-popup NO bloqueante de fatiga (8 s): mientras no respondas, el descanso YA corre con la duración base */}
          {popupFatigaVisible && (
            <div
              role="region"
              aria-label="Monitor de fatiga"
              data-testid="popup-fatiga"
              className="w-full max-w-md rounded-2xl border border-accent bg-surface-2 p-4 text-center shadow-lg"
            >
              <p className="text-xs font-bold text-text">
                ¿Nivel de fatiga? 1–5{' '}
                <span className="font-normal text-text-muted">
                  (el descanso ya está corriendo; 4 o 5 suma +5 min)
                </span>
              </p>
              <div className="mt-2.5 flex items-center justify-center gap-2">
                {([1, 2, 3, 4, 5] as const).map((nivel) => (
                  <button
                    key={nivel}
                    type="button"
                    data-testid={`btn-fatiga-${nivel}`}
                    onClick={() => void responderFatiga(nivel)}
                    className={`min-h-11 min-w-11 rounded-xl border px-3 py-1.5 font-mono text-sm font-bold transition-colors ${
                      nivel >= 4
                        ? 'border-warn bg-surface text-warn hover:bg-surface-2'
                        : 'border-border bg-surface text-text hover:border-accent'
                    }`}
                  >
                    {nivel}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sugerencia de registrar tanda cuando el tipo de tarea fue Práctica DECO y el enfoque concluyó */}
          {sesionActiva.marca.fase !== 'enfoque' && sesionActiva.tipoTarea === 'practica_deco' && (
            <div
              data-testid="sugerencia-registrar-tanda-deco"
              className="flex w-full max-w-md flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent bg-surface-2 p-3.5 text-xs"
            >
              <div>
                <div className="font-bold text-text">
                  ¿Terminaste tu Práctica DECO de {nombreCursoOMix(sesionActiva.cursoId)}?
                </div>
                <div className="text-text-muted">
                  Registra tus aciertos y errores con el curso ya prellenado.
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                data-testid="btn-sugerencia-registrar-tanda"
                onClick={() =>
                  onSugerirRegistrarTandaDeco({
                    cursoId: sesionActiva.cursoId,
                    temaId: sesionActiva.temaId,
                    preguntasSugeridas: sesionActiva.preguntasSugeridas,
                  })
                }
              >
                Registrar tanda
              </Button>
            </div>
          )}

          {/* Botón pequeño "Interrupción interna" y contador de palitos */}
          <div className="flex w-full max-w-md flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-xs">
            <div>
              <span className="font-semibold text-text">Distracciones: </span>
              <span
                data-testid="contador-distracciones-sesion"
                className="font-mono font-bold text-warn"
              >
                {sesionActiva.distracciones}
              </span>{' '}
              <span
                data-testid="palitos-distracciones-sesion"
                className="ml-1 font-mono text-text-muted"
              >
                ({formatearPalitosDistraccion(sesionActiva.distracciones)})
              </span>
            </div>

            {sesionActiva.marca.fase === 'enfoque' && (
              <Button
                variant="secondary"
                size="sm"
                data-testid="btn-interrupcion-interna"
                onClick={registrarInterrupcionInterna}
              >
                + Interrupción interna
              </Button>
            )}
          </div>

          {/* Controles del temporizador */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {sesionActiva.marca.fase !== 'completado' && (
              <Button variant="secondary" data-testid="btn-pausar-reanudar" onClick={alternarPausa}>
                {sesionActiva.marca.inicioTramoMs !== null ? 'Pausar' : 'Reanudar'}
              </Button>
            )}

            {sesionActiva.marca.fase === 'enfoque' && (
              <>
                <Button
                  variant="primary"
                  data-testid="btn-completar-enfoque-ahora"
                  onClick={completarBloqueEnfoqueAhora}
                >
                  Concluir bloque de enfoque
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="btn-terminar-enfoque-abrir-tanda"
                  onClick={() => {
                    completarBloqueEnfoqueAhora();
                    onSugerirRegistrarTandaDeco({
                      cursoId: sesionActiva.cursoId,
                      temaId: sesionActiva.temaId,
                      preguntasSugeridas: sesionActiva.preguntasSugeridas,
                    });
                  }}
                >
                  Terminar enfoque y registrar tanda
                </Button>
              </>
            )}

            {sesionActiva.marca.fase === 'enfoque' ? (
              <Button
                variant="danger"
                data-testid="btn-cancelar-enfoque"
                onClick={() => void cancelarSesion()}
              >
                Cancelar (guardar parcial)
              </Button>
            ) : (
              <Button
                variant="primary"
                data-testid="btn-finalizar-descanso"
                onClick={cerrarSesionCompletada}
              >
                Finalizar sesión
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
