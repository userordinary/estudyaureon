import type { FondoAnimadoId } from './types';
import { DigitalRainCanvas } from './DigitalRainCanvas';
import { RainOnGlassCanvas } from './RainOnGlassCanvas';
import { MoonlitRippleCanvas } from './MoonlitRippleCanvas';
import { GalaxyCanvas } from './GalaxyCanvas';
import { ThreadsCanvas } from './ThreadsCanvas';
import { MoltenMetalCanvas } from './MoltenMetalCanvas';

export interface AnimatedBackgroundProps {
  fondo: FondoAnimadoId;
  /** Opacidad general (0 a 1). Por defecto 1 para máxima claridad y viveza */
  opacity?: number;
}

export function AnimatedBackground({ fondo, opacity = 1 }: AnimatedBackgroundProps) {
  if (fondo === 'ninguno') {
    return null;
  }

  return (
    <aside
      aria-label="Fondo visual animado"
      data-testid={`animated-bg-${fondo}`}
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden transition-opacity duration-700 ease-in-out"
      style={{ opacity }}
    >
      {fondo === 'digital-rain' && <DigitalRainCanvas />}
      {fondo === 'rain-glass' && <RainOnGlassCanvas />}
      {fondo === 'moonlit-ripple' && <MoonlitRippleCanvas />}
      {fondo === 'galaxy' && <GalaxyCanvas />}
      {fondo === 'threads' && <ThreadsCanvas />}
      {fondo === 'metal-esmeralda' && <MoltenMetalCanvas />}
    </aside>
  );
}
