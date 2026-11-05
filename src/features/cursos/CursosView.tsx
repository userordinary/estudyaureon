/**
 * Feature `cursos` (`src/features/cursos/CursosView.tsx` — PROMPT 6):
 * 1. Vista "Todos los cursos" con los 19 cursos oficiales, preguntas de la semana y meta semanal editable con <ProgressBar />.
 * 2. Lista de temas S1–S18 por curso con estado ('pendiente' | 'trabajado' | 'progreso' | 'dominado') y filtros:
 *    - "Hasta mi evaluación actual"
 *    - "Las 18 semanas"
 *    - "Solo pendientes"
 * 3. El tema pasa a "trabajado" al registrar práctica; "en progreso" y "dominado" los decide el usuario.
 *    Sugiere "dominado" (sin aplicarlo automáticamente) cuando tiene >= 85 % de precisión en >= 20 preguntas y 0 errores abiertos del tema.
 * 4. Pantalla de recursos con enlaces editables (Drive de boletines, solucionarios, simulacros) persistidos en Settings.
 */
import { useState } from 'react';
import {
  totalesPracticaSemana,
  type Mistake,
  type Practice,
  type RecursoEnlace,
  type Settings,
  type TopicProgress,
} from '../../data';
import {
  areaDeCarrera,
  CURSOS,
  evaluacionActiva,
  evaluarSugerenciaDominado,
  filtrarTemasCurso,
  metaSemanalCursoEfectiva,
  REGLAS_EVALUACION,
  temasDeCurso,
  type ConfigCiclo,
  type CursoId,
  type EstadoTemaDominio,
  type FechaISO,
  type FiltroTemasCurso,
} from '../../domain';
import { Button, Chip, ProgressBar } from '../../ui';

export interface CursosViewProps {
  fechaHoy: FechaISO;
  settings: Settings;
  practices: readonly Practice[];
  mistakes: readonly Mistake[];
  topicProgress: readonly TopicProgress[];
  onCambiarEstadoTema: (
    cursoId: CursoId,
    temaId: string,
    estado: EstadoTemaDominio,
  ) => Promise<void> | void;
  onActualizarMetaCurso: (cursoId: CursoId, nuevaMeta: number) => Promise<void> | void;
  onActualizarRecursos?: (enlaces: RecursoEnlace[]) => Promise<void> | void;
}

const ETIQUETAS_ESTADO_TEMA: Readonly<Record<EstadoTemaDominio, string>> = {
  pendiente: 'Pendiente',
  trabajado: 'Trabajado',
  progreso: 'En progreso',
  dominado: 'Dominado',
};

export function CursosView({
  fechaHoy,
  settings,
  practices,
  mistakes,
  topicProgress,
  onCambiarEstadoTema,
  onActualizarMetaCurso,
}: CursosViewProps) {
  const [cursoActivoId, setCursoActivoId] = useState<CursoId>('quim');
  const [filtroTemas, setFiltroTemas] = useState<FiltroTemasCurso>('todas_18');

  // Configuración del ciclo y área del estudiante
  const cfgCiclo: ConfigCiclo = {
    inicio: settings.inicioCiclo,
    semanas: 15,
    fechasEval: settings.fechasEval,
  };
  const evalActiva = evaluacionActiva(fechaHoy, cfgCiclo);
  const area = areaDeCarrera(settings.carreraId);

  // Mapa rápido de estados por temaId
  const estadosPorTema: Record<string, EstadoTemaDominio> = {};
  for (const tp of topicProgress) {
    estadosPorTema[tp.temaId] = tp.estado;
  }

  // Estadísticas acumuladas por temaId (ok, bad) y errores abiertos por temaId
  const statsPorTema = new Map<string, { ok: number; bad: number }>();
  for (const p of practices) {
    if (p.temaId && !p.sinDetalle) {
      const prev = statsPorTema.get(p.temaId) ?? { ok: 0, bad: 0 };
      prev.ok += p.ok;
      prev.bad += p.bad;
      statsPorTema.set(p.temaId, prev);
    }
  }

  const erroresAbiertosPorTema = new Map<string, number>();
  for (const m of mistakes) {
    if (m.temaId && m.estado !== 'dominado') {
      erroresAbiertosPorTema.set(m.temaId, (erroresAbiertosPorTema.get(m.temaId) ?? 0) + 1);
    }
  }

  const cursoActivo = CURSOS.find((c) => c.id === cursoActivoId) ?? CURSOS[0];
  const todosTemasCursoActivo = cursoActivo ? temasDeCurso(cursoActivo.id) : [];
  const temasFiltrados = filtrarTemasCurso(
    todosTemasCursoActivo,
    filtroTemas,
    evalActiva,
    estadosPorTema,
  );

  return (
    <div className="space-y-6" data-testid="cursos-view">
      {/* 1. Vista "Todos los cursos" con los 19 cursos oficiales */}
      <section
        aria-labelledby="sec-todos-cursos"
        data-testid="grid-19-cursos"
        className="space-y-3 rounded-2xl border border-border bg-surface p-4"
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 id="sec-todos-cursos" className="text-base font-bold text-text">
              Todos los Cursos ({CURSOS.length} materias oficiales)
            </h1>
            <p className="text-xs text-text-muted">
              Avance de preguntas de esta semana frente a la meta semanal editable de cada curso.
            </p>
          </div>
          <Chip tone="accent">
            Área {area} · {REGLAS_EVALUACION[evalActiva].nombre}
          </Chip>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CURSOS.map((curso) => {
            const semStats = totalesPracticaSemana(practices, fechaHoy, curso.id);
            const metaSemanal = metaSemanalCursoEfectiva(
              curso.id,
              area,
              evalActiva,
              settings.metasCursoSemana,
            );
            const temasDelCurso = temasDeCurso(curso.id);
            const dominadosCount = temasDelCurso.filter(
              (t) => estadosPorTema[t.id] === 'dominado',
            ).length;
            const esActivo = curso.id === cursoActivoId;

            return (
              <article
                key={curso.id}
                data-testid={`tarjeta-curso-${curso.id}`}
                className={`flex flex-col justify-between gap-2.5 rounded-xl border p-3.5 transition-colors ${
                  esActivo
                    ? 'border-accent bg-surface-2'
                    : 'border-border bg-surface hover:bg-surface-2'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-text">{curso.nombre}</h2>
                    <span className="text-[11px] uppercase text-text-muted">
                      {curso.bloque} · Dominados: {dominadosCount}/{temasDelCurso.length}
                    </span>
                  </div>
                  <Button
                    variant={esActivo ? 'primary' : 'secondary'}
                    size="sm"
                    data-testid={`btn-ver-temas-${curso.id}`}
                    onClick={() => setCursoActivoId(curso.id)}
                  >
                    {esActivo ? 'Viendo S1–S15' : 'Temas S1–S15'}
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-text">
                    Semana: <b>{semStats.preguntas}</b> / {metaSemanal} preg
                  </span>
                  <label className="flex items-center gap-1 text-text-muted">
                    Meta:
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      aria-label={`Meta semanal de ${curso.nombre}`}
                      data-testid={`input-meta-curso-${curso.id}`}
                      value={metaSemanal}
                      onChange={(e) => {
                        const val = Math.max(1, Number.parseInt(e.target.value, 10) || 1);
                        void onActualizarMetaCurso(curso.id, val);
                      }}
                      className="min-h-9 w-16 rounded border border-border bg-surface px-2 py-0.5 text-center font-mono text-xs font-bold text-text"
                    />
                  </label>
                </div>

                <ProgressBar
                  value={semStats.preguntas}
                  max={metaSemanal}
                  label={`Meta semanal ${curso.nombre}`}
                />
              </article>
            );
          })}
        </div>
      </section>

      {/* 2. Temario S1–S18 del curso seleccionado con filtros y sugerencia de "Dominado" */}
      {cursoActivo && (
        <section
          aria-labelledby="sec-temario-curso"
          data-testid="panel-temario-curso"
          className="space-y-4 rounded-2xl border border-border bg-surface p-4"
        >
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="sec-temario-curso" className="text-base font-bold text-text">
                Temario S1–S15 · {cursoActivo.nombre}
              </h2>
              <p className="text-xs text-text-muted">
                Pasa a «Trabajado» al practicar. «En progreso» y «Dominado» los decides tú (se
                sugiere Dominado con &ge;85% en &ge;20 preg y 0 errores abiertos).
              </p>
            </div>

            {/* Filtros de temas */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar temas">
              {(
                [
                  {
                    id: 'hasta_evaluacion',
                    label: `Hasta mi evaluación actual (S1–S${REGLAS_EVALUACION[evalActiva].semanas[1]})`,
                  },
                  { id: 'todas_18', label: 'Las 15 semanas (S1–S15)' },
                  { id: 'solo_pendientes', label: 'Solo pendientes' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  data-testid={`filtro-temas-${f.id}`}
                  aria-pressed={filtroTemas === f.id}
                  onClick={() => setFiltroTemas(f.id)}
                  className={`min-h-11 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filtroTemas === f.id
                      ? 'border-accent bg-surface-2 text-accent'
                      : 'border-border bg-surface text-text-muted hover:text-text'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </header>

          <div className="space-y-2.5">
            {temasFiltrados.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface-2 p-4 text-center text-xs text-text-muted">
                No hay temas para el filtro seleccionado.
              </p>
            ) : (
              temasFiltrados.map((tema) => {
                const estadoActual: EstadoTemaDominio = estadosPorTema[tema.id] ?? 'pendiente';
                const stats = statsPorTema.get(tema.id) ?? { ok: 0, bad: 0 };
                const errAbiertos = erroresAbiertosPorTema.get(tema.id) ?? 0;
                const evalSugerencia = evaluarSugerenciaDominado({
                  estadoActual,
                  ok: stats.ok,
                  bad: stats.bad,
                  erroresAbiertos: errAbiertos,
                });

                return (
                  <article
                    key={tema.id}
                    data-testid={`item-tema-${tema.id}`}
                    className="flex flex-col justify-between gap-2.5 rounded-xl border border-border bg-surface-2 p-3 text-xs sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-accent">S{tema.semana}</span>
                        <span className="font-semibold text-text">{tema.titulo}</span>
                        <Chip
                          tone={
                            estadoActual === 'dominado'
                              ? 'success'
                              : estadoActual === 'progreso'
                                ? 'accent'
                                : estadoActual === 'trabajado'
                                  ? 'warn'
                                  : 'neutral'
                          }
                        >
                          {ETIQUETAS_ESTADO_TEMA[estadoActual]}
                        </Chip>
                        {!tema.verificado && (
                          <span
                            data-testid={`badge-no-verificado-${tema.id}`}
                            className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
                            title="Título extraído del legado v4 pendiente de contraste con prospecto oficial"
                          >
                            Temario ref. (no verificado)
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-text-muted">
                        Práctica: <b className="text-text">{evalSugerencia.totalPreguntas} preg</b>
                        {evalSugerencia.precisionPorcentaje !== null && (
                          <>
                            {' '}
                            · Precisión:{' '}
                            <b className="text-text">{evalSugerencia.precisionPorcentaje}%</b>
                          </>
                        )}{' '}
                        · Errores abiertos: <b className="text-text">{errAbiertos}</b>
                      </div>

                      {/* Sugerencia no intrusiva de "Dominado" (sin aplicarlo automáticamente) */}
                      {evalSugerencia.sugerir && (
                        <div
                          data-testid={`sugerencia-dominado-${tema.id}`}
                          className="mt-1 inline-flex flex-wrap items-center gap-2 rounded-lg border border-success bg-surface px-2.5 py-1 text-xs text-success"
                        >
                          <span>★ {evalSugerencia.motivo}</span>
                          <button
                            type="button"
                            data-testid={`btn-aplicar-dominado-${tema.id}`}
                            onClick={() =>
                              void onCambiarEstadoTema(cursoActivo.id, tema.id, 'dominado')
                            }
                            className="rounded bg-success px-2 py-0.5 font-semibold text-bg"
                          >
                            Aplicar Dominado
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Estado del tema ${tema.titulo}`}
                        data-testid={`select-estado-tema-${tema.id}`}
                        value={estadoActual}
                        onChange={(e) =>
                          void onCambiarEstadoTema(
                            cursoActivo.id,
                            tema.id,
                            e.target.value as EstadoTemaDominio,
                          )
                        }
                        className="min-h-11 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text"
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="trabajado">Trabajado</option>
                        <option value="progreso">En progreso</option>
                        <option value="dominado">Dominado</option>
                      </select>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
