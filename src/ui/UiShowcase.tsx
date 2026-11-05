/**
 * Página temporal `/ui` que muestra todos los componentes base y la matriz de los 4 temas
 * (incluyendo ProgressBar a 70 % y 90 % y GoldCounter en cada tema, más la tabla de auditoría WCAG AA).
 */
import { useState, type CSSProperties } from 'react';
import { desbloquearAudio, reproducirCampanaElegante } from './audio';
import { Button, Chip, KpiCard, RingProgress, Sheet, Toast } from './components';
import { GoldCounter } from './GoldCounter';
import { ProgressBar } from './ProgressBar';
import { auditarContrasteTema, PERFILES_TEMA, TEMAS_UI, type TemaUI } from './theme';
import { ThemeQuickSwitch, ThemeSettingsSelector, useTheme } from './ThemeProvider';
import {
  BackgroundSelector,
  CATALOGO_FONDOS_ANIMADOS,
  DigitalRainCanvas,
  GalaxyCanvas,
  leerFondoStorage,
  MoonlitRippleCanvas,
  MoltenMetalCanvas,
  RainOnGlassCanvas,
  ThreadsCanvas,
  type FondoAnimadoId,
} from './backgrounds';

/**
 * Convierte los tokens de un tema en un estilo inline de variables CSS para que la matriz
 * de `/ui` pueda mostrar una vista previa simultánea de los 4 temas a la vez.
 */
function variablesCssDeTema(tema: TemaUI): CSSProperties {
  const t = PERFILES_TEMA[tema].tokens;
  return {
    '--bg': t.bg,
    '--surface': t.surface,
    '--surface-2': t.surface2,
    '--border': t.border,
    '--text': t.text,
    '--text-muted': t.textMuted,
    '--accent': t.accent,
    '--accent-2': t.accent2,
    '--success': t.success,
    '--warn': t.warn,
    '--danger': t.danger,
    '--focus': t.focus,
    '--rest': t.rest,
    '--gold-1': t.gold1,
    '--gold-2': t.gold2,
    '--gold-3': t.gold3,
    '--gold-4': t.gold4,
    '--chart-1': t.chart1,
    '--chart-2': t.chart2,
    '--chart-3': t.chart3,
    '--chart-4': t.chart4,
    '--chart-5': t.chart5,
    '--chart-6': t.chart6,
  } as CSSProperties;
}

export interface UiShowcaseProps {
  fondoAnimado?: FondoAnimadoId;
  onCambiarFondoAnimado?: (nuevoFondo: FondoAnimadoId) => void | Promise<void>;
}

export function UiShowcase({
  fondoAnimado: fondoProp,
  onCambiarFondoAnimado,
}: UiShowcaseProps = {}) {
  const { tema } = useTheme();
  const [fondoLocal, setFondoLocal] = useState<FondoAnimadoId>(
    () => fondoProp ?? leerFondoStorage(),
  );
  const fondoActual = fondoProp ?? fondoLocal;
  const [contadorHist, setContadorHist] = useState<number>(1428);
  const [sheetAbierto, setSheetAbierto] = useState<boolean>(false);
  const [toastAbierto, setToastAbierto] = useState<boolean>(false);
  const [fasePomodoro, setFasePomodoro] = useState<'focus' | 'rest'>('focus');

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Barra superior con atajo rápido de tema y GoldCounter global */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-base font-bold tracking-tight text-accent">AUREON</span>
            <Chip tone="accent">/ui · Galería del Sistema de Diseño</Chip>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5">
              <span className="text-xs text-text-muted">Total histórico:</span>
              <GoldCounter value={contadorHist} />
            </div>
            <ThemeQuickSwitch />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
        {/* 1. Selector de tema estilo Ajustes */}
        <section
          aria-labelledby="sec-temas"
          className="rounded-2xl border border-border bg-surface p-5"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 id="sec-temas" className="text-lg font-bold text-text">
                1. Selector de Tema (Ajustes) · Activo: {PERFILES_TEMA[tema].nombre}
              </h1>
              <p className="text-xs text-text-muted">
                Cambia `data-theme` en `&lt;html&gt;` en vivo sin recargar la página y lo guarda en
                Settings.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setContadorHist((prev) => prev + 25)}
            >
              +25 preguntas al GoldCounter
            </Button>
          </div>
          <ThemeSettingsSelector />
        </section>

        {/* 2. Selector y Previsualización de Fondos Animados */}
        <section
          aria-labelledby="sec-fondos-animados"
          className="space-y-4 rounded-2xl border border-border bg-surface p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="sec-fondos-animados" className="text-lg font-bold text-text">
                2. Fondos Animados Interactivos (Canvas 2D & WebGL Shaders)
              </h2>
              <p className="text-xs text-text-muted">
                Elige uno de los fondos dinámicos interactivos para personalizar el ambiente visual
                de AUREON.
              </p>
            </div>
            <span
              data-testid="badge-fondo-activo"
              className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-xs font-semibold text-accent"
            >
              Activo: {CATALOGO_FONDOS_ANIMADOS[fondoActual].nombre}
            </span>
          </div>

          <BackgroundSelector
            fondoSeleccionado={fondoActual}
            onSeleccionarFondo={(id) => {
              setFondoLocal(id);
              void onCambiarFondoAnimado?.(id);
            }}
          />

          {/* Caja interactiva de demostración en vivo */}
          {fondoActual !== 'ninguno' && (
            <div
              data-testid="live-preview-box"
              className="relative mt-2 h-72 w-full overflow-hidden rounded-xl border border-border bg-black/70 shadow-inner"
            >
              <div className="absolute inset-0 z-0">
                {fondoActual === 'digital-rain' && <DigitalRainCanvas />}
                {fondoActual === 'rain-glass' && <RainOnGlassCanvas />}
                {fondoActual === 'moonlit-ripple' && <MoonlitRippleCanvas />}
                {fondoActual === 'galaxy' && <GalaxyCanvas />}
                {fondoActual === 'threads' && <ThreadsCanvas />}
                {fondoActual === 'metal-esmeralda' && <MoltenMetalCanvas />}
              </div>
              <div className="absolute top-3 left-3 z-10 rounded-lg border border-border/80 bg-surface/85 px-2.5 py-1 text-[11px] font-semibold text-text shadow backdrop-blur">
                Área de interacción táctil / ratón · {CATALOGO_FONDOS_ANIMADOS[fondoActual].nombre}
              </div>
              <div className="absolute bottom-3 right-3 z-10 rounded-lg border border-border/80 bg-surface/85 px-2.5 py-1 text-[11px] text-text-muted shadow backdrop-blur">
                Haz clic o desliza el cursor para interactuar
              </div>
            </div>
          )}
        </section>

        {/* 3. Matriz comparativa en los 4 temas (ProgressBar 70% y 90% + GoldCounter) */}
        <section aria-labelledby="sec-matriz" className="space-y-4">
          <div>
            <h2 id="sec-matriz" className="text-lg font-bold text-text">
              3. Comparativa en los 4 Temas (ProgressBar 70 % vs 90 % y GoldCounter)
            </h2>
            <p className="text-xs text-text-muted">
              Al 70 % usa color sólido del acento. Al 90 % (&gt;= 85 %), solo «gamificado» activa el
              gradiente RGB animado.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {TEMAS_UI.map((idTema) => {
              const info = PERFILES_TEMA[idTema];
              const audit = auditarContrasteTema(idTema);
              return (
                <article
                  key={idTema}
                  data-testid={`showcase-theme-card-${idTema}`}
                  style={variablesCssDeTema(idTema)}
                  className="space-y-4 rounded-2xl border border-border bg-surface p-5 text-text"
                >
                  <header className="flex items-center justify-between gap-2 border-b border-border pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-text">{info.nombre}</h3>
                      <p className="text-xs text-text-muted">{info.resumen}</p>
                    </div>
                    <Chip tone="success">AA {audit.textSobreBg}:1</Chip>
                  </header>

                  <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
                    <span className="text-xs font-medium text-text-muted">
                      Contador histórico ({idTema})
                    </span>
                    <GoldCounter value={contadorHist} temaForzado={idTema} />
                  </div>

                  <div className="space-y-3">
                    <ProgressBar
                      value={70}
                      max={100}
                      label={`Meta semanal (${idTema} · 70 %)`}
                      mostrarPorcentaje
                      temaForzado={idTema}
                    />
                    <ProgressBar
                      value={90}
                      max={100}
                      label={`Meta semanal (${idTema} · 90 % >= 85 %)`}
                      mostrarPorcentaje
                      temaForzado={idTema}
                    />
                  </div>

                  {/* Muestra de series de gráficos chart-1..chart-6 */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="mr-1 text-xs text-text-muted">Series:</span>
                    <span className="h-3 w-5 rounded-sm bg-chart-1" title="chart-1" />
                    <span className="h-3 w-5 rounded-sm bg-chart-2" title="chart-2" />
                    <span className="h-3 w-5 rounded-sm bg-chart-3" title="chart-3" />
                    <span className="h-3 w-5 rounded-sm bg-chart-4" title="chart-4" />
                    <span className="h-3 w-5 rounded-sm bg-chart-5" title="chart-5" />
                    <span className="h-3 w-5 rounded-sm bg-chart-6" title="chart-6" />
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* 3. Componentes base interactivos en el tema activo */}
        <section
          aria-labelledby="sec-componentes"
          className="space-y-5 rounded-2xl border border-border bg-surface p-5"
        >
          <h2 id="sec-componentes" className="text-lg font-bold text-text">
            3. Componentes Base (KPIs, Chips, Botones, RingProgress, Sheet y Toast)
          </h2>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              label="Acumulado CEPRE"
              value="985.542 pts"
              subtitle="Corte Medicina S14: 985.542 pts"
              badge={<Chip tone="accent">En ritmo</Chip>}
              highlight
            />
            <KpiCard
              label="Preguntas Semana"
              value="108 / 120"
              subtitle="Precisión: 88 %"
              badge={<Chip tone="success">90 %</Chip>}
            />
            <KpiCard
              label="Errores por clasificar"
              value="2"
              subtitle="Caja 1–6 en circuito: 14"
              badge={<Chip tone="warn">Atención</Chip>}
            />
          </div>

          {/* Chips y Botones */}
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="neutral">Neutral</Chip>
            <Chip tone="accent">Acento</Chip>
            <Chip tone="success">Dominado</Chip>
            <Chip tone="warn">En progreso</Chip>
            <Chip tone="danger">Crítico</Chip>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => setSheetAbierto(true)}>
              Abrir Sheet (Modal / Hoja)
            </Button>
            <Button variant="secondary" onClick={() => setToastAbierto(true)}>
              Mostrar Toast con Deshacer (6 s)
            </Button>
            <Button
              variant="ghost"
              onClick={() => setFasePomodoro((f) => (f === 'focus' ? 'rest' : 'focus'))}
            >
              Cambiar fase Anillo ({fasePomodoro === 'focus' ? 'Enfoque' : 'Descanso'})
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void desbloquearAudio();
                void reproducirCampanaElegante('fin_enfoque');
              }}
            >
              🔔 Campana Fin Enfoque
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void desbloquearAudio();
                void reproducirCampanaElegante('fin_descanso');
              }}
            >
              🔔 Campana Fin Descanso
            </Button>
            <Button variant="danger">Acción Peligrosa</Button>
          </div>

          {/* RingProgress SVG */}
          <div className="flex flex-wrap items-center gap-6 rounded-xl border border-border bg-surface-2 p-4">
            <RingProgress
              value={fasePomodoro === 'focus' ? 38 : 8}
              max={fasePomodoro === 'focus' ? 50 : 10}
              phase={fasePomodoro}
              label="Temporizador de enfoque"
              centerContent={
                <div>
                  <div className="text-lg font-bold">
                    {fasePomodoro === 'focus' ? '38:00' : '08:00'}
                  </div>
                  <div className="text-[11px] uppercase text-text-muted">
                    {fasePomodoro === 'focus' ? 'Inmersión' : 'Descanso'}
                  </div>
                </div>
              }
            />
            <div className="space-y-1 text-xs text-text-muted">
              <p className="font-semibold text-text">Anillo SVG (`&lt;RingProgress /&gt;`)</p>
              <p>Acepta color de fase mediante tokens `--focus` y `--rest`.</p>
              <p>Respeta `prefers-reduced-motion` y desactiva transiciones en el perfil `oled`.</p>
            </div>
          </div>
        </section>

        <Sheet
          open={sheetAbierto}
          onClose={() => setSheetAbierto(false)}
          title="Registrar Tanda Rápida"
          description="Hoja inferior en celular y modal centrado en PC. Pulsa Escape para cerrar."
          footer={
            <>
              <Button variant="ghost" onClick={() => setSheetAbierto(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setContadorHist((n) => n + 20);
                  setSheetAbierto(false);
                  setToastAbierto(true);
                }}
              >
                Guardar +20 preguntas
              </Button>
            </>
          }
        >
          <p className="text-xs text-text-muted">
            Vista previa del contenedor modal accesible (`role=&quot;dialog&quot;`,
            `aria-modal=&quot;true&quot;`).
          </p>
        </Sheet>

        <Toast
          open={toastAbierto}
          message="Tanda registrada (+20 preguntas en Química)"
          onUndo={() => setContadorHist((n) => Math.max(0, n - 20))}
          onClose={() => setToastAbierto(false)}
        />
      </main>
    </div>
  );
}
