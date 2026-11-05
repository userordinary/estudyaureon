/**
 * Contador dorado del total histórico de preguntas (<GoldCounter value />).
 * - Formato es-PE con separador de miles, bold, tabular-nums.
 * - Gradiente metálico vertical (tokens gold-1..4) con background-clip:text y ligero resplandor.
 * - Destello (sweep de brillo) de ~1.2 s SOLO al montar y cuando el valor aumenta.
 * - Cuenta animada de ~400 ms cuando el valor sube.
 * - En el tema "oled" o con `prefers-reduced-motion`: sin destello ni cuenta animada.
 * - `aria-label="Total histórico: N preguntas"`.
 */
import { useEffect, useRef, useState } from 'react';
import { PERFILES_TEMA, type TemaUI } from './theme';
import { useTheme } from './ThemeProvider';

const FORMATEADOR_ES_PE = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 0,
});

export function formatearContadorDorado(valor: number): string {
  const entero = Number.isFinite(valor) ? Math.max(0, Math.round(valor)) : 0;
  return FORMATEADOR_ES_PE.format(entero);
}

export function etiquetaAriaContadorDorado(valor: number): string {
  return `Total histórico: ${formatearContadorDorado(valor)} preguntas`;
}

export function permiteDestelloDorado(tema: TemaUI, prefersReducedMotion: boolean): boolean {
  if (prefersReducedMotion) return false;
  return PERFILES_TEMA[tema].permiteAnimaciones;
}

export interface GoldCounterProps {
  value: number;
  temaForzado?: TemaUI;
  prefersReducedMotionForzado?: boolean;
  className?: string;
}

export function GoldCounter({
  value,
  temaForzado,
  prefersReducedMotionForzado,
  className = '',
}: GoldCounterProps) {
  const ctx = useTheme();
  const temaActivo = temaForzado ?? ctx.tema;
  const reducedMotion = prefersReducedMotionForzado ?? ctx.prefersReducedMotion;
  const animarPermitido = permiteDestelloDorado(temaActivo, reducedMotion);

  const valorObjetivo = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const prevValorRef = useRef<number>(valorObjetivo);

  // Solo guarda el valor intermedio mientras dura la interpolación (~400 ms); fuera de ella es null y se lee directo de `valorObjetivo`
  const [valorInterpolado, setValorInterpolado] = useState<number | null>(null);
  const [destellando, setDestellando] = useState<boolean>(() => animarPermitido);

  // Destello inicial al montar (~1.2 s)
  useEffect(() => {
    if (!animarPermitido) return;
    const timer = window.setTimeout(() => {
      setDestellando(false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [animarPermitido]);

  // Transición cuando `valorObjetivo` aumenta (sin mutar estado durante el render)
  useEffect(() => {
    const anterior = prevValorRef.current;
    prevValorRef.current = valorObjetivo;

    if (valorObjetivo === anterior) return;

    if (!animarPermitido || valorObjetivo < anterior) {
      setValorInterpolado(null);
      return;
    }

    setDestellando(true);
    setValorInterpolado(anterior);

    const timerBrillo = window.setTimeout(() => {
      setDestellando(false);
    }, 1200);

    const duracionMs = 400;
    const pasos = 16;
    const intervaloMs = duracionMs / pasos;
    let pasoActual = 0;

    const intervalo = window.setInterval(() => {
      pasoActual += 1;
      if (pasoActual >= pasos) {
        setValorInterpolado(null);
        window.clearInterval(intervalo);
      } else {
        const progreso = pasoActual / pasos;
        const intermedio = Math.round(anterior + (valorObjetivo - anterior) * progreso);
        setValorInterpolado(intermedio);
      }
    }, intervaloMs);

    return () => {
      window.clearTimeout(timerBrillo);
      window.clearInterval(intervalo);
    };
  }, [valorObjetivo, animarPermitido]);

  const mostrado = animarPermitido && valorInterpolado !== null ? valorInterpolado : valorObjetivo;
  const activoBrillo = destellando && animarPermitido;
  const claseBrillo = activoBrillo ? 'aureon-gold-sweep animate-gold-sweep' : 'aureon-gold-text';

  return (
    <span
      aria-label={etiquetaAriaContadorDorado(valorObjetivo)}
      data-testid="gold-counter"
      data-shining={activoBrillo ? 'true' : 'false'}
      data-theme-variant={temaActivo}
      className={`inline-flex items-baseline gap-1 font-mono text-sm font-bold tabular-nums ${className}`.trim()}
    >
      <span className={claseBrillo}>{formatearContadorDorado(mostrado)}</span>
    </span>
  );
}
