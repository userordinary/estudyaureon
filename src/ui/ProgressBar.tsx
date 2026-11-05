/**
 * Barra de progreso de precisión de AUREON.
 * - Si value/max < 0.85 -> color sólido del acento del tema (`bg-accent`).
 * - Si value/max >= 0.85:
 *    * En "gamificado" (y sin prefers-reduced-motion): gradiente multicolor animado (`animate-gradient-x`).
 *    * En los otros temas (o con prefers-reduced-motion): resalte estático sin animar.
 */
import type { TemaUI } from './theme';
import { useTheme } from './ThemeProvider';

export const UMBRAL_DESTACADO_PROGRESO = 0.85;

export type ModoVisualBarra = 'solido' | 'resalte-estatico' | 'rgb-animado';

export interface EstadoBarraProgreso {
  /** Ratio real value / max (puede superar 1 si value > max, ej. 1.2 para 120 %). */
  ratio: number;
  /** Porcentaje entero redondeado (ej. 84, 85, 100, 120). */
  porcentaje: number;
  /** Ancho visual de la barra acotado entre 0 y 100 %. */
  anchoPorcentaje: number;
  /** true cuando ratio >= 0.85. */
  superaUmbral85: boolean;
  /** Modo visual resultante según tema y prefers-reduced-motion. */
  modoVisual: ModoVisualBarra;
  /** true únicamente en tema "gamificado", ratio >= 0.85 y sin prefers-reduced-motion. */
  animada: boolean;
  /** Clase de relleno Tailwind/CSS derivada. */
  claseRelleno: string;
}

/**
 * Función pura de evaluación de `<ProgressBar />` (testeada con 84 %, 85 %, 100 %, 120 %).
 */
export function evaluarBarraProgreso(
  value: number,
  max: number,
  tema: TemaUI = 'dark-modern',
  prefersReducedMotion = false,
): EstadoBarraProgreso {
  const valorSeguro = Number.isFinite(value) ? Math.max(0, value) : 0;
  const maxSeguro = Number.isFinite(max) && max > 0 ? max : 1;
  const ratio = valorSeguro / maxSeguro;
  const porcentaje = Math.round(ratio * 100);
  const anchoPorcentaje = Math.max(0, Math.min(100, Math.round(ratio * 10000) / 100));
  const superaUmbral85 = ratio >= UMBRAL_DESTACADO_PROGRESO - 1e-9;

  if (!superaUmbral85) {
    return {
      ratio,
      porcentaje,
      anchoPorcentaje,
      superaUmbral85: false,
      modoVisual: 'solido',
      animada: false,
      claseRelleno: 'bg-accent',
    };
  }

  if (tema === 'gamificado') {
    const animada = !prefersReducedMotion;
    return {
      ratio,
      porcentaje,
      anchoPorcentaje,
      superaUmbral85: true,
      modoVisual: animada ? 'rgb-animado' : 'resalte-estatico',
      animada,
      claseRelleno: animada ? 'aureon-progress-rgb animate-gradient-x' : 'aureon-progress-rgb',
    };
  }

  return {
    ratio,
    porcentaje,
    anchoPorcentaje,
    superaUmbral85: true,
    modoVisual: 'resalte-estatico',
    animada: false,
    claseRelleno: 'bg-success',
  };
}

export interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  mostrarPorcentaje?: boolean;
  /** Permite forzar el tema en una vista comparativa multi-tema (ej. /ui). */
  temaForzado?: TemaUI;
  prefersReducedMotionForzado?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  max,
  label,
  mostrarPorcentaje = false,
  temaForzado,
  prefersReducedMotionForzado,
  className = '',
}: ProgressBarProps) {
  const ctx = useTheme();
  const temaActivo = temaForzado ?? ctx.tema;
  const reducedMotion = prefersReducedMotionForzado ?? ctx.prefersReducedMotion;
  const estado = evaluarBarraProgreso(value, max, temaActivo, reducedMotion);

  return (
    <div className={`w-full ${className}`.trim()}>
      {(label || mostrarPorcentaje) && (
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
          {label && <span className="font-medium text-text">{label}</span>}
          {mostrarPorcentaje && (
            <span className="font-mono font-semibold tabular-nums text-text-muted">
              {estado.porcentaje}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label ?? 'Progreso'}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        data-mode={estado.modoVisual}
        data-over-85={estado.superaUmbral85 ? 'true' : 'false'}
        className="h-2.5 w-full overflow-hidden rounded-full border border-border bg-surface-2"
      >
        <div
          data-testid="progress-bar-fill"
          className={`h-full rounded-full ${estado.claseRelleno}`}
          style={{ width: `${estado.anchoPorcentaje}%` }}
        />
      </div>
    </div>
  );
}
