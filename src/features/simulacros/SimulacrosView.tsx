/**
 * Feature `simulacros` (`src/features/simulacros/SimulacrosView.tsx` — PROMPT 7):
 * 1. Registro por curso (1.ª–4.ª CEPRE o Admisión): correctas e incorrectas con blancos autocalculados,
 *    avance con Tab, pegado rápido de fila de números y validación en vivo contra la capacidad de cada curso.
 * 2. Puntaje por sección y total con `domain/scoring`. Acumulado CEPRE por SUMA DIRECTA (nunca multiplicar por %).
 *    Comparación contra último puesto, primer puesto y meta personal de esa evaluación + brecha exacta restante.
 * 3. Cronómetro de simulacro de 3 h (Bloque 1 [90m] → Pausa [5m] → Bloque 2 [90m]) por marca de tiempo, con Wake Lock y aviso sonoro.
 * 4. Al guardar nace con `revisado: false` y abre la "Revisión de errores": muestra por curso "te faltan clasificar X de Y incorrectas",
 *    exige categoría OBLIGATORIA para cada error (`origen: 'simulacro'`, entra a Leitner Caja 1) y pasa a `revisado: true`
 *    únicamente cuando todas las incorrectas están clasificadas y no hay errores sin categoría.
 * 5. Historial con fecha y hora (`ts`), editar y borrar con confirmación y Deshacer.
 * 6. Cero diagnósticos de texto, rankings, proyecciones con bandas ni gráficos (los gráficos viven solo en "Comando").
 */
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  CATALOGO_CATEGORIAS_ERROR,
  CATEGORIAS_ERROR,
  generarIdEstable,
  type CategoriaError,
  type Mistake,
  type MistakePhoto,
  type Settings,
  type Simulacro,
} from '../../data';
import {
  activarRepasoError,
  areaDeCarrera,
  avanzarFaseCronometroSimulacro,
  calcularEstadoRevisionSimulacro,
  calcularProgresoTemporizador,
  clavesActivasSimulacro,
  compararSimulacroContraReferencias,
  crearCronometroSimulacro3h,
  CURSOS,
  formatearRelojMMSS,
  parsearPegadoRapidoSimulacro,
  REGLAS_EVALUACION,
  temasDeCurso,
  TIPOS_EVAL,
  validarYCalcularSimulacroPorCurso,
  type ClavePorCurso,
  type CursoId,
  type EstadoCronometroSimulacro,
  type FechaISO,
  type TipoEval,
} from '../../domain';
import { Button, Chip, KpiCard, RingProgress } from '../../ui';

export const STORAGE_KEY_CRONO_SIMULACRO = 'aureon-cronometro-simulacro-v1';

function leerCronoSimulacroPersistido(): EstadoCronometroSimulacro | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_CRONO_SIMULACRO);
    if (!raw) return null;
    return JSON.parse(raw) as EstadoCronometroSimulacro;
  } catch {
    return null;
  }
}

export function guardarCronoSimulacroPersistido(estado: EstadoCronometroSimulacro | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!estado) {
      window.localStorage.removeItem(STORAGE_KEY_CRONO_SIMULACRO);
    } else {
      window.localStorage.setItem(STORAGE_KEY_CRONO_SIMULACRO, JSON.stringify(estado));
    }
  } catch {
    // Ignorar errores de cuota
  }
}

function nombreClaveSimulacro(clave: ClavePorCurso): string {
  if (clave === 'act') return 'Actitudinal';
  return CURSOS.find((c) => c.id === clave)?.nombre ?? clave;
}

function formatearFechaHoraTs(fecha: FechaISO, ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fecha} · ${hh}:${mm}`;
}

function leerArchivoComoDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

function emitirAvisoSonoroSimulacro(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([250, 100, 250]);
    }
  } catch {
    // Ignorar en entornos sin soporte
  }
}

export interface SimulacrosViewProps {
  fechaHoy: FechaISO;
  settings: Settings;
  simulacros: readonly Simulacro[];
  mistakes: readonly Mistake[];
  onGuardarSimulacro: (simulacro: Simulacro) => Promise<void> | void;
  onEliminarSimulacro: (id: string) => Promise<void> | void;
  onGuardarMistakeSimulacro: (
    error: Mistake,
    fotoNueva?: MistakePhoto,
    simulacroActualizado?: Simulacro,
  ) => Promise<void> | void;
}

export function SimulacrosView({
  fechaHoy,
  settings,
  simulacros,
  mistakes,
  onGuardarSimulacro,
  onEliminarSimulacro,
  onGuardarMistakeSimulacro,
}: SimulacrosViewProps) {
  const area = areaDeCarrera(settings.carreraId);

  // Estado del formulario de registro / edición por curso
  const [editandoSimulacroId, setEditandoSimulacroId] = useState<string | null>(null);
  const [tipoSeleccionado, setTipoSeleccionado] = useState<TipoEval>('cepre1');
  const [fechaSeleccionada, setFechaSeleccionada] = useState<FechaISO>(fechaHoy);
  const [respuestasPorClave, setRespuestasPorClave] = useState<
    Partial<Record<ClavePorCurso, { ok: number; bad: number }>>
  >({});
  const [textoPegadoRapido, setTextoPegadoRapido] = useState<string>('');

  // Simulacro actualmente abierto en "Revisión de errores"
  const [simulacroEnRevisionId, setSimulacroEnRevisionId] = useState<string | null>(null);
  const panelRevisionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (simulacroEnRevisionId) {
      setTimeout(() => {
        if (typeof panelRevisionRef.current?.scrollIntoView === 'function') {
          panelRevisionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 60);
    }
  }, [simulacroEnRevisionId]);

  // Confirmación antes de borrar en el historial
  const [confirmandoBorrarId, setConfirmandoBorrarId] = useState<string | null>(null);

  // Formulario de clasificación de error dentro de la Revisión de errores (categoría OBLIGATORIA)
  const [cursoErrorRev, setCursoErrorRev] = useState<CursoId>('quim');
  const [categoriaErrorRev, setCategoriaErrorRev] = useState<CategoriaError | ''>('');
  const [temaErrorRev, setTemaErrorRev] = useState<string>('');
  const [notaErrorRev, setNotaErrorRev] = useState<string>('');
  const [fotoErrorRev, setFotoErrorRev] = useState<{
    blob: Blob;
    mimeType: string;
    miniaturaDataUrl: string;
  } | null>(null);

  // Cronómetro de 3 h (Bloque 1 · Pausa · Bloque 2) por marca de tiempo
  const [crono3h, setCrono3h] = useState<EstadoCronometroSimulacro | null>(() =>
    leerCronoSimulacroPersistido(),
  );
  const [relojMs, setRelojMs] = useState<number>(() => Date.now());

  const actualizarCrono3h = (nuevo: EstadoCronometroSimulacro | null) => {
    setCrono3h(nuevo);
    guardarCronoSimulacroPersistido(nuevo);
  };

  // Wake Lock y tick para el cronómetro de 3 h
  useEffect(() => {
    if (!crono3h || crono3h.inicioTramoMs === null) return;

    let sentinel: { release: () => Promise<void> } | null = null;
    const navWake = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (typeof navWake?.wakeLock?.request === 'function') {
      void navWake.wakeLock
        .request('screen')
        .then((s) => {
          sentinel = s;
        })
        .catch(() => {});
    }

    const interval = window.setInterval(() => {
      const ahora = Date.now();
      setRelojMs(ahora);
    }, 500);

    return () => {
      window.clearInterval(interval);
      if (sentinel) void sentinel.release().catch(() => {});
    };
  }, [crono3h]);

  const clavesActivas = clavesActivasSimulacro(tipoSeleccionado);
  const validacion = validarYCalcularSimulacroPorCurso(tipoSeleccionado, area, respuestasPorClave);

  // Comparación en vivo (incluyendo el simulacro en borrador dentro de la lista para proyectar el acumulado y la brecha)
  const puntajeBorrador = validacion.puntaje?.total ?? 0;
  const listaSimulacrosConActual = simulacros.map((s) => ({
    tipo: s.tipo,
    total: s.total,
  }));

  const comparacionActual = compararSimulacroContraReferencias({
    tipo: tipoSeleccionado,
    puntaje: puntajeBorrador,
    carreraId: settings.carreraId,
    metaPersonal: settings.metaPersonal,
    simulacrosGuardados: listaSimulacrosConActual,
  });

  const cambiarCeldaCurso = (clave: ClavePorCurso, campo: 'ok' | 'bad', valorStr: string) => {
    const num = valorStr === '' ? 0 : Math.max(0, Number.parseInt(valorStr, 10) || 0);
    setRespuestasPorClave((prev) => {
      const actual = prev[clave] ?? { ok: 0, bad: 0 };
      return {
        ...prev,
        [clave]: {
          ...actual,
          [campo]: num,
        },
      };
    });
  };

  const aplicarPegadoRapido = () => {
    if (!textoPegadoRapido.trim()) return;
    const parseado = parsearPegadoRapidoSimulacro(textoPegadoRapido, clavesActivas);
    setRespuestasPorClave((prev) => ({
      ...prev,
      ...parseado,
    }));
    setTextoPegadoRapido('');
  };

  const guardarSimulacroFormulario = async (e: FormEvent) => {
    e.preventDefault();
    if (!validacion.valido || !validacion.puntaje) return;

    const ahora = Date.now();
    const idSim = editandoSimulacroId ?? generarIdEstable('sim', ahora);

    // Regla 4: Al guardar, el simulacro queda con revisado: false y se abre la Revisión de errores
    const nuevoSimulacro: Simulacro = {
      id: idSim,
      fecha: fechaSeleccionada,
      ts: ahora,
      tipo: tipoSeleccionado,
      porCurso: validacion.porCurso,
      secciones: validacion.secciones,
      total: validacion.puntaje.total,
      revisado: false,
    };

    await onGuardarSimulacro(nuevoSimulacro);
    setEditandoSimulacroId(null);
    setSimulacroEnRevisionId(idSim);

    // Preseleccionar el primer curso que tenga incorrectas pendientes
    const primerCursoConMalas = CURSO_IDS_CON_MALAS(validacion.porCurso)[0];
    if (primerCursoConMalas) {
      setCursoErrorRev(primerCursoConMalas);
    }
    setCategoriaErrorRev('');
  };

  const iniciarEdicionSimulacro = (sim: Simulacro) => {
    setEditandoSimulacroId(sim.id);
    setTipoSeleccionado(sim.tipo);
    setFechaSeleccionada(sim.fecha);
    const mapa: Partial<Record<ClavePorCurso, { ok: number; bad: number }>> = {};
    for (const [k, v] of Object.entries(sim.porCurso)) {
      if (v) {
        mapa[k as ClavePorCurso] = { ok: v.ok, bad: v.bad };
      }
    }
    setRespuestasPorClave(mapa);
  };

  const simulacroEnRevision = simulacros.find((s) => s.id === simulacroEnRevisionId) ?? null;

  const erroresDeSimulacroEnRevision = simulacroEnRevision
    ? mistakes.filter((m) => m.simulacroId === simulacroEnRevision.id)
    : [];

  const estadoRevision = simulacroEnRevision
    ? calcularEstadoRevisionSimulacro(simulacroEnRevision.porCurso, erroresDeSimulacroEnRevision)
    : null;

  const manejarFotoRevision = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const miniaturaDataUrl = await leerArchivoComoDataUrl(file);
    setFotoErrorRev({
      blob: file,
      mimeType: file.type || 'image/jpeg',
      miniaturaDataUrl,
    });
  };

  const agregarErrorEnRevision = async (e: FormEvent) => {
    e.preventDefault();
    // En la revisión de simulacro la categoría es OBLIGATORIA
    if (!simulacroEnRevision || !categoriaErrorRev) return;

    const ahora = Date.now();
    const fotoId = fotoErrorRev ? generarIdEstable('foto-sim', ahora) : null;
    const fotoObj: MistakePhoto | undefined =
      fotoErrorRev && fotoId
        ? {
            id: fotoId,
            blob: fotoErrorRev.blob,
            mimeType: fotoErrorRev.mimeType,
            miniaturaDataUrl: fotoErrorRev.miniaturaDataUrl,
            creadoEn: ahora,
          }
        : undefined;

    // Entra al circuito de repaso espaciado Leitner Caja 1 con origen 'simulacro'
    const transicionLeitner = activarRepasoError(simulacroEnRevision.fecha);
    const nuevoMistake: Mistake = {
      id: generarIdEstable('err-sim', ahora),
      origen: 'simulacro',
      simulacroId: simulacroEnRevision.id,
      cursoId: cursoErrorRev,
      temaId: temaErrorRev || null,
      categoria: categoriaErrorRev,
      nota:
        notaErrorRev.trim() ||
        `Error en ${REGLAS_EVALUACION[simulacroEnRevision.tipo].nombre} (${nombreClaveSimulacro(cursoErrorRev)})`,
      fotoId,
      creadoEn: ahora,
      fecha: simulacroEnRevision.fecha,
      estado: transicionLeitner.estado,
      caja: transicionLeitner.cajaNueva,
      proximoRepaso: transicionLeitner.proximoRepaso,
      historial: [],
    };

    // Evaluamos si con este nuevo error ya quedan todas las incorrectas clasificadas
    const nuevaListaErrores = [...erroresDeSimulacroEnRevision, nuevoMistake];
    const nuevoEstadoRev = calcularEstadoRevisionSimulacro(
      simulacroEnRevision.porCurso,
      nuevaListaErrores,
    );

    const simulacroActualizado: Simulacro | undefined = nuevoEstadoRev.listoParaMarcarRevisado
      ? { ...simulacroEnRevision, revisado: true }
      : undefined;

    await onGuardarMistakeSimulacro(nuevoMistake, fotoObj, simulacroActualizado);

    setNotaErrorRev('');
    setFotoErrorRev(null);
    setCategoriaErrorRev('');

    // Si aún quedan cursos con incorrectas por clasificar, preseleccionar el primero pendiente
    const siguienteCursoPendiente = nuevoEstadoRev.pendientesPorCurso.find((p) => p.faltan > 0);
    if (siguienteCursoPendiente) {
      setCursoErrorRev(siguienteCursoPendiente.cursoId);
    }
  };

  const marcarSimulacroComoRevisadoManualmente = async () => {
    if (!simulacroEnRevision || !estadoRevision?.listoParaMarcarRevisado) return;
    await onGuardarSimulacro({
      ...simulacroEnRevision,
      revisado: true,
    });
  };

  // Progreso del cronómetro de 3 h si está activo
  const progresoCrono3h = crono3h
    ? calcularProgresoTemporizador(
        {
          fase: crono3h.fase === 'pausa' ? 'descanso' : 'enfoque',
          duracionTotalMs: crono3h.duracionFaseMs,
          inicioTramoMs: crono3h.inicioTramoMs,
          acumuladoPrevioMs: crono3h.acumuladoPrevioMs,
        },
        relojMs,
      )
    : null;

  return (
    <div className="space-y-6" data-testid="simulacros-view">
      {/* 1. Resumen de Acumulado CEPRE (SUMA DIRECTA) y Brecha Exacta */}
      <section
        aria-label="Acumulado CEPRE y comparación contra referencias"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          label="Acumulado CEPRE (Suma Directa)"
          value={comparacionActual.acumulado.total}
          badge={
            <Chip tone="accent">{comparacionActual.acumulado.rendidas.length}/4 rendidas</Chip>
          }
          subtitle={`Objetivo (${comparacionActual.objetivoCiclo.fuente}): ${comparacionActual.objetivoCiclo.total}`}
        />

        <KpiCard
          label="Brecha exacta restante"
          value={comparacionActual.brechaCiclo}
          badge={
            <Chip tone={comparacionActual.brechaCiclo <= 0 ? 'success' : 'warn'}>
              {comparacionActual.brechaCiclo <= 0 ? 'Meta superada' : 'Por cubrir'}
            </Chip>
          }
          subtitle="Objetivo total − Acumulado directo"
        />

        <KpiCard
          label={`Corte Último / Primero (${REGLAS_EVALUACION[tipoSeleccionado].nombre})`}
          value={`${comparacionActual.ultimoPuestoEval} / ${comparacionActual.primerPuestoEval}`}
          badge={
            !comparacionActual.esCorteOficial ? (
              <Chip tone="warn" data-testid="simulacros-badge-corte-estimado">
                Corte estimado
              </Chip>
            ) : (
              <Chip tone="neutral">Corte oficial</Chip>
            )
          }
          subtitle={`Dif. vs corte: ${comparacionActual.diferenciaUltimoEval >= 0 ? '+' : ''}${comparacionActual.diferenciaUltimoEval}`}
        />

        <KpiCard
          label={`Meta personal (${REGLAS_EVALUACION[tipoSeleccionado].nombre})`}
          value={comparacionActual.metaPersonalEval}
          subtitle={`Dif. vs meta: ${comparacionActual.diferenciaMetaEval >= 0 ? '+' : ''}${comparacionActual.diferenciaMetaEval}`}
        />
      </section>

      {/* 2. Cronómetro de Simulacro de 3 h (Bloque 1 [90m] → Pausa [5m] → Bloque 2 [90m]) */}
      <section
        aria-labelledby="sec-crono-3h"
        data-testid="panel-cronometro-3h"
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4"
      >
        <div>
          <h2 id="sec-crono-3h" className="text-sm font-bold text-text">
            Cronómetro de Simulacro Oficial (3 h · Bloque 1 [90m] + Pausa [5m] + Bloque 2 [90m])
          </h2>
          <p className="text-xs text-text-muted">
            Por marca de tiempo con Wake Lock y aviso sonoro. Independiente de los bloques Pomodoro.
          </p>
        </div>

        {!crono3h ? (
          <Button
            variant="secondary"
            size="sm"
            data-testid="btn-iniciar-crono-3h"
            onClick={() => {
              const ahora = Date.now();
              setRelojMs(ahora);
              actualizarCrono3h(crearCronometroSimulacro3h(ahora));
            }}
          >
            Iniciar Cronómetro 3 h
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <RingProgress
              value={progresoCrono3h?.transcurridoSegundos ?? 0}
              max={Math.max(1, Math.round(crono3h.duracionFaseMs / 1_000))}
              size={64}
              strokeWidth={6}
              phase={crono3h.fase === 'pausa' ? 'rest' : 'focus'}
              centerContent={
                <span data-testid="reloj-crono-3h" className="text-[11px] font-bold">
                  {formatearRelojMMSS(progresoCrono3h?.restanteSegundos ?? 0)}
                </span>
              }
            />
            <div className="text-xs">
              <div className="font-bold uppercase text-accent" data-testid="fase-crono-3h">
                {crono3h.fase === 'bloque1'
                  ? 'Bloque 1 (90 min)'
                  : crono3h.fase === 'pausa'
                    ? 'Pausa intermedia (5 min)'
                    : crono3h.fase === 'bloque2'
                      ? 'Bloque 2 (90 min)'
                      : 'Simulacro 3 h finalizado'}
              </div>
              <div className="mt-1 flex gap-1.5">
                {crono3h.fase !== 'completado' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="btn-avanzar-fase-crono-3h"
                    onClick={() => {
                      emitirAvisoSonoroSimulacro();
                      const ahora = Date.now();
                      setRelojMs(ahora);
                      actualizarCrono3h(avanzarFaseCronometroSimulacro(crono3h, ahora));
                    }}
                  >
                    Siguiente fase →
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="btn-detener-crono-3h"
                  onClick={() => actualizarCrono3h(null)}
                >
                  Reiniciar
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. Revisión de Errores del Simulacro (abierta automáticamente al guardar) */}
      {simulacroEnRevision && estadoRevision && (
        <section
          ref={panelRevisionRef}
          aria-labelledby="sec-revision-errores-sim"
          data-testid="panel-revision-simulacro"
          className="space-y-4 rounded-2xl border-2 border-accent bg-surface p-5"
        >
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="sec-revision-errores-sim" className="text-base font-bold text-text">
                Revisión de Errores · {REGLAS_EVALUACION[simulacroEnRevision.tipo].nombre} (
                {simulacroEnRevision.fecha})
              </h2>
              <p className="text-xs text-text-muted">
                Clasifica todas las respuestas incorrectas con su categoría obligatoria para que el
                simulacro pase a «Revisado».
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Chip
                tone={simulacroEnRevision.revisado ? 'success' : 'warn'}
                data-testid="chip-estado-revisado-actual"
              >
                {simulacroEnRevision.revisado
                  ? '✓ Simulacro Revisado'
                  : `Faltan clasificar: ${estadoRevision.totalFaltan}`}
              </Chip>
              <Button
                variant="secondary"
                size="sm"
                data-testid="btn-marcar-simulacro-revisado"
                disabled={!estadoRevision.listoParaMarcarRevisado}
                onClick={() => void marcarSimulacroComoRevisadoManualmente()}
              >
                Marcar como revisado
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSimulacroEnRevisionId(null)}>
                Cerrar panel
              </Button>
            </div>
          </header>

          {/* Resumen por curso: "te faltan clasificar X de Y incorrectas" */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {estadoRevision.pendientesPorCurso.map((item) => (
              <div
                key={item.cursoId}
                data-testid={`pendientes-curso-${item.cursoId}`}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                  item.faltan > 0
                    ? 'border-warn bg-surface-2 text-text'
                    : 'border-success bg-surface-2 text-success'
                }`}
              >
                <span className="font-bold">{nombreClaveSimulacro(item.cursoId)}</span>
                <span>
                  Te faltan clasificar <b>{item.faltan}</b> de <b>{item.incorrectas}</b> incorrectas
                </span>
              </div>
            ))}
          </div>

          {/* Formulario para añadir un error clasificado (categoría OBLIGATORIA) */}
          {estadoRevision.totalFaltan > 0 && (
            <form
              onSubmit={(e) => void agregarErrorEnRevision(e)}
              className="space-y-3 rounded-xl border border-border bg-surface-2 p-4 text-xs"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="text-text-muted">
                  Curso del error (obligatorio)
                  <select
                    aria-label="Curso del error de simulacro"
                    data-testid="select-curso-error-sim"
                    value={cursoErrorRev}
                    onChange={(e) => {
                      setCursoErrorRev(e.target.value as CursoId);
                      setTemaErrorRev('');
                    }}
                    className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text"
                  >
                    {CURSOS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-text-muted">
                  Categoría de error (OBLIGATORIA)
                  <select
                    aria-label="Categoría obligatoria del error"
                    data-testid="select-categoria-error-sim"
                    value={categoriaErrorRev}
                    onChange={(e) => setCategoriaErrorRev(e.target.value as CategoriaError | '')}
                    className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text"
                  >
                    <option value="">— Selecciona categoría obligatoria —</option>
                    {CATEGORIAS_ERROR.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATALOGO_CATEGORIAS_ERROR[cat].etiqueta}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-text-muted">
                  Tema (opcional)
                  <select
                    aria-label="Tema opcional del error de simulacro"
                    value={temaErrorRev}
                    onChange={(e) => setTemaErrorRev(e.target.value)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text"
                  >
                    <option value="">— General del curso —</option>
                    {temasDeCurso(cursoErrorRev).map((t) => (
                      <option key={t.id} value={t.id}>
                        S{t.semana} · {t.titulo}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <label className="text-text-muted">
                  Nota corta (opcional)
                  <input
                    type="text"
                    data-testid="input-nota-error-sim"
                    value={notaErrorRev}
                    onChange={(e) => setNotaErrorRev(e.target.value)}
                    placeholder="Ej. Fallé por signo en conservación de energía..."
                    className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text"
                  />
                </label>
              </div>

              {/* Cuadro destacado para foto en revisión de simulacro */}
              <div className="flex flex-col gap-1 text-xs text-text-muted">
                <span className="font-semibold text-text">Foto de la pregunta (opcional)</span>
                {!fotoErrorRev ? (
                  <label
                    data-testid="dropzone-foto-simulacro"
                    className="group relative flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface p-3 text-center transition-all hover:border-accent hover:bg-surface-2"
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void manejarFotoRevision(e)}
                      className="sr-only"
                    />
                    <span
                      className="text-xl transition-transform group-hover:scale-110"
                      aria-hidden="true"
                    >
                      📸
                    </span>
                    <span className="mt-0.5 font-semibold text-text group-hover:text-accent">
                      Toca o arrastra para adjuntar imagen del error
                    </span>
                  </label>
                ) : (
                  <div className="flex items-center justify-between rounded-xl border-2 border-accent bg-surface p-2.5">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={fotoErrorRev.miniaturaDataUrl}
                        alt="Miniatura error"
                        className="h-12 w-12 rounded-lg border border-accent object-cover"
                      />
                      <span className="text-xs font-bold text-text">✓ Foto lista</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setFotoErrorRev(null)}>
                      Quitar
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  data-testid="btn-agregar-error-simulacro"
                  disabled={categoriaErrorRev === ''}
                >
                  + Clasificar error y enviar a Leitner
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* 4. Formulario de Registro de Simulacro POR CURSO */}
      <section
        aria-labelledby="sec-registro-simulacro"
        data-testid="form-registro-simulacro"
        className="space-y-4 rounded-2xl border border-border bg-surface p-5"
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 id="sec-registro-simulacro" className="text-base font-bold text-text">
              {editandoSimulacroId ? 'Editar Simulacro' : 'Registrar Simulacro por Materia'}
            </h1>
            <p className="text-xs text-text-muted">
              Ingresa correctas e incorrectas por curso (`Tab` avanza; blancos se calculan solos
              según tu Área {area}).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <Chip tone="accent">
              Act: {validacion.puntaje?.act ?? 0} · Hab: {validacion.puntaje?.hab ?? 0} · Conoc:{' '}
              {validacion.puntaje?.conoc ?? 0}
            </Chip>
            <Chip tone="success" data-testid="chip-puntaje-total-vivo">
              Total: {validacion.puntaje?.total ?? '—'} pts
            </Chip>
          </div>
        </header>

        <form onSubmit={(e) => void guardarSimulacroFormulario(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs text-text-muted">
              Tipo de evaluación
              <select
                aria-label="Tipo de simulacro"
                data-testid="select-tipo-simulacro"
                value={tipoSeleccionado}
                onChange={(e) => setTipoSeleccionado(e.target.value as TipoEval)}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text"
              >
                {TIPOS_EVAL.map((t) => (
                  <option key={t} value={t}>
                    {REGLAS_EVALUACION[t].nombre} (máx {REGLAS_EVALUACION[t].max} pts)
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-text-muted">
              Fecha del simulacro
              <input
                type="date"
                aria-label="Fecha del simulacro"
                data-testid="input-fecha-simulacro"
                value={fechaSeleccionada}
                onChange={(e) => setFechaSeleccionada(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-text"
              />
            </label>

            {/* Pegado rápido de fila de números */}
            <div className="text-xs text-text-muted">
              <span>Pegar fila de números (ok bad ok bad...)</span>
              <div className="mt-1 flex gap-1.5">
                <input
                  type="text"
                  aria-label="Pegar fila de números"
                  data-testid="input-pegar-fila-simulacro"
                  value={textoPegadoRapido}
                  onChange={(e) => setTextoPegadoRapido(e.target.value)}
                  placeholder="Ej. 12 2 11 3 5 1..."
                  className="min-h-11 w-full rounded-lg border border-border bg-surface-2 px-2.5 font-mono text-xs text-text"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="btn-aplicar-pegado-simulacro"
                  onClick={aplicarPegadoRapido}
                >
                  Pegar
                </Button>
              </div>
            </div>
          </div>

          {/* Tabla por curso */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface-2 text-text-muted">
                <tr>
                  <th className="px-3 py-2">Curso / Sección</th>
                  <th className="px-3 py-2 text-center">Preguntas</th>
                  <th className="px-3 py-2 text-center">Correctas (ok)</th>
                  <th className="px-3 py-2 text-center">Incorrectas (bad)</th>
                  <th className="px-3 py-2 text-center">En blanco (auto)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clavesActivas.map((clave) => {
                  const fila = validacion.filas[clave];
                  return (
                    <tr
                      key={clave}
                      data-testid={`fila-simulacro-${clave}`}
                      className={fila.excedeCapacidad ? 'bg-danger/10' : ''}
                    >
                      <td className="px-3 py-2 font-semibold text-text">
                        {nombreClaveSimulacro(clave)}
                        {fila.excedeCapacidad && (
                          <span
                            data-testid={`error-capacidad-${clave}`}
                            className="ml-2 text-[11px] font-bold text-danger"
                          >
                            Excede las {fila.esperadas} preg
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-text-muted">
                        {fila.esperadas}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <input
                          type="number"
                          min={0}
                          max={fila.esperadas}
                          aria-label={`Correctas ${nombreClaveSimulacro(clave)}`}
                          data-testid={`sim-ok-${clave}`}
                          value={fila.ok}
                          onChange={(e) => cambiarCeldaCurso(clave, 'ok', e.target.value)}
                          className="min-h-9 w-16 rounded border border-border bg-surface-2 px-2 text-center font-mono font-bold text-success"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <input
                          type="number"
                          min={0}
                          max={fila.esperadas}
                          aria-label={`Incorrectas ${nombreClaveSimulacro(clave)}`}
                          data-testid={`sim-bad-${clave}`}
                          value={fila.bad}
                          onChange={(e) => cambiarCeldaCurso(clave, 'bad', e.target.value)}
                          className="min-h-9 w-16 rounded border border-border bg-surface-2 px-2 text-center font-mono font-bold text-danger"
                        />
                      </td>
                      <td
                        data-testid={`sim-blanco-${clave}`}
                        className="px-3 py-2 text-center font-mono text-text-muted"
                      >
                        {fila.blanco}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2">
            {editandoSimulacroId && (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditandoSimulacroId(null);
                  setRespuestasPorClave({});
                }}
              >
                Cancelar edición
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              data-testid="btn-guardar-simulacro"
              disabled={!validacion.valido}
            >
              {editandoSimulacroId
                ? 'Guardar cambios del simulacro'
                : 'Guardar simulacro y revisar errores'}
            </Button>
          </div>
        </form>
      </section>

      {/* 5. Historial de Simulacros con fecha y hora (ts), Editar y Borrar con confirmación */}
      <section
        aria-labelledby="sec-historial-simulacros"
        data-testid="panel-historial-simulacros"
        className="space-y-3 rounded-2xl border border-border bg-surface p-4"
      >
        <h2 id="sec-historial-simulacros" className="text-base font-bold text-text">
          Historial de Simulacros ({simulacros.length})
        </h2>

        {simulacros.length === 0 ? (
          <p className="text-xs text-text-muted">Aún no has registrado simulacros.</p>
        ) : (
          <div className="space-y-2.5">
            {simulacros.map((sim) => {
              const confirmando = confirmandoBorrarId === sim.id;
              return (
                <article
                  key={sim.id}
                  data-testid={`item-simulacro-${sim.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-text">
                        {REGLAS_EVALUACION[sim.tipo].nombre}
                      </span>
                      <span className="font-mono text-text-muted">
                        {formatearFechaHoraTs(sim.fecha, sim.ts)}
                      </span>
                      <Chip
                        tone={sim.revisado ? 'success' : 'warn'}
                        data-testid={`badge-revisado-${sim.id}`}
                      >
                        {sim.revisado ? 'Revisado' : 'Pendiente de revisión'}
                      </Chip>
                    </div>
                    <div className="font-mono text-text-muted">
                      Total: <b className="text-text">{sim.total} pts</b> · Hab:{' '}
                      {sim.secciones.hab.ok}✓/{sim.secciones.hab.bad}✗ · Conoc:{' '}
                      {sim.secciones.conoc.ok}✓/{sim.secciones.conoc.bad}✗
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {!sim.revisado && (
                      <Button
                        variant="primary"
                        size="sm"
                        data-testid={`btn-revisar-sim-${sim.id}`}
                        onClick={() => {
                          setSimulacroEnRevisionId(sim.id);
                          if (typeof panelRevisionRef.current?.scrollIntoView === 'function') {
                            panelRevisionRef.current.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          }
                        }}
                      >
                        Revisar errores
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      data-testid={`btn-editar-sim-${sim.id}`}
                      onClick={() => iniciarEdicionSimulacro(sim)}
                    >
                      Editar
                    </Button>

                    {!confirmando ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`btn-borrar-sim-${sim.id}`}
                        onClick={() => setConfirmandoBorrarId(sim.id)}
                      >
                        Borrar
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="danger"
                          size="sm"
                          data-testid={`btn-confirmar-borrar-sim-${sim.id}`}
                          onClick={() => {
                            setConfirmandoBorrarId(null);
                            void onEliminarSimulacro(sim.id);
                          }}
                        >
                          Confirmar borrar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmandoBorrarId(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function CURSO_IDS_CON_MALAS(
  porCurso: Readonly<Partial<Record<ClavePorCurso, { ok: number; bad: number }>>>,
): CursoId[] {
  const resultado: CursoId[] = [];
  for (const c of CURSOS) {
    if ((porCurso[c.id]?.bad ?? 0) > 0) {
      resultado.push(c.id);
    }
  }
  return resultado;
}
