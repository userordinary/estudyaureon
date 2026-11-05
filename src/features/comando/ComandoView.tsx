import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FocusSession, Mistake, Practice, Settings, Simulacro } from '../../data';
import {
  acumuladoReal,
  buscarCarrera,
  calcularAutopsiaErrores,
  calcularDatosRadarDominio,
  construirDatosCurvaAcumulacion,
  CURSOS,
  fechaEnLima,
  generarAccionesInmediatas,
  metaSiguienteEvaluacion,
  proximaEvaluacion,
  REGLAS_EVALUACION,
  type BloqueId,
  type ConfigCiclo,
  type CursoId,
  type FechaISO,
  type FuenteRadarDominio,
  type ModoAgrupacionAutopsia,
  type PeriodoAutopsia,
  type PlanDelDia,
} from '../../domain';

export interface ComandoViewProps {
  fechaHoy: FechaISO;
  settings: Settings;
  practices: readonly Practice[];
  mistakes: readonly Mistake[];
  focusSessions: readonly FocusSession[];
  simulacros: readonly Simulacro[];
  planHoy: PlanDelDia;
  onIniciarEnfoqueCurso?: (cursoId: CursoId, temaId: string | null) => void;
  onIrAClasificarErrores?: () => void;
}

export function ComandoView({
  fechaHoy,
  settings,
  practices,
  mistakes,
  focusSessions,
  simulacros,
  planHoy,
  onIniciarEnfoqueCurso,
  onIrAClasificarErrores,
}: ComandoViewProps) {
  const [fuenteRadar, setFuenteRadar] = useState<FuenteRadarDominio>('simulacros');
  const [bloqueDetalle, setBloqueDetalle] = useState<BloqueId | null>(null);
  const [agrupacionAutopsia, setAgrupacionAutopsia] = useState<ModoAgrupacionAutopsia>('categoria');
  const [periodoAutopsia, setPeriodoAutopsia] = useState<PeriodoAutopsia>('30d');
  const [cursoFiltroAutopsia, setCursoFiltroAutopsia] = useState<CursoId | 'todos'>('todos');

  const carrera = useMemo(() => {
    try {
      return buscarCarrera(settings.carreraId);
    } catch {
      return buscarCarrera('medicina-humana');
    }
  }, [settings.carreraId]);

  const configCiclo: ConfigCiclo = useMemo(
    () => ({
      inicio: settings.inicioCiclo,
      semanas: 15,
      fechasEval: settings.fechasEval,
    }),
    [settings.inicioCiclo, settings.fechasEval],
  );

  // 1. Curva de Acumulación + KPIs
  const datosCurva = useMemo(
    () =>
      construirDatosCurvaAcumulacion({
        carreraId: carrera.id,
        metaPersonal: settings.metaPersonal,
        simulacros,
      }),
    [carrera.id, settings.metaPersonal, simulacros],
  );

  const metaSig = useMemo(
    () => metaSiguienteEvaluacion(acumuladoReal(simulacros), datosCurva.objetivoTotal),
    [simulacros, datosCurva.objetivoTotal],
  );

  const proxEval = useMemo(() => proximaEvaluacion(fechaHoy, configCiclo), [fechaHoy, configCiclo]);

  // 2. Radar de Dominio (4 bloques + detalle por curso al tocar un bloque)
  const datosRadar = useMemo(
    () =>
      calcularDatosRadarDominio({
        fuente: fuenteRadar,
        fechaHoy,
        carreraId: carrera.id,
        umbralSeguridad: settings.umbralSeguridad,
        simulacros,
        practices,
      }),
    [fuenteRadar, fechaHoy, carrera.id, settings.umbralSeguridad, simulacros, practices],
  );

  const cursosDelBloqueSeleccionado = useMemo(() => {
    if (!bloqueDetalle) return [];
    return datosRadar.porCurso.filter((c) => c.bloque === bloqueDetalle);
  }, [bloqueDetalle, datosRadar.porCurso]);

  // 3. Autopsia de Errores (Donut)
  const datosAutopsia = useMemo(
    () =>
      calcularAutopsiaErrores({
        mistakes: mistakes.map((m) => ({
          fecha: m.fecha ?? fechaEnLima(new Date(m.creadoEn)),
          creadoEn: m.creadoEn,
          cursoId: m.cursoId,
          temaId: m.temaId,
          categoria: m.categoria,
          estado: m.estado,
        })),
        agrupacion: agrupacionAutopsia,
        periodo: periodoAutopsia,
        cursoFiltro: cursoFiltroAutopsia,
        fechaHoy,
      }),
    [mistakes, agrupacionAutopsia, periodoAutopsia, cursoFiltroAutopsia, fechaHoy],
  );

  // 4. Acción Inmediata (máximo 3 acciones concretas; comparte motor con "Hoy")
  const accionesInmediatas = useMemo(
    () =>
      generarAccionesInmediatas({
        fechaHoy,
        area: carrera.area,
        umbralSeguridad: settings.umbralSeguridad,
        practices,
        mistakes: mistakes.map((m) => ({
          fecha: m.fecha ?? fechaEnLima(new Date(m.creadoEn)),
          creadoEn: m.creadoEn,
          cursoId: m.cursoId,
          temaId: m.temaId,
          categoria: m.categoria,
          estado: m.estado,
        })),
        focusSessions,
        planDelDia: planHoy,
      }),
    [fechaHoy, carrera.area, settings.umbralSeguridad, practices, mistakes, focusSessions, planHoy],
  );

  const hayEjesBajoUmbral = datosRadar.ejes.some((e) => e.bajoUmbral);

  return (
    <section
      data-testid="comando-view"
      aria-label="Progreso y Analítica"
      className="flex flex-col gap-3 xl:grid xl:h-[calc(100vh-4.75rem)] xl:grid-cols-12 xl:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] xl:gap-3 xl:overflow-hidden"
    >
      {/* 1. FRANJA DE KPIs (5 KPIs exactos) */}
      <div
        data-testid="comando-kpi-strip"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:col-span-12 xl:grid-cols-5"
      >
        {/* KPI 1: Acumulado real */}
        <article
          data-testid="kpi-acumulado-real"
          className="rounded-xl border border-border bg-surface px-3 py-2"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Acumulado real
          </p>
          <p className="mt-0.5 font-mono text-lg font-extrabold text-accent">
            {datosCurva.acumuladoTotal.toFixed(3)}{' '}
            <span className="text-xs font-normal text-text-muted">pts</span>
          </p>
          <p className="truncate text-[11px] text-text-muted">Suma directa (4 eval.)</p>
        </article>

        {/* KPI 2: Corte / Meta */}
        <article
          data-testid="kpi-corte-meta"
          className="rounded-xl border border-border bg-surface px-3 py-2"
        >
          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {datosCurva.fuenteObjetivo === 'meta' ? 'Meta personal' : 'Corte carrera'}
            </p>
            {datosCurva.esCorteEstimado && (
              <span
                data-testid="badge-corte-estimado"
                className="rounded bg-warn/20 px-1.5 py-0.5 text-[10px] font-bold text-warn"
              >
                Corte estimado
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-lg font-extrabold text-text">
            {datosCurva.objetivoTotal.toFixed(3)}{' '}
            <span className="text-xs font-normal text-text-muted">pts</span>
          </p>
          <p className="truncate text-[11px] text-text-muted">
            {carrera.nombre} (Área {carrera.area})
          </p>
        </article>

        {/* KPI 3: BRECHA exacta en puntos */}
        <article
          data-testid="kpi-brecha-exacta"
          className="rounded-xl border border-border bg-surface px-3 py-2"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Brecha exacta
          </p>
          <p
            className={`mt-0.5 font-mono text-lg font-extrabold ${
              datosCurva.brechaExacta > 0 ? 'text-danger' : 'text-success'
            }`}
          >
            {datosCurva.brechaExacta > 0
              ? `-${datosCurva.brechaExacta.toFixed(3)}`
              : `+${Math.abs(datosCurva.brechaExacta).toFixed(3)}`}{' '}
            <span className="text-xs font-normal text-text-muted">pts</span>
          </p>
          <p className="truncate text-[11px] text-text-muted">
            {datosCurva.brechaExacta > 0 ? 'Por cubrir hacia el objetivo' : 'Objetivo superado'}
          </p>
        </article>

        {/* KPI 4: Meta de la siguiente evaluación */}
        <article
          data-testid="kpi-meta-siguiente"
          className="rounded-xl border border-border bg-surface px-3 py-2"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Meta siguiente eval.
          </p>
          <p className="mt-0.5 font-mono text-lg font-extrabold text-accent-2">
            {metaSig !== null ? (
              <>
                {metaSig.meta.toFixed(3)}{' '}
                <span className="text-xs font-normal text-text-muted">pts</span>
              </>
            ) : (
              'Completado'
            )}
          </p>
          <p className="truncate text-[11px] text-text-muted">
            {metaSig
              ? `${REGLAS_EVALUACION[metaSig.evaluacion].nombre} (${metaSig.buenasNecesarias} buenas)`
              : '4 evaluaciones rendidas'}
          </p>
        </article>

        {/* KPI 5: Días para la próxima evaluación */}
        <article
          data-testid="kpi-dias-proxima"
          className="col-span-2 rounded-xl border border-border bg-surface px-3 py-2 sm:col-span-1"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Próxima evaluación
          </p>
          <p className="mt-0.5 font-mono text-lg font-extrabold text-text">
            {proxEval ? (
              <>
                {proxEval.dias} <span className="text-xs font-normal text-text-muted">días</span>
              </>
            ) : (
              'Finalizado'
            )}
          </p>
          <p className="truncate text-[11px] text-text-muted">
            {proxEval
              ? `${REGLAS_EVALUACION[proxEval.id].nombre} · ${proxEval.fecha}`
              : 'Ciclo CEPRE concluido'}
          </p>
        </article>
      </div>

      {/* 2. CURVA DE ACUMULACIÓN (Líneas, Recharts) */}
      <article
        data-testid="panel-curva-acumulacion"
        className="flex flex-col rounded-xl border border-border bg-surface p-3 xl:col-span-6 xl:min-h-0"
      >
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text">
              Curva de Acumulación (4 Evaluaciones)
            </h2>
            <p className="text-[11px] text-text-muted">
              Acumulado real vs. línea requerida ({carrera.nombre}
              {datosCurva.esCorteEstimado ? ' · Corte estimado' : ' · Corte oficial'})
            </p>
          </div>
          <span
            data-testid="marcador-brecha-curva"
            className="rounded-lg border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-semibold text-text"
          >
            Brecha restante: {datosCurva.brechaExacta.toFixed(3)} pts
          </span>
        </div>

        <div className="h-52 w-full xl:min-h-0 xl:flex-1">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 520, height: 210 }}
          >
            <LineChart data={datosCurva.puntos} margin={{ top: 8, right: 14, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="etiqueta"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                stroke="var(--border)"
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                stroke="var(--border)"
                width={46}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  borderRadius: '8px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <ReferenceLine
                y={datosCurva.objetivoTotal}
                stroke="var(--danger)"
                strokeDasharray="2 2"
              />
              <Line
                type="monotone"
                dataKey="acumuladoReal"
                name="Acumulado real"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: 'var(--chart-1)' }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="lineaRequerida"
                name={
                  datosCurva.esCorteEstimado
                    ? 'Línea requerida (Corte estimado)'
                    : 'Línea requerida (Corte)'
                }
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--chart-2)' }}
                isAnimationActive={false}
              />
              {settings.metaPersonal !== null && (
                <Line
                  type="monotone"
                  dataKey="lineaMetaPersonal"
                  name="Meta personal"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: 'var(--chart-3)' }}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      {/* 3. RADAR DE DOMINIO (4 ejes + bajada a barras por curso) */}
      <article
        data-testid="panel-radar-dominio"
        className="flex flex-col rounded-xl border border-border bg-surface p-3 xl:col-span-6 xl:min-h-0"
      >
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text">
              Radar de Dominio (Umbral {settings.umbralSeguridad}%)
            </h2>
            <p className="text-[11px] text-text-muted">
              {bloqueDetalle
                ? `Detalle por curso · Bloque ${bloqueDetalle.toUpperCase()}`
                : 'Toca un bloque para bajar al detalle por curso'}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="btn-fuente-simulacros"
              onClick={() => setFuenteRadar('simulacros')}
              className={`min-h-11 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors xl:min-h-7 ${
                fuenteRadar === 'simulacros'
                  ? 'bg-accent text-bg'
                  : 'bg-surface-2 text-text-muted hover:text-text'
              }`}
            >
              Simulacros
            </button>
            <button
              type="button"
              data-testid="btn-fuente-practica-30d"
              onClick={() => setFuenteRadar('practica_30d')}
              className={`min-h-11 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors xl:min-h-7 ${
                fuenteRadar === 'practica_30d'
                  ? 'bg-accent text-bg'
                  : 'bg-surface-2 text-text-muted hover:text-text'
              }`}
            >
              Últimos 30 días
            </button>
          </div>
        </div>

        {/* Botones de los 4 bloques (muestran alerta si < umbralSeguridad y permiten drilldown con 1 toque) */}
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {bloqueDetalle !== null && (
            <button
              type="button"
              data-testid="btn-radar-volver-bloques"
              onClick={() => setBloqueDetalle(null)}
              className="min-h-11 rounded-lg border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-surface xl:min-h-7"
            >
              ← 4 bloques
            </button>
          )}
          {datosRadar.ejes.map((eje) => (
            <button
              key={eje.bloque}
              type="button"
              data-testid={`btn-bloque-${eje.bloque}`}
              data-bajo-umbral={eje.bajoUmbral ? 'true' : 'false'}
              onClick={() => setBloqueDetalle((prev) => (prev === eje.bloque ? null : eje.bloque))}
              style={{
                borderColor: eje.bajoUmbral ? 'var(--danger)' : 'var(--border)',
                color: eje.bajoUmbral ? 'var(--danger)' : 'var(--text)',
              }}
              className={`min-h-11 rounded-lg border px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors xl:min-h-7 ${
                bloqueDetalle === eje.bloque ? 'bg-surface-2 ring-1 ring-accent' : 'bg-surface'
              }`}
            >
              {eje.etiqueta}: {eje.efectividad}%
            </button>
          ))}
        </div>

        {!datosRadar.datosSuficientes ? (
          <div
            data-testid="radar-sin-datos"
            className="flex h-48 flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-2/50 p-4 text-center xl:min-h-0"
          >
            <p className="text-xs font-semibold text-warn">{datosRadar.mensajeFaltanDatos}</p>
            <p className="mt-1 text-[11px] text-text-muted">
              No se dibuja un radar vacío sin muestra mínima verificada.
            </p>
          </div>
        ) : bloqueDetalle === null ? (
          <div data-testid="radar-chart-bloques" className="h-48 w-full xl:min-h-0 xl:flex-1">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 520, height: 190 }}
            >
              <RadarChart data={datosRadar.ejes} outerRadius="72%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="etiqueta" tick={{ fill: 'var(--text)', fontSize: 11 }} />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface-2)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                    fontSize: '12px',
                    borderRadius: '8px',
                  }}
                />
                <Radar
                  name="Efectividad (%)"
                  dataKey="efectividad"
                  stroke={hayEjesBajoUmbral ? 'var(--danger)' : 'var(--chart-1)'}
                  fill={hayEjesBajoUmbral ? 'var(--danger)' : 'var(--chart-1)'}
                  fillOpacity={0.3}
                  isAnimationActive={false}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            data-testid={`radar-detalle-cursos-${bloqueDetalle}`}
            className="h-48 w-full xl:min-h-0 xl:flex-1"
          >
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 520, height: 190 }}
            >
              <BarChart
                data={cursosDelBloqueSeleccionado}
                margin={{ top: 6, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="nombre"
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  stroke="var(--border)"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  stroke="var(--border)"
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface-2)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                    fontSize: '12px',
                    borderRadius: '8px',
                  }}
                />
                <ReferenceLine
                  y={settings.umbralSeguridad}
                  stroke="var(--danger)"
                  strokeDasharray="3 3"
                />
                <Bar dataKey="efectividad" name="Efectividad (%)" isAnimationActive={false}>
                  {cursosDelBloqueSeleccionado.map((entry) => (
                    <Cell
                      key={entry.cursoId}
                      fill={entry.bajoUmbral ? 'var(--danger)' : 'var(--chart-1)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </article>

      {/* 4. AUTOPSIA DE ERRORES (Donut Recharts) */}
      <article
        data-testid="panel-autopsia-errores"
        className="flex flex-col rounded-xl border border-border bg-surface p-3 xl:col-span-6 xl:min-h-0"
      >
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text">
              Autopsia de Errores
            </h2>
            <p className="text-[11px] text-text-muted">
              Clasificados: {datosAutopsia.totalClasificados} ·{' '}
              <span data-testid="autopsia-por-clasificar" className="font-semibold text-warn">
                Por clasificar: {datosAutopsia.porClasificar}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              data-testid="btn-autopsia-categoria"
              onClick={() => setAgrupacionAutopsia('categoria')}
              className={`min-h-11 rounded-lg px-2 py-0.5 text-[11px] font-semibold xl:min-h-7 ${
                agrupacionAutopsia === 'categoria'
                  ? 'bg-accent text-bg'
                  : 'bg-surface-2 text-text-muted'
              }`}
            >
              5 Categorías
            </button>
            <button
              type="button"
              data-testid="btn-autopsia-grupo"
              onClick={() => setAgrupacionAutopsia('grupo')}
              className={`min-h-11 rounded-lg px-2 py-0.5 text-[11px] font-semibold xl:min-h-7 ${
                agrupacionAutopsia === 'grupo'
                  ? 'bg-accent text-bg'
                  : 'bg-surface-2 text-text-muted'
              }`}
            >
              Cognitivo/Proc./Mixto
            </button>
            <select
              aria-label="Filtrar autopsia por periodo"
              data-testid="select-autopsia-periodo"
              value={periodoAutopsia}
              onChange={(e) => setPeriodoAutopsia(e.target.value as PeriodoAutopsia)}
              className="min-h-11 rounded-lg border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-text xl:min-h-7"
            >
              <option value="7d">7 días</option>
              <option value="30d">30 días</option>
              <option value="ciclo">Todo el ciclo</option>
            </select>
            <select
              aria-label="Filtrar autopsia por curso"
              data-testid="select-autopsia-curso"
              value={cursoFiltroAutopsia}
              onChange={(e) => setCursoFiltroAutopsia(e.target.value as CursoId | 'todos')}
              className="min-h-11 rounded-lg border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-text xl:min-h-7"
            >
              <option value="todos">Todos los cursos</option>
              {CURSOS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid h-48 grid-cols-1 items-center gap-2 sm:grid-cols-12 xl:min-h-0 xl:flex-1">
          <div className="h-40 sm:col-span-6 xl:h-full">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 240, height: 170 }}
            >
              <PieChart>
                <Pie
                  data={datosAutopsia.segmentos}
                  dataKey="cantidad"
                  nameKey="etiqueta"
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={62}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {datosAutopsia.segmentos.map((seg) => (
                    <Cell key={seg.clave} fill={seg.tokenColor} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface-2)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                    fontSize: '12px',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col gap-1 sm:col-span-6">
            {datosAutopsia.segmentos.map((seg) => (
              <div
                key={seg.clave}
                data-testid={`autopsia-item-${seg.clave}`}
                className="flex items-center justify-between rounded-lg bg-surface-2/60 px-2 py-1 text-[11px]"
              >
                <span className="flex items-center gap-1.5 truncate text-text">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: seg.tokenColor }}
                  />
                  <span className="truncate">{seg.etiqueta}</span>
                </span>
                <span className="font-mono font-semibold text-text">
                  {seg.cantidad} ({seg.porcentaje}%)
                </span>
              </div>
            ))}

            {datosAutopsia.porClasificar > 0 && onIrAClasificarErrores && (
              <button
                type="button"
                data-testid="btn-autopsia-clasificar"
                onClick={onIrAClasificarErrores}
                className="mt-0.5 rounded-lg border border-warn/50 bg-warn/10 px-2 py-1 text-left text-[11px] font-semibold text-warn hover:bg-warn/20"
              >
                Clasificar {datosAutopsia.porClasificar} error(es) pendiente(s) →
              </button>
            )}
          </div>
        </div>
      </article>

      {/* 5. ACCIÓN INMEDIATA (Máximo 3 acciones concretas · mismo motor con "Hoy") */}
      <article
        data-testid="panel-accion-inmediata"
        className="flex flex-col rounded-xl border border-border bg-surface p-3 xl:col-span-6 xl:min-h-0"
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text">
              Acción Inmediata (Máx. 3)
            </h2>
            <p className="text-[11px] text-text-muted">
              Motor compartido con «Hoy» y reglas R1–R5 con umbral mínimo de datos
            </p>
          </div>
          <span className="rounded-lg bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
            {accionesInmediatas.length}/3 activas
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-between gap-2 xl:min-h-0">
          {accionesInmediatas.map((acc, index) => {
            const cursoIdAccion = acc.cursoId;
            return (
              <div
                key={acc.id}
                data-testid={`accion-inmediata-item-${index}`}
                data-regla={acc.regla}
                className={`flex items-start justify-between gap-2 rounded-xl border p-2.5 ${
                  acc.esFaltanDatos
                    ? 'border-border bg-surface-2/50'
                    : index === 0
                      ? 'border-accent/60 bg-surface-2'
                      : 'border-border bg-surface-2/80'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                        acc.esFaltanDatos ? 'bg-warn/20 text-warn' : 'bg-accent/20 text-accent'
                      }`}
                    >
                      {acc.regla}
                    </span>
                    <h3 className="truncate text-xs font-bold text-text">{acc.titulo}</h3>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-text-muted">
                    {acc.texto}
                  </p>
                </div>

                {cursoIdAccion !== null && onIniciarEnfoqueCurso && (
                  <button
                    type="button"
                    data-testid={`btn-accion-enfoque-${index}`}
                    onClick={() => onIniciarEnfoqueCurso(cursoIdAccion, acc.temaId)}
                    className="min-h-11 shrink-0 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-bold text-bg hover:opacity-90 xl:min-h-7"
                  >
                    Enfocar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}
