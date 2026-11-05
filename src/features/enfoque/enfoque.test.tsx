// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { calcularMinutosEnfoque, db, repositorios } from '../../data';
import { aplicarTemaEnDom, RingProgress, TEMAS_UI, ThemeProvider } from '../../ui';
import { guardarSesionEnfoquePersistida } from './EnfoqueView';

describe('Feature `enfoque` (Deep Work) — Unidad, Integración y E2E', () => {
  beforeEach(async () => {
    guardarSesionEnfoquePersistida(null);
    await db.borrarDatosEstudio();
  });

  afterEach(() => {
    guardarSesionEnfoquePersistida(null);
    cleanup();
  });

  it('desde "Hoy" un solo toque en [Empezar] inicia el bloque con etiquetas prellenadas y Modo Zen activo', async () => {
    const t0 = 1_710_000_000_000;
    render(<App fechaHoyOverride="2026-03-18" ahoraMsOverride={t0} />);

    // 1 solo toque desde "Hoy"
    const btnEmpezar = await screen.findByTestId('btn-empezar-bloque-principal');
    fireEvent.click(btnEmpezar);

    // Ya estamos en Enfoque con el temporizador corriendo, etiquetas prellenadas y Modo Zen activo
    expect(await screen.findByTestId('enfoque-activo-card')).toBeTruthy();
    expect(screen.getByTestId('enfoque-etiqueta-curso').textContent?.trim().length).toBeGreaterThan(
      0,
    );
    expect(screen.getByTestId('enfoque-etiqueta-tarea').textContent).toContain('Práctica DECO');
    expect(screen.getByTestId('enfoque-view').getAttribute('data-zen')).toBe('true');
    expect(screen.getByTestId('app-header').className).toContain('opacity-25');
  });

  it('recargar la página durante un bloque en curso NO lo pierde y reconstruye el tiempo por marca de tiempo', async () => {
    const t0 = 1_710_000_000_000;
    const { unmount } = render(
      <App fechaHoyOverride="2026-03-18" vistaInicial="enfoque" ahoraMsOverride={t0} />,
    );

    // Iniciar bloque Sprint 25/5 con 1 toque (viene prellenado)
    fireEvent.click(await screen.findByTestId('btn-iniciar-enfoque'));
    expect(screen.getByTestId('reloj-temporizador').textContent).toBe('25:00');

    // Registrar 2 interrupciones internas (palitos)
    fireEvent.click(screen.getByTestId('btn-interrupcion-interna'));
    fireEvent.click(screen.getByTestId('btn-interrupcion-interna'));
    expect(screen.getByTestId('contador-distracciones-sesion').textContent).toBe('2');
    expect(screen.getByTestId('palitos-distracciones-sesion').textContent).toContain('||');

    // Simular recarga completa de la página (desmontar árbol y volver a montar 10 minutos después)
    unmount();

    const tDiezMinDespues = t0 + 10 * 60_000;
    render(<App fechaHoyOverride="2026-03-18" ahoraMsOverride={tDiezMinDespues} />);

    // Al recargar, abre automáticamente la sesión activa en Enfoque con 15:00 restantes y las 2 distracciones intactas
    expect(await screen.findByTestId('enfoque-activo-card')).toBeTruthy();
    expect(screen.getByTestId('reloj-temporizador').textContent).toBe('15:00');
    expect(screen.getByTestId('contador-distracciones-sesion').textContent).toBe('2');
  });

  it('el popup de fatiga NO bloquea el descanso: tras 8 s sin respuesta sigue con descanso base, y con 4 o 5 suma +5 min', async () => {
    const t0 = 1_710_000_000_000;
    const { rerender } = render(
      <App fechaHoyOverride="2026-03-18" vistaInicial="enfoque" ahoraMsOverride={t0} />,
    );

    // Iniciar Sprint 25/5
    fireEvent.click(await screen.findByTestId('btn-iniciar-enfoque'));

    // Avanzar marca de tiempo al final de los 25 min de enfoque
    const tFinEnfoque = t0 + 25 * 60_000;
    rerender(
      <App fechaHoyOverride="2026-03-18" vistaInicial="enfoque" ahoraMsOverride={tFinEnfoque} />,
    );

    // El descanso YA arrancó (no está en blanco ni bloqueado) y aparece el popup de fatiga 1–5
    expect(await screen.findByTestId('popup-fatiga')).toBeTruthy();
    expect(screen.getByTestId('reloj-temporizador').textContent).toBe('05:00');
    expect(screen.getByRole('progressbar').getAttribute('data-phase')).toBe('rest');

    // Si pasan 8 segundos sin responder, el popup se cierra solo y el descanso sigue corriendo en su base de 5 min
    const tTras8Seg = tFinEnfoque + 8_000;
    rerender(
      <App fechaHoyOverride="2026-03-18" vistaInicial="enfoque" ahoraMsOverride={tTras8Seg} />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('popup-fatiga')).toBeNull();
    });
    expect(screen.getByTestId('reloj-temporizador').textContent).toBe('04:52');
  });

  it('responder fatiga 4 o 5 en el popup alarga el descanso +5 min, guarda FocusSession (completa:true) y sugiere registrar tanda DECO', async () => {
    const t0 = 1_710_000_000_000;
    const { rerender } = render(
      <App fechaHoyOverride="2026-03-18" vistaInicial="enfoque" ahoraMsOverride={t0} />,
    );

    fireEvent.click(await screen.findByTestId('btn-iniciar-enfoque'));

    // Concluir el bloque de enfoque
    const tFinEnfoque = t0 + 25 * 60_000;
    rerender(
      <App fechaHoyOverride="2026-03-18" vistaInicial="enfoque" ahoraMsOverride={tFinEnfoque} />,
    );

    // Clic de 1 toque en fatiga 5 -> descanso base 5 min pasa a 10 min (10:00)
    const btnFatiga5 = await screen.findByTestId('btn-fatiga-5');
    fireEvent.click(btnFatiga5);

    expect(screen.queryByTestId('popup-fatiga')).toBeNull();
    expect(screen.getByTestId('reloj-temporizador').textContent).toBe('10:00');

    // Verificar que se guardó una única FocusSession (sin duplicar minutos) con completa: true y fatiga: 5
    await waitFor(async () => {
      const sesiones = await repositorios.focusSessions.listar();
      expect(sesiones).toHaveLength(1);
      expect(sesiones[0]?.completa).toBe(true);
      expect(sesiones[0]?.minutosEnfoque).toBe(25);
      expect(sesiones[0]?.fatiga).toBe(5);
      expect(calcularMinutosEnfoque(sesiones)).toBe(25);
    });

    // Como el tipo de tarea fue Práctica DECO, sugiere registrar la tanda con el curso prellenado
    expect(screen.getByTestId('sugerencia-registrar-tanda-deco')).toBeTruthy();
    fireEvent.click(screen.getByTestId('btn-sugerencia-registrar-tanda'));
    expect(await screen.findByTestId('btn-guardar-tanda')).toBeTruthy();
  });

  it('deshabilita Iniciar solo si falta Curso o Tipo de tarea, y al cancelar guarda FocusSession con completa: false', async () => {
    const t0 = 1_710_000_000_000;
    const { rerender } = render(
      <App fechaHoyOverride="2026-03-18" vistaInicial="enfoque" ahoraMsOverride={t0} />,
    );

    const btnIniciar = (await screen.findByTestId('btn-iniciar-enfoque')) as HTMLButtonElement;
    expect(btnIniciar.disabled).toBe(false);

    // Si se quita el curso, el botón Iniciar se deshabilita
    fireEvent.change(screen.getByTestId('select-curso-enfoque'), { target: { value: '' } });
    expect(btnIniciar.disabled).toBe(true);

    // Volver a seleccionar curso (ej. Física) y cambiar a modo Inmersión 50/10
    fireEvent.change(screen.getByTestId('select-curso-enfoque'), { target: { value: 'fis' } });
    fireEvent.click(screen.getByTestId('modo-enfoque-inmersion'));
    expect((screen.getByTestId('input-minutos-enfoque') as HTMLInputElement).value).toBe('50');
    expect(btnIniciar.disabled).toBe(false);

    // Iniciar y cancelar a los 15 minutos -> guarda FocusSession con completa: false y 15 min
    fireEvent.click(btnIniciar);
    rerender(
      <App
        fechaHoyOverride="2026-03-18"
        vistaInicial="enfoque"
        ahoraMsOverride={t0 + 15 * 60_000}
      />,
    );
    fireEvent.click(screen.getByTestId('btn-cancelar-enfoque'));

    await waitFor(async () => {
      const sesiones = await repositorios.focusSessions.listar();
      expect(sesiones).toHaveLength(1);
      expect(sesiones[0]?.completa).toBe(false);
      expect(sesiones[0]?.minutosEnfoque).toBe(15);
      expect(sesiones[0]?.cursoId).toBe('fis');
    });
  });

  it('el anillo <RingProgress /> cambia de color por fase (focus vs rest) en los 4 temas y usa gradiente animado al >= 85 % en gamificado', () => {
    for (const tema of TEMAS_UI) {
      aplicarTemaEnDom(tema);

      // 1) Fase focus al 50 %
      const { unmount: u1 } = render(
        <ThemeProvider temaInicial={tema}>
          <RingProgress value={50} max={100} phase="focus" />
        </ThemeProvider>,
      );
      const indFocus = screen.getByTestId('ring-progress-indicator');
      expect(indFocus.getAttribute('data-phase')).toBe('focus');
      expect(indFocus.getAttribute('data-stroke-color')).toBe('var(--focus)');
      expect(screen.getByRole('progressbar').getAttribute('data-rgb-active')).toBe('false');
      u1();

      // 2) Fase rest al 50 %
      const { unmount: u2 } = render(
        <ThemeProvider temaInicial={tema}>
          <RingProgress value={50} max={100} phase="rest" />
        </ThemeProvider>,
      );
      const indRest = screen.getByTestId('ring-progress-indicator');
      expect(indRest.getAttribute('data-phase')).toBe('rest');
      expect(indRest.getAttribute('data-stroke-color')).toBe('var(--rest)');
      u2();

      // 3) Fase focus al 90 % (>= 85 %) -> solo en 'gamificado' activa el gradiente RGB animado
      const { unmount: u3 } = render(
        <ThemeProvider temaInicial={tema}>
          <RingProgress value={90} max={100} phase="focus" />
        </ThemeProvider>,
      );
      const ring90 = screen.getByRole('progressbar');
      const ind90 = screen.getByTestId('ring-progress-indicator');
      if (tema === 'gamificado') {
        expect(ring90.getAttribute('data-rgb-active')).toBe('true');
        expect(ind90.getAttribute('stroke')).toContain('url(#ring-rgb-');
      } else {
        expect(ring90.getAttribute('data-rgb-active')).toBe('false');
        expect(ind90.getAttribute('stroke')).toBe('var(--focus)');
      }
      if (tema === 'oled') {
        expect(ind90.style.transition).toBe('none');
      }
      u3();
    }
  });

  it('el panel de enfoque no muestra el botón de probar campana (reservado para UI showcase)', async () => {
    render(<App fechaHoyOverride="2026-03-18" vistaInicial="enfoque" />);
    expect(screen.queryByTestId('btn-probar-campana')).toBeNull();
    expect(screen.queryByTestId('btn-probar-campana-activo')).toBeNull();
  });
});
