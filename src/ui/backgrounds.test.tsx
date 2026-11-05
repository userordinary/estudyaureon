// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AnimatedBackground,
  BackgroundSelector,
  CATALOGO_FONDOS_ANIMADOS,
  FONDOS_ANIMADOS,
  guardarFondoStorage,
  leerFondoStorage,
  STORAGE_KEY_FONDO_ANIMADO,
} from './backgrounds';
import { UiShowcase } from './UiShowcase';
import { ThemeProvider } from './ThemeProvider';

describe('Feature Fondos Animados e Interactivos (Digital Rain, Rain on Glass, Moonlit Ripple, Galaxy, Ferrofluid, Gradient ASCII, Threads)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('CATALOGO_FONDOS_ANIMADOS contiene los 7 modos incluyendo "ninguno"', () => {
    expect(FONDOS_ANIMADOS).toHaveLength(7);
    expect(CATALOGO_FONDOS_ANIMADOS['digital-rain'].nombre).toBe('Lluvia Digital');
    expect(CATALOGO_FONDOS_ANIMADOS['rain-glass'].nombre).toBe('Lluvia en el Cristal');
    expect(CATALOGO_FONDOS_ANIMADOS['moonlit-ripple'].nombre).toBe('Olas Luz de Luna');
    expect(CATALOGO_FONDOS_ANIMADOS['galaxy'].nombre).toBe('Galaxia Interactiva');
    expect(CATALOGO_FONDOS_ANIMADOS['threads'].nombre).toBe('Hilos Fluidos');
    expect(CATALOGO_FONDOS_ANIMADOS['metal-esmeralda'].nombre).toBe('Metal Esmeralda');
    expect(CATALOGO_FONDOS_ANIMADOS['ninguno'].nombre).toBe('Ninguno (Estático)');
  });

  it('guarda y lee el fondo seleccionado en localStorage', () => {
    expect(leerFondoStorage()).toBe('ninguno');
    guardarFondoStorage('galaxy');
    expect(window.localStorage.getItem(STORAGE_KEY_FONDO_ANIMADO)).toBe('galaxy');
    expect(leerFondoStorage()).toBe('galaxy');
  });

  it('BackgroundSelector renderiza las 8 opciones con sus metadatos y responde al clic', () => {
    const onSelect = vi.fn();
    render(<BackgroundSelector fondoSeleccionado="ninguno" onSeleccionarFondo={onSelect} />);

    for (const id of FONDOS_ANIMADOS) {
      expect(screen.getByTestId(`card-fondo-${id}`)).toBeTruthy();
    }

    fireEvent.click(screen.getByTestId('card-fondo-threads'));
    expect(onSelect).toHaveBeenCalledWith('threads');
    expect(leerFondoStorage()).toBe('threads');
  });

  it('AnimatedBackground no renderiza nada cuando el fondo es "ninguno"', () => {
    const { container } = render(<AnimatedBackground fondo="ninguno" />);
    expect(container.firstChild).toBeNull();
  });

  it('AnimatedBackground renderiza el canvas correspondiente para cada fondo', () => {
    const { rerender } = render(<AnimatedBackground fondo="digital-rain" />);
    expect(screen.getByTestId('animated-bg-digital-rain')).toBeTruthy();

    rerender(<AnimatedBackground fondo="rain-glass" />);
    expect(screen.getByTestId('animated-bg-rain-glass')).toBeTruthy();

    rerender(<AnimatedBackground fondo="moonlit-ripple" />);
    expect(screen.getByTestId('animated-bg-moonlit-ripple')).toBeTruthy();

    rerender(<AnimatedBackground fondo="galaxy" />);
    expect(screen.getByTestId('animated-bg-galaxy')).toBeTruthy();

    rerender(<AnimatedBackground fondo="threads" />);
    expect(screen.getByTestId('animated-bg-threads')).toBeTruthy();

    rerender(<AnimatedBackground fondo="metal-esmeralda" />);
    expect(screen.getByTestId('animated-bg-metal-esmeralda')).toBeTruthy();
  });

  it('en UiShowcase se puede seleccionar el fondo y muestra el área de interacción interactiva', () => {
    const onCambiar = vi.fn();
    render(
      <ThemeProvider>
        <UiShowcase fondoAnimado="galaxy" onCambiarFondoAnimado={onCambiar} />
      </ThemeProvider>,
    );

    // El badge muestra el fondo activo
    expect(screen.getByTestId('badge-fondo-activo').textContent).toContain('Galaxia Interactiva');
    // Muestra la caja de interacción en vivo
    expect(screen.getByTestId('live-preview-box')).toBeTruthy();

    // Seleccionar Hilos fluidos
    fireEvent.click(screen.getByTestId('card-fondo-threads'));
    expect(onCambiar).toHaveBeenCalledWith('threads');
  });
});
