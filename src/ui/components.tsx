/**
 * Componentes base de AUREON:
 * - <Button /> (objetivo táctil >= 44 px, teclado accesible, solo tokens de tema)
 * - <Chip /> (etiquetas densas por tono semántico)
 * - <KpiCard /> (tarjeta de métrica de precisión)
 * - <Sheet /> (hoja inferior en móvil / modal centrado en PC, cierre con Escape)
 * - <Toast /> (notificación sobria con botón "Deshacer" y temporizador de 6 s)
 * - <RingProgress /> (anillo SVG para Pomodoro, acepta color de fase focus/rest)
 */
import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { UMBRAL_DESTACADO_PROGRESO } from './ProgressBar';
import { useTheme } from './ThemeProvider';

// ---------------------------------------------------------------------------
// 1. <Button />
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const CLASES_VARIANTE_BOTON: Readonly<Record<ButtonVariant, string>> = {
  primary: 'border-accent bg-accent text-bg hover:opacity-90',
  secondary: 'border-border bg-surface-2 text-text hover:border-accent',
  ghost: 'border-transparent bg-transparent text-text-muted hover:bg-surface-2 hover:text-text',
  danger: 'border-danger bg-danger text-bg hover:opacity-90',
};

const CLASES_TAMANO_BOTON: Readonly<Record<ButtonSize, string>> = {
  md: 'min-h-11 min-w-11 px-4 py-2.5 text-sm',
  sm: 'min-h-11 min-w-11 px-3 py-2 text-xs',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${CLASES_VARIANTE_BOTON[variant]} ${CLASES_TAMANO_BOTON[size]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 2. <Chip />
// ---------------------------------------------------------------------------

export type ChipTone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}

const CLASES_TONO_CHIP: Readonly<Record<ChipTone, string>> = {
  neutral: 'border-border bg-surface-2 text-text-muted',
  accent: 'border-accent bg-surface-2 text-accent',
  success: 'border-success bg-surface-2 text-success',
  warn: 'border-warn bg-surface-2 text-warn',
  danger: 'border-danger bg-surface-2 text-danger',
};

export function Chip({ tone = 'neutral', children, className = '', ...rest }: ChipProps) {
  return (
    <span
      {...rest}
      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums ${CLASES_TONO_CHIP[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 3. <KpiCard />
// ---------------------------------------------------------------------------

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  highlight?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  value,
  subtitle,
  badge,
  highlight = false,
  className = '',
}: KpiCardProps) {
  return (
    <article
      className={`flex flex-col justify-between rounded-xl border p-4 ${
        highlight ? 'border-accent bg-surface-2' : 'border-border bg-surface'
      } ${className}`.trim()}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
        {badge}
      </header>
      <div className="my-2 font-mono text-2xl font-bold tabular-nums text-text">{value}</div>
      {subtitle && <footer className="text-xs text-text-muted">{subtitle}</footer>}
    </article>
  );
}

// ---------------------------------------------------------------------------
// 4. <Sheet /> (hoja inferior en móvil / modal centrado en PC)
// ---------------------------------------------------------------------------

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Sheet({ open, onClose, title, description, children, footer }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', alPresionarTecla);
    return () => window.removeEventListener('keydown', alPresionarTecla);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aureon-sheet-title"
    >
      <div className="w-full max-w-lg rounded-t-2xl border border-border bg-surface p-5 shadow-xl sm:rounded-2xl">
        <header className="mb-4 flex items-start justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 id="aureon-sheet-title" className="text-base font-bold text-text">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar ventana">
            ✕
          </Button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto text-sm text-text">{children}</div>
        {footer && (
          <footer className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. <Toast /> con Deshacer (6 s por defecto)
// ---------------------------------------------------------------------------

export const DURACION_TOAST_DESHACER_MS = 6000;

export interface ToastProps {
  open: boolean;
  message: string;
  onUndo?: () => void;
  onClose: () => void;
  durationMs?: number;
}

export function Toast({
  open,
  message,
  onUndo,
  onClose,
  durationMs = DURACION_TOAST_DESHACER_MS,
}: ToastProps) {
  useEffect(() => {
    if (!open || durationMs <= 0) return;
    const timer = window.setTimeout(() => {
      onClose();
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [open, durationMs, onClose]);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-text shadow-lg"
    >
      <span className="font-medium">{message}</span>
      <div className="flex items-center gap-1.5">
        {onUndo && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onUndo();
              onClose();
            }}
          >
            Deshacer
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar aviso">
          ✕
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. <RingProgress /> SVG (anillo del temporizador Pomodoro)
// ---------------------------------------------------------------------------

export type FaseAnillo = 'focus' | 'rest' | 'accent';

export interface RingProgressProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  phase?: FaseAnillo;
  label?: string;
  centerContent?: ReactNode;
}

const COLOR_TRAZO_FASE: Readonly<Record<FaseAnillo, string>> = {
  focus: 'var(--focus)',
  rest: 'var(--rest)',
  accent: 'var(--accent)',
};

export function RingProgress({
  value,
  max,
  size = 136,
  strokeWidth = 10,
  phase = 'focus',
  label = 'Progreso del temporizador',
  centerContent,
}: RingProgressProps) {
  const { tema, prefersReducedMotion } = useTheme();
  const rawId = useId();
  const gradId = `ring-rgb-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const radio = (size - strokeWidth) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const dashOffset = circunferencia * (1 - ratio);
  const sinTransicion = prefersReducedMotion || tema === 'oled';
  const usarGradienteGamificado = tema === 'gamificado' && ratio >= UMBRAL_DESTACADO_PROGRESO;
  const strokeActual = usarGradienteGamificado ? `url(#${gradId})` : COLOR_TRAZO_FASE[phase];

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      data-phase={phase}
      data-theme-ring={tema}
      data-rgb-active={usarGradienteGamificado ? 'true' : 'false'}
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90 transform">
        {usarGradienteGamificado && (
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="50%" stopColor="var(--accent-2)" />
              <stop offset="100%" stopColor="var(--success)" />
              {!sinTransicion && (
                <animateTransform
                  attributeName="gradientTransform"
                  type="rotate"
                  from="0 0.5 0.5"
                  to="360 0.5 0.5"
                  dur="3s"
                  repeatCount="indefinite"
                />
              )}
            </linearGradient>
          </defs>
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radio}
          fill="transparent"
          stroke="var(--surface-2)"
          strokeWidth={strokeWidth}
        />
        <circle
          data-testid="ring-progress-indicator"
          data-phase={phase}
          data-stroke-color={COLOR_TRAZO_FASE[phase]}
          cx={size / 2}
          cy={size / 2}
          r={radio}
          fill="transparent"
          stroke={strokeActual}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={dashOffset}
          style={{
            transition: sinTransicion ? 'none' : 'stroke-dashoffset 300ms ease, stroke 350ms ease',
          }}
        />
      </svg>
      {centerContent && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center font-mono tabular-nums text-text">
          {centerContent}
        </div>
      )}
    </div>
  );
}
