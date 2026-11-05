/**
 * Vista principal HOY (`HoyView.tsx`):
 * - Franja de KPIs superior:
 *   1. [Preguntas esta semana] con, JUSTO DEBAJO, el <GoldCounter /> con el total histórico de preguntas
 *      (suma de ok+bad de todas las Practice) y <ProgressBar /> frente a la meta semanal.
 *   2. [Horas esta semana] con <ProgressBar /> frente a la meta semanal.
 *   3. [Racha] con día de gracia semanal y récord personal.
 *   4. [Errores abiertos].
 * - Encabezado compacto: "Semana S{n} de 18 · faltan {d} días para la {eval}".
 * - UNA acción principal grande: "Siguiente bloque: {Curso} · {Tema} · {n} preguntas · {m} min [Empezar]".
 *   Al pulsar inicia el Enfoque con curso y tipo ya cargados; al terminar abre el registro de tanda prellenado.
 * - Checklist del día (3–5 ítems derivados del plan; se marcan solos).
 * - Cierre del día (2 min): resumen del día, errores por clasificar y vista previa de mañana.
 */
import { useState } from 'react';
import {
  CATALOGO_CATEGORIAS_ERROR,
  CATEGORIAS_ERROR,
  HORARIO_SEMANAL_DEFAULT,
  RECURSOS_ENLACES_POR_DEFECTO,
  type CategoriaError,
  type FocusSession,
  type HorarioSemanal,
  type Mistake,
  type Practice,
  type Settings,
  type Simulacro,
  type TipoTareaEnfoque,
} from '../../data';
import {
  calcularRacha,
  CURSOS,
  cursoPorId,
  DIAS_SEMANA,
  evaluacionActiva,
  fechaEnLima,
  lunesDe,
  NOMBRES_DIAS_SEMANA,
  nombreDiaSemana,
  proximaEvaluacion,
  REGLAS_EVALUACION,
  semanaDelCiclo,
  sumarDias,
  type ActividadDiariaResumen,
  type BloquePlanDia,
  type ConfigCiclo,
  type CursoId,
  type DiaSemana,
  type FechaISO,
  type PlanDelDia,
} from '../../domain';
import { Button, Chip, GoldCounter, KpiCard, ProgressBar, RingProgress, Sheet } from '../../ui';
import { nombreCursoOMix } from '../practica/QuickRegisterSheet';

export interface HoyViewProps {
  fechaHoy: FechaISO;
  settings: Settings;
  practices: readonly Practice[];
  mistakes: readonly Mistake[];
  simulacros?: readonly Simulacro[];
  focusSessions: readonly FocusSession[];
  planHoy: PlanDelDia;
  planManana: PlanDelDia;
  repasosVencidosHoy: number;
  onCompletarEnfoqueYPrellenarTanda: (params: {
    cursoId: CursoId;
    temaId: string | null;
    minutos: number;
    preguntasSugeridas: number;
    tipoTarea: TipoTareaEnfoque;
  }) => Promise<void> | void;
  onIniciarEnfoqueDirecto?: (params: {
    cursoId: CursoId;
    temaId: string | null;
    minutos: number;
    preguntasSugeridas: number;
    tipoTarea: TipoTareaEnfoque;
  }) => void;
  onClasificarError: (error: Mistake, categoria: CategoriaError) => Promise<void> | void;
  onIrAErrores: () => void;
  onConfirmarCierreDia?: (fecha: FechaISO) => Promise<void> | void;
  onActualizarSettings?: (parcial: Partial<Settings>) => Promise<void> | void;
}

function mapearTipoBloqueATareaEnfoque(tipo: BloquePlanDia['tipo']): TipoTareaEnfoque {
  switch (tipo) {
    case 'tema_nuevo':
      return 'practica_deco';
    case 'repaso_espaciado':
      return 'repaso';
    case 'repaso_errores':
      return 'correccion_errores';
  }
}

export function HoyView({
  fechaHoy,
  settings,
  practices,
  mistakes,
  simulacros,
  focusSessions,
  planHoy,
  planManana,
  repasosVencidosHoy,
  onCompletarEnfoqueYPrellenarTanda,
  onIniciarEnfoqueDirecto,
  onClasificarError,
  onIrAErrores,
  onConfirmarCierreDia,
  onActualizarSettings,
}: HoyViewProps) {
  const [bloqueEnEnfoque, setBloqueEnEnfoque] = useState<BloquePlanDia | null>(null);
  const [cierreAbierto, setCierreAbierto] = useState<boolean>(false);
  const [cierreCompletadoHoy, setCierreCompletadoHoy] = useState<boolean>(false);

  // Horario de clases semanal y calendario de exámenes CEPRE
  const [horarioModalAbierto, setHorarioModalAbierto] = useState(false);
  const diaHoy = nombreDiaSemana(fechaHoy);
  const horarioActivo: HorarioSemanal = settings.horarioSemanal ?? HORARIO_SEMANAL_DEFAULT;
  const cursosDelDiaHoy = horarioActivo[diaHoy] ?? [];

  const [horarioBorrador, setHorarioBorrador] = useState<HorarioSemanal>(horarioActivo);
  const [diaEditorSeleccionado, setDiaEditorSeleccionado] = useState<DiaSemana>(diaHoy);
  const [cursoParaAgregar, setCursoParaAgregar] = useState<CursoId>('hm');
  const [guardandoAjustes, setGuardandoAjustes] = useState(false);

  // Edición rápida de meta semanal de preguntas
  const [editandoMetaSemanal, setEditandoMetaSemanal] = useState(false);
  const [metaBorrador, setMetaBorrador] = useState(settings.metaPreguntasSemana ?? 85);

  // Configuración del ciclo
  const cfgCiclo: ConfigCiclo = {
    inicio: settings.inicioCiclo,
    semanas: 15,
    fechasEval: settings.fechasEval,
  };
  const semanaActual = semanaDelCiclo(fechaHoy, cfgCiclo);
  const evalActivaId = evaluacionActiva(fechaHoy, cfgCiclo);
  const proxEval = proximaEvaluacion(fechaHoy, cfgCiclo);
  const nombreEvalHeader = proxEval
    ? REGLAS_EVALUACION[proxEval.id].nombre
    : REGLAS_EVALUACION[evalActivaId].nombre;
  const diasFaltantesHeader = proxEval ? proxEval.dias : 0;

  // 1. Desglose y totales de preguntas (Practices + Simulacros + Errores independientes)
  let practicesBuenas = 0;
  let practicesMalas = 0;
  let practicesSinDetalle = 0;
  for (const p of practices) {
    if (p.sinDetalle) {
      practicesSinDetalle += p.totalSinDetalle ?? 0;
    } else {
      practicesBuenas += p.ok;
      practicesMalas += p.bad;
    }
  }

  let simBuenas = 0;
  let simMalas = 0;
  for (const s of simulacros ?? []) {
    simBuenas +=
      (s.secciones?.act?.ok ?? 0) +
      (s.secciones?.hab?.ok ?? 0) +
      (s.secciones?.conoc?.ok ?? 0);
    simMalas +=
      (s.secciones?.act?.bad ?? 0) +
      (s.secciones?.hab?.bad ?? 0) +
      (s.secciones?.conoc?.bad ?? 0);
  }

  // Errores independientes (creados en ErroresView o importados que no pertenezcan a una tanda registrada)
  let erroresIndependientesCount = 0;
  for (const m of mistakes) {
    if (m.simulacroId) continue;
    const tienePracticaAsociada = practices.some(
      (p) =>
        p.fecha === m.fecha &&
        p.cursoId === m.cursoId &&
        p.bad > 0 &&
        Math.abs(p.ts - m.creadoEn) < 1500,
    );
    if (!tienePracticaAsociada) {
      erroresIndependientesCount++;
    }
  }

  const totalHistoricoBuenas = practicesBuenas + simBuenas;
  const totalHistoricoMalas = practicesMalas + simMalas + erroresIndependientesCount;
  const totalHistoricoTotal =
    totalHistoricoBuenas + totalHistoricoMalas + practicesSinDetalle;

  // 2. Preguntas y horas de esta semana (lunes a domingo)
  const lunesIso = lunesDe(fechaHoy);
  const domingoIso = sumarDias(lunesIso, 6);

  let semBuenas = 0;
  let semMalas = 0;
  let semSinDetalle = 0;
  for (const p of practices) {
    if (p.fecha >= lunesIso && p.fecha <= domingoIso) {
      if (p.sinDetalle) {
        semSinDetalle += p.totalSinDetalle ?? 0;
      } else {
        semBuenas += p.ok;
        semMalas += p.bad;
      }
    }
  }

  for (const s of simulacros ?? []) {
    if (s.fecha >= lunesIso && s.fecha <= domingoIso) {
      semBuenas +=
        (s.secciones?.act?.ok ?? 0) +
        (s.secciones?.hab?.ok ?? 0) +
        (s.secciones?.conoc?.ok ?? 0);
      semMalas +=
        (s.secciones?.act?.bad ?? 0) +
        (s.secciones?.hab?.bad ?? 0) +
        (s.secciones?.conoc?.bad ?? 0);
    }
  }

  for (const m of mistakes) {
    if (m.simulacroId) continue;
    const mFecha = m.fecha ?? fechaEnLima(new Date(m.creadoEn));
    if (mFecha >= lunesIso && mFecha <= domingoIso) {
      const tienePracticaAsociada = practices.some(
        (p) =>
          p.fecha === m.fecha &&
          p.cursoId === m.cursoId &&
          p.bad > 0 &&
          Math.abs(p.ts - m.creadoEn) < 1500,
      );
      if (!tienePracticaAsociada) {
        semMalas++;
      }
    }
  }

  const preguntasSemana = semBuenas + semMalas + semSinDetalle;
  const preguntasSemanaBuenas = semBuenas;
  const preguntasSemanaMalas = semMalas;

  // Preguntas de hoy
  const practicesHoy = practices.filter((p) => p.fecha === fechaHoy);
  let hoyBuenas = 0;
  let hoyMalas = 0;
  let hoySinDetalle = 0;
  for (const p of practicesHoy) {
    if (p.sinDetalle) {
      hoySinDetalle += p.totalSinDetalle ?? 0;
    } else {
      hoyBuenas += p.ok;
      hoyMalas += p.bad;
    }
  }
  for (const s of simulacros ?? []) {
    if (s.fecha === fechaHoy) {
      hoyBuenas +=
        (s.secciones?.act?.ok ?? 0) +
        (s.secciones?.hab?.ok ?? 0) +
        (s.secciones?.conoc?.ok ?? 0);
      hoyMalas +=
        (s.secciones?.act?.bad ?? 0) +
        (s.secciones?.hab?.bad ?? 0) +
        (s.secciones?.conoc?.bad ?? 0);
    }
  }
  for (const m of mistakes) {
    if (m.simulacroId) continue;
    const mFecha = m.fecha ?? fechaEnLima(new Date(m.creadoEn));
    if (mFecha === fechaHoy) {
      const tienePracticaAsociada = practices.some(
        (p) =>
          p.fecha === m.fecha &&
          p.cursoId === m.cursoId &&
          p.bad > 0 &&
          Math.abs(p.ts - m.creadoEn) < 1500,
      );
      if (!tienePracticaAsociada) {
        hoyMalas++;
      }
    }
  }
  const preguntasHoy = hoyBuenas + hoyMalas + hoySinDetalle;

  const minutosSemana = focusSessions
    .filter((f) => f.fecha >= lunesIso && f.fecha <= domingoIso)
    .reduce((s, f) => s + f.minutosEnfoque, 0);
  const horasSemanaRedondeadas = Math.round((minutosSemana / 60) * 10) / 10;

  const minutosHoy = focusSessions
    .filter((f) => f.fecha === fechaHoy)
    .reduce((s, f) => s + f.minutosEnfoque, 0);

  // 3. Racha y récord personal
  const mapaActividad = new Map<string, ActividadDiariaResumen>();
  for (const p of practices) {
    const prev = mapaActividad.get(p.fecha) ?? {
      fecha: p.fecha,
      preguntas: 0,
      minutosEnfoque: 0,
    };
    prev.preguntas += p.sinDetalle ? (p.totalSinDetalle ?? 0) : p.ok + p.bad;
    mapaActividad.set(p.fecha, prev);
  }
  for (const s of simulacros ?? []) {
    const prev = mapaActividad.get(s.fecha) ?? {
      fecha: s.fecha,
      preguntas: 0,
      minutosEnfoque: 0,
    };
    const qSim =
      (s.secciones?.act?.ok ?? 0) +
      (s.secciones?.act?.bad ?? 0) +
      (s.secciones?.hab?.ok ?? 0) +
      (s.secciones?.hab?.bad ?? 0) +
      (s.secciones?.conoc?.ok ?? 0) +
      (s.secciones?.conoc?.bad ?? 0);
    prev.preguntas += qSim;
    mapaActividad.set(s.fecha, prev);
  }
  for (const m of mistakes) {
    if (m.simulacroId) continue;
    const mFecha = m.fecha ?? fechaEnLima(new Date(m.creadoEn));
    const tienePracticaAsociada = practices.some(
      (p) =>
        p.fecha === m.fecha &&
        p.cursoId === m.cursoId &&
        p.bad > 0 &&
        Math.abs(p.ts - m.creadoEn) < 1500,
    );
    if (!tienePracticaAsociada) {
      const prev = mapaActividad.get(mFecha) ?? {
        fecha: mFecha,
        preguntas: 0,
        minutosEnfoque: 0,
      };
      prev.preguntas += 1;
      mapaActividad.set(mFecha, prev);
    }
  }
  for (const f of focusSessions) {
    const prev = mapaActividad.get(f.fecha) ?? {
      fecha: f.fecha,
      preguntas: 0,
      minutosEnfoque: 0,
    };
    prev.minutosEnfoque += f.minutosEnfoque;
    mapaActividad.set(f.fecha, prev);
  }
  const estadoRacha = calcularRacha(
    Array.from(mapaActividad.values()),
    fechaHoy,
    settings.diasGraciaSemana ?? 1,
  );

  // 4. Errores abiertos y por clasificar
  const erroresAbiertos = mistakes.filter((m) => m.estado === 'abierto');
  const erroresPorClasificar = mistakes.filter((m) => m.categoria === null);

  // Acción principal del plan
  const accionPrincipal = planHoy.accionPrincipal;

  // Checklist automático del día (4 ítems derivados del plan que se marcan solos y respetan estrictamente su curso)
  const practicoTemaNuevoHoy = practicesHoy.length > 0 || minutosHoy >= 25;

  const repasoErroresAlDia =
    repasosVencidosHoy === 0 || mistakes.some((m) => m.historial.some((h) => h.fecha === fechaHoy));

  const bloqueEspaciado =
    planHoy.bloques.find((b) => b.tipo === 'repaso_espaciado') ?? planHoy.bloques[1];
  const cursoEspaciado = bloqueEspaciado?.cursoId;
  const repasoEspaciadoCumplido = cursoEspaciado
    ? practicesHoy.some((p) => p.cursoId === cursoEspaciado) ||
      focusSessions.some((f) => f.fecha === fechaHoy && f.cursoId === cursoEspaciado) ||
      mistakes.some(
        (m) => m.cursoId === cursoEspaciado && m.historial.some((h) => h.fecha === fechaHoy),
      )
    : false;

  const cierreDiaListo =
    cierreCompletadoHoy ||
    settings.ultimoCierreDia === fechaHoy ||
    (practicoTemaNuevoHoy && erroresPorClasificar.length === 0 && practicesHoy.length > 0);

  const checklistItems = [
    {
      id: 'chk-practica',
      titulo: accionPrincipal
        ? `Bloque de práctica: ${accionPrincipal.cursoNombre} (${accionPrincipal.preguntas} preg)`
        : 'Registrar al menos 1 tanda de práctica hoy',
      completado: practicoTemaNuevoHoy,
    },
    {
      id: 'chk-errores',
      titulo:
        repasosVencidosHoy > 0
          ? `Repasar ${repasosVencidosHoy} error(es) vencidos del circuito Leitner`
          : 'Repasos vencidos de errores al día',
      completado: repasoErroresAlDia,
    },
    {
      id: 'chk-espaciado',
      titulo: bloqueEspaciado
        ? `Repaso espaciado: ${bloqueEspaciado.cursoNombre} (${bloqueEspaciado.temaTitulo})`
        : 'Repaso espaciado de un tema anterior',
      completado: repasoEspaciadoCumplido,
    },
    {
      id: 'chk-cierre',
      titulo: 'Cierre del día (2 min: resumen y errores por clasificar)',
      completado: cierreDiaListo,
    },
  ];

  const lanzarBloqueEnfoque = (bloque: BloquePlanDia) => {
    if (onIniciarEnfoqueDirecto) {
      onIniciarEnfoqueDirecto({
        cursoId: bloque.cursoId,
        temaId: bloque.temaId,
        minutos: bloque.minutos,
        preguntasSugeridas: bloque.preguntas,
        tipoTarea: mapearTipoBloqueATareaEnfoque(bloque.tipo),
      });
      return;
    }
    setBloqueEnEnfoque(bloque);
  };

  const finalizarSesionEnfoque = async () => {
    if (!bloqueEnEnfoque) return;
    const bloque = bloqueEnEnfoque;
    setBloqueEnEnfoque(null);
    await onCompletarEnfoqueYPrellenarTanda({
      cursoId: bloque.cursoId,
      temaId: bloque.temaId,
      minutos: bloque.minutos,
      preguntasSugeridas: bloque.preguntas,
      tipoTarea: mapearTipoBloqueATareaEnfoque(bloque.tipo),
    });
  };

  return (
    <div className="space-y-5">
      {/* Encabezado compacto del ciclo */}
      <div
        data-testid="hoy-ciclo-header"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-text"
      >
        <span>
          Semana S{semanaActual} de 15 · faltan {diasFaltantesHeader} días para la{' '}
          {nombreEvalHeader}
        </span>
        <Chip tone={estadoRacha.hoyCumplido ? 'success' : 'neutral'}>
          {estadoRacha.hoyCumplido
            ? '✓ Día cumplido'
            : `Hoy: ${preguntasHoy}/10 preg · ${minutosHoy}/25 min`}
        </Chip>
      </div>

      {/* Franja superior de 4 KPIs */}
      <section
        aria-label="Indicadores clave de la semana"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {/* KPI 1: Preguntas esta semana + GoldCounter JUSTO DEBAJO */}
        <article
          data-testid="kpi-preguntas-semana"
          className="flex flex-col justify-between rounded-xl border border-accent bg-surface p-3.5"
        >
          <header className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Preguntas esta semana
            </span>
            {editandoMetaSemanal ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (metaBorrador >= 1 && metaBorrador <= 5000 && onActualizarSettings) {
                    await onActualizarSettings({ metaPreguntasSemana: metaBorrador });
                  }
                  setEditandoMetaSemanal(false);
                }}
                className="flex items-center gap-1"
              >
                <input
                  type="number"
                  min={1}
                  max={5000}
                  autoFocus
                  value={metaBorrador}
                  onChange={(e) =>
                    setMetaBorrador(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))
                  }
                  className="w-16 rounded border border-accent bg-surface-2 px-1.5 py-0.5 text-center font-mono text-xs font-bold text-text"
                  aria-label="Nueva meta semanal de preguntas"
                />
                <button
                  type="submit"
                  title="Guardar meta"
                  className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-contrast hover:opacity-90"
                >
                  ✓
                </button>
                <button
                  type="button"
                  title="Cancelar"
                  onClick={() => setEditandoMetaSemanal(false)}
                  className="rounded border border-border px-1 py-0.5 text-[11px] text-text-muted hover:bg-surface-2"
                >
                  ✕
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-1">
                <Chip tone="accent">
                  {preguntasSemana}/{settings.metaPreguntasSemana ?? 85}
                </Chip>
                {onActualizarSettings && (
                  <button
                    type="button"
                    title="Editar meta semanal de preguntas"
                    aria-label="Editar meta semanal de preguntas"
                    data-testid="btn-editar-meta-preguntas-hoy"
                    onClick={() => {
                      setMetaBorrador(settings.metaPreguntasSemana ?? 85);
                      setEditandoMetaSemanal(true);
                    }}
                    className="rounded p-0.5 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-accent"
                  >
                    ✎
                  </button>
                )}
              </div>
            )}
          </header>

          <div className="my-1.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <div className="font-mono text-2xl font-bold tabular-nums text-text">
                {preguntasSemana}
              </div>
              <span
                className="font-mono text-xs text-text-muted"
                title="Buenas y malas de esta semana"
              >
                (<span className="font-semibold text-success">✓ {preguntasSemanaBuenas}</span> ·{' '}
                <span className="font-semibold text-danger">✗ {preguntasSemanaMalas}</span>)
              </span>
            </div>
            {/* JUSTO DEBAJO: <GoldCounter /> con el total histórico */}
            <div
              data-testid="contenedor-gold-bajo-semanal"
              className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted"
            >
              <span>Histórico:</span>
              <GoldCounter value={totalHistoricoTotal} />
              <span
                className="font-mono text-[11px] text-text-muted"
                title="Total histórico de buenas y malas"
              >
                (<span className="font-semibold text-success">✓ {totalHistoricoBuenas}</span> ·{' '}
                <span className="font-semibold text-danger">✗ {totalHistoricoMalas}</span>)
              </span>
            </div>
          </div>

          <ProgressBar
            value={preguntasSemana}
            max={settings.metaPreguntasSemana ?? 85}
            label="Avance semanal preguntas"
          />
        </article>

        {/* KPI 2: Horas esta semana */}
        <article
          data-testid="kpi-horas-semana"
          className="flex flex-col justify-between rounded-xl border border-border bg-surface p-3.5"
        >
          <header className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Horas esta semana
            </span>
            <Chip tone="neutral">
              {horasSemanaRedondeadas}h / {settings.metaHorasSemana}h
            </Chip>
          </header>
          <div className="my-1.5 font-mono text-2xl font-bold tabular-nums text-text">
            {horasSemanaRedondeadas} h
          </div>
          <ProgressBar
            value={minutosSemana}
            max={settings.metaHorasSemana * 60}
            label="Avance semanal horas"
          />
        </article>

        {/* KPI 3: Racha y récord personal */}
        <KpiCard
          label="Racha"
          value={`${estadoRacha.rachaActual} d`}
          badge={
            <Chip tone={estadoRacha.hoyCumplido ? 'success' : 'warn'}>
              Récord: {estadoRacha.recordPersonal} d
            </Chip>
          }
          subtitle={`Gracia sem.: ${estadoRacha.diasGraciaUsadosSemana}/${estadoRacha.diasGraciaMaxSemana} · >=10 preg o >=25m`}
        />

        {/* KPI 4: Errores abiertos */}
        <KpiCard
          label="Errores abiertos"
          value={erroresAbiertos.length}
          badge={
            erroresPorClasificar.length > 0 ? (
              <Chip tone="warn">{erroresPorClasificar.length} s/clasificar</Chip>
            ) : (
              <Chip tone="success">Al día</Chip>
            )
          }
          subtitle={`Repasos vencidos hoy: ${repasosVencidosHoy}`}
        />
      </section>

      {/* Horario de Clases de Hoy y Próxima Evaluación CEPRE */}
      <section
        data-testid="seccion-horario-clases"
        className="rounded-2xl border border-border bg-surface p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-text">
              📅 Horario de hoy ({NOMBRES_DIAS_SEMANA[diaHoy]})
            </span>
            <span className="text-xs text-text-muted">
              {cursosDelDiaHoy.length > 0
                ? `${cursosDelDiaHoy.length} curso(s) programado(s)`
                : 'Sin clases programadas'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {proxEval && (
              <span
                data-testid="badge-proxima-eval"
                className="rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent"
              >
                🎯 {proxEval.id.toUpperCase()}: en {proxEval.dias} días ({proxEval.fecha})
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              data-testid="btn-abrir-editor-horario"
              onClick={() => {
                setHorarioBorrador(settings.horarioSemanal ?? HORARIO_SEMANAL_DEFAULT);
                setHorarioModalAbierto(true);
              }}
            >
              Ver / Editar Horario
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {cursosDelDiaHoy.length > 0 ? (
            cursosDelDiaHoy.map((cid) => {
              const c = cursoPorId(cid);
              return (
                <div
                  key={cid}
                  data-testid={`chip-horario-${cid}`}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text"
                >
                  <span className="font-bold text-accent">{cid.toUpperCase()}</span>
                  <span>{c.nombre}</span>
                </div>
              );
            })
          ) : (
            <span className="text-xs italic text-text-muted">
              Día libre según tu horario semanal. Haz clic en «Ver / Editar Horario» para configurar
              tus cursos.
            </span>
          )}
        </div>
      </section>

      {/* UNA acción principal grande */}
      {accionPrincipal && (
        <section
          aria-labelledby="titulo-accion-principal"
          data-testid="tarjeta-accion-principal"
          className="rounded-2xl border-2 border-accent bg-surface-2 p-5 shadow-md"
        >
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="accent">ACCIÓN PRINCIPAL</Chip>
                <span className="text-xs text-text-muted">{accionPrincipal.porQue}</span>
              </div>
              <h1 id="titulo-accion-principal" className="text-base font-bold text-text sm:text-lg">
                Siguiente bloque: {accionPrincipal.cursoNombre} · {accionPrincipal.temaTitulo} ·{' '}
                {accionPrincipal.preguntas} preguntas · {accionPrincipal.minutos} min
              </h1>
            </div>

            <Button
              variant="primary"
              data-testid="btn-empezar-bloque-principal"
              onClick={() => lanzarBloqueEnfoque(accionPrincipal)}
            >
              Empezar
            </Button>
          </div>
        </section>
      )}

      {/* Checklist del día (se marca solo) y bloques del plan */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <section
            aria-labelledby="sec-checklist"
            className="space-y-2.5 rounded-2xl border border-border bg-surface p-3.5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h2
                id="sec-checklist"
                className="text-xs font-bold uppercase tracking-wider text-text"
              >
                Checklist del Día (automático)
              </h2>
              <Button
                variant="secondary"
                size="sm"
                data-testid="btn-abrir-cierre-dia"
                onClick={() => setCierreAbierto(true)}
              >
                Cierre del día (2 min)
              </Button>
            </div>

            <ul className="space-y-1.5">
              {checklistItems.map((item) => (
                <li
                  key={item.id}
                  data-testid={item.id}
                  data-checked={item.completado ? 'true' : 'false'}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs"
                >
                  <span
                    className={`inline-flex h-4 w-4 text-[10px] items-center justify-center rounded-full font-bold ${
                      item.completado
                        ? 'bg-success text-bg'
                        : 'border border-border bg-surface text-text-muted'
                    }`}
                  >
                    {item.completado ? '✓' : '○'}
                  </span>
                  <span className={item.completado ? 'line-through text-text-muted' : 'text-text'}>
                    {item.titulo}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Cuadros de Recursos Rápidos justo abajo del Checklist */}
          <section
            data-testid="seccion-recursos-rapidos-hoy"
            aria-label="Recursos rápidos de estudio"
            className="rounded-2xl border border-border bg-surface p-3.5 space-y-2.5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5">
                <span>📚</span> Recursos y Enlaces Rápidos
              </span>
              <span className="text-[11px] text-text-muted font-mono">
                {(settings.recursosEnlaces ?? RECURSOS_ENLACES_POR_DEFECTO).length} links
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(settings.recursosEnlaces ?? RECURSOS_ENLACES_POR_DEFECTO).map((rec) => {
                const icono =
                  rec.categoria === 'boletines'
                    ? '📁'
                    : rec.categoria === 'solucionarios'
                      ? '💡'
                      : rec.categoria === 'simulacros'
                        ? '📝'
                        : '🔗';
                return (
                  <a
                    key={rec.id}
                    href={rec.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`enlace-rapido-${rec.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-text hover:border-accent hover:text-accent transition-all group shadow-sm"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-sm">{icono}</span>
                      <span className="font-semibold truncate">{rec.titulo}</span>
                    </div>
                    <span className="text-text-muted group-hover:text-accent font-bold">↗</span>
                  </a>
                );
              })}
            </div>
          </section>
        </div>

        {/* Bloques del plan del día con su "por qué" */}
        <section
          aria-labelledby="sec-plan-hoy"
          className="space-y-3 rounded-2xl border border-border bg-surface p-4"
        >
          <div className="flex items-center justify-between">
            <h2 id="sec-plan-hoy" className="text-sm font-bold text-text">
              Plan del Día ({planHoy.minutosAsignados}/{planHoy.minutosDisponibles} min)
            </h2>
            {repasosVencidosHoy > 0 && (
              <Button variant="ghost" size="sm" onClick={onIrAErrores}>
                Ir a Flashcards ({repasosVencidosHoy})
              </Button>
            )}
          </div>

          <div className="space-y-2.5">
            {planHoy.bloques.map((b) => (
              <article
                key={b.id}
                data-testid={`bloque-plan-${b.cursoId}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 p-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-text">{b.cursoNombre}</span>
                    <span className="text-text-muted">· {b.temaTitulo}</span>
                    <Chip tone="neutral">
                      {b.preguntas} preg · {b.minutos}m
                    </Chip>
                  </div>
                  <p className="text-text-muted">{b.porQue}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => lanzarBloqueEnfoque(b)}>
                  Empezar
                </Button>
              </article>
            ))}
          </div>
        </section>
      </div>

      {/* Modal de Enfoque conectado a la Acción Principal -> al terminar abre la tanda prellenada */}
      <Sheet
        open={bloqueEnEnfoque !== null}
        onClose={() => setBloqueEnEnfoque(null)}
        title={bloqueEnEnfoque ? `Enfoque · ${bloqueEnEnfoque.cursoNombre}` : 'Sesión de Enfoque'}
        description={bloqueEnEnfoque?.temaTitulo}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBloqueEnEnfoque(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              data-testid="btn-terminar-enfoque-abrir-tanda"
              onClick={() => void finalizarSesionEnfoque()}
            >
              Terminar enfoque y registrar tanda
            </Button>
          </>
        }
      >
        {bloqueEnEnfoque && (
          <div className="flex flex-col items-center gap-4 py-3 text-center">
            <RingProgress
              value={bloqueEnEnfoque.minutos}
              max={bloqueEnEnfoque.minutos}
              phase="focus"
              centerContent={
                <div>
                  <div className="text-lg font-bold">{bloqueEnEnfoque.minutos}:00</div>
                  <div className="text-[11px] uppercase text-text-muted">Enfoque</div>
                </div>
              }
            />
            <p className="text-xs text-text-muted">
              Curso y tarea cargados automáticamente. Al concluir se abrirá el registro de tanda con{' '}
              <b>{bloqueEnEnfoque.cursoNombre}</b> prellenado.
            </p>
          </div>
        )}
      </Sheet>

      {/* Modal de Cierre del Día (2 min: resumen, errores por clasificar y vista previa de mañana) */}
      <Sheet
        open={cierreAbierto}
        onClose={() => setCierreAbierto(false)}
        title="Cierre del Día (2 min)"
        description="Resumen de hoy, clasificación de errores pendientes y vista previa de mañana."
        footer={
          <Button
            variant="primary"
            data-testid="btn-confirmar-cierre-dia"
            onClick={() => {
              setCierreCompletadoHoy(true);
              setCierreAbierto(false);
              void onConfirmarCierreDia?.(fechaHoy);
            }}
          >
            Cerrar día
          </Button>
        }
      >
        <div className="space-y-4 text-xs">
          {/* 1. Resumen de hoy */}
          <div className="rounded-xl border border-border bg-surface-2 p-3">
            <h3 className="font-bold text-text">1. Resumen de hoy ({fechaHoy})</h3>
            <p className="mt-1 text-text-muted">
              Preguntas resueltas hoy: <b className="text-text">{preguntasHoy}</b> · Minutos de
              enfoque: <b className="text-text">{minutosHoy} min</b> · Estado de racha:{' '}
              <b className="text-text">
                {estadoRacha.hoyCumplido ? 'Cumplido' : 'Pendiente (>=10 preg o >=25 min)'}
              </b>
            </p>
          </div>

          {/* 2. Errores por clasificar */}
          <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
            <h3 className="font-bold text-text">
              2. Errores por clasificar ({erroresPorClasificar.length})
            </h3>
            {erroresPorClasificar.length === 0 ? (
              <p className="text-text-muted">Todos los errores del día están clasificados.</p>
            ) : (
              erroresPorClasificar.map((err) => (
                <div
                  key={err.id}
                  data-testid={`cierre-error-sin-cat-${err.id}`}
                  className="space-y-1.5 rounded-lg border border-border bg-surface p-2.5"
                >
                  <div className="font-semibold text-text">
                    {nombreCursoOMix(err.cursoId)} · {err.nota || 'Error de tanda'}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {CATEGORIAS_ERROR.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        data-testid={`cierre-clasificar-${err.id}-${cat}`}
                        onClick={() => void onClasificarError(err, cat)}
                        className="min-h-9 rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text hover:border-accent"
                      >
                        {CATALOGO_CATEGORIAS_ERROR[cat].etiqueta}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 3. Vista previa de mañana */}
          <div className="space-y-1.5 rounded-xl border border-border bg-surface-2 p-3">
            <h3 className="font-bold text-text">3. Vista previa de mañana ({planManana.fecha})</h3>
            {planManana.bloques.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-text-muted">
                <span>
                  <b className="text-text">{b.cursoNombre}</b> · {b.temaTitulo}
                </span>
                <span className="font-mono">
                  {b.preguntas} preg · {b.minutos}m
                </span>
              </div>
            ))}
          </div>
        </div>
      </Sheet>

      {/* Modal / Sheet para Ver y Editar Horario Semanal */}
      <Sheet
        open={horarioModalAbierto}
        onClose={() => setHorarioModalAbierto(false)}
        title="Mi Horario Semanal"
        description="Configura los cursos que llevas cada día de la semana para organizar tus prioridades de estudio."
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setHorarioBorrador({ ...HORARIO_SEMANAL_DEFAULT });
              }}
            >
              Horario por defecto
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setHorarioModalAbierto(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                data-testid="btn-guardar-horario-fechas"
                disabled={guardandoAjustes}
                onClick={async () => {
                  setGuardandoAjustes(true);
                  try {
                    await onActualizarSettings?.({
                      horarioSemanal: horarioBorrador,
                    });
                    setHorarioModalAbierto(false);
                  } finally {
                    setGuardandoAjustes(false);
                  }
                }}
              >
                Guardar horario
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5 text-xs">
          {/* Horario de Clases Semanal */}
          <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-text">Horario de Clases Semanal</h3>
              <span className="text-text-muted">Selecciona un día para editar sus cursos</span>
            </div>

            {/* Pestañas de días (Lunes a Domingo) */}
            <div className="flex flex-wrap gap-1 border-b border-border pb-2">
              {DIAS_SEMANA.map((dia) => (
                <button
                  key={dia}
                  type="button"
                  data-testid={`tab-horario-${dia}`}
                  onClick={() => setDiaEditorSeleccionado(dia)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                    diaEditorSeleccionado === dia
                      ? 'bg-accent text-bg shadow-sm'
                      : 'bg-surface text-text hover:bg-surface/80'
                  }`}
                >
                  {NOMBRES_DIAS_SEMANA[dia]} ({(horarioBorrador[dia] ?? []).length})
                </button>
              ))}
            </div>

            {/* Cursos del día seleccionado */}
            <div className="space-y-2">
              <div className="font-semibold text-text">
                Cursos programados el {NOMBRES_DIAS_SEMANA[diaEditorSeleccionado]}:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(horarioBorrador[diaEditorSeleccionado] ?? []).length > 0 ? (
                  (horarioBorrador[diaEditorSeleccionado] ?? []).map((cid) => {
                    const c = cursoPorId(cid);
                    return (
                      <span
                        key={cid}
                        data-testid={`badge-curso-${diaEditorSeleccionado}-${cid}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 font-medium text-text"
                      >
                        <strong className="text-accent">{cid.toUpperCase()}</strong>
                        <span>{c.nombre}</span>
                        <button
                          type="button"
                          aria-label={`Quitar ${c.nombre} del ${NOMBRES_DIAS_SEMANA[diaEditorSeleccionado]}`}
                          onClick={() => {
                            setHorarioBorrador((prev) => ({
                              ...prev,
                              [diaEditorSeleccionado]: (prev[diaEditorSeleccionado] ?? []).filter(
                                (x) => x !== cid,
                              ),
                            }));
                          }}
                          className="ml-1 text-text-muted hover:text-danger font-bold"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })
                ) : (
                  <span className="italic text-text-muted">
                    No hay cursos asignados a este día.
                  </span>
                )}
              </div>

              {/* Selector para añadir un curso al día seleccionado */}
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                <select
                  value={cursoParaAgregar}
                  onChange={(e) => setCursoParaAgregar(e.target.value as CursoId)}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text"
                  aria-label="Seleccionar curso para agregar"
                >
                  {CURSOS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id.toUpperCase()} · {c.nombre}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="btn-agregar-curso-horario"
                  onClick={() => {
                    const actuales = horarioBorrador[diaEditorSeleccionado] ?? [];
                    if (!actuales.includes(cursoParaAgregar)) {
                      setHorarioBorrador((prev) => ({
                        ...prev,
                        [diaEditorSeleccionado]: [...actuales, cursoParaAgregar],
                      }));
                    }
                  }}
                >
                  + Agregar curso al {NOMBRES_DIAS_SEMANA[diaEditorSeleccionado]}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
