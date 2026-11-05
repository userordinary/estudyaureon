// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AureonDB, db, SETTINGS_POR_DEFECTO } from '../data';
import {
  aplicarTemaEnDom,
  auditarContrasteTema,
  Button,
  Chip,
  CLAVE_STORAGE_TEMA,
  etiquetaAriaContadorDorado,
  evaluarBarraProgreso,
  formatearContadorDorado,
  GoldCounter,
  guardarTemaEnStorage,
  KpiCard,
  leerTemaDeDom,
  leerTemaDeStorage,
  permiteDestelloDorado,
  RingProgress,
  Sheet,
  TEMA_UI_POR_DEFECTO,
  TEMAS_UI,
  ThemeProvider,
  ThemeQuickSwitch,
  Toast,
  UiShowcase,
} from './index';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('1. Contraste WCAG AA (>= 4.5:1) y aplicación del tema (data-theme)', () => {
  it.each(TEMAS_UI)(
    'el tema "%s" cumple contraste WCAG AA (>= 4.5:1) en todos los pares críticos',
    (tema) => {
      const r = auditarContrasteTema(tema);
      expect(r.cumpleAA).toBe(true);
      expect(r.textSobreBg).toBeGreaterThanOrEqual(4.5);
      expect(r.textSobreSurface).toBeGreaterThanOrEqual(4.5);
      expect(r.textMutedSobreBg).toBeGreaterThanOrEqual(4.5);
      expect(r.textMutedSobreSurface).toBeGreaterThanOrEqual(4.5);
      expect(r.accentSobreSurface).toBeGreaterThanOrEqual(4.5);
      expect(r.goldSobreSurface).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('el tema por defecto es "dark-modern" y aplicarTemaEnDom actualiza <html data-theme> sin recargar', () => {
    expect(TEMA_UI_POR_DEFECTO).toBe('dark-modern');
    aplicarTemaEnDom('dark-modern');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark-modern');
    expect(leerTemaDeDom()).toBe('dark-modern');

    for (const t of TEMAS_UI) {
      aplicarTemaEnDom(t);
      expect(document.documentElement.getAttribute('data-theme')).toBe(t);
      expect(leerTemaDeDom()).toBe(t);
    }
  });

  it('ThemeProvider alterna los 4 temas en vivo y persiste la elección en Settings (Dexie)', async () => {
    const testDb = new AureonDB(`test-theme-${Date.now()}-${Math.random()}`);
    render(
      <ThemeProvider database={testDb}>
        <ThemeQuickSwitch />
      </ThemeProvider>,
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark-modern');

    fireEvent.click(screen.getByRole('button', { name: 'OLED Puro' }));
    await waitFor(async () => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('oled');
      const s = await testDb.settings.get('default');
      expect(s?.tema).toBe('oled');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clínico' }));
    await waitFor(async () => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('clinico');
      expect(localStorage.getItem(CLAVE_STORAGE_TEMA)).toBe('clinico');
      expect(leerTemaDeStorage()).toBe('clinico');
      const s = await testDb.settings.get('default');
      expect(s?.tema).toBe('clinico');
    });

    await testDb.delete();
  });

  it('el header general de App NO muestra el selector de temas, y el tema persiste en localStorage y al navegar o recargar', async () => {
    localStorage.clear();
    await db.settings.put({ ...SETTINGS_POR_DEFECTO, id: 'default', tema: 'gamificado' });
    guardarTemaEnStorage('gamificado');

    render(<App vistaInicial="hoy" />);

    // 1. El tema se inicializa inmediatamente desde localStorage sin parpadeo al default
    expect(document.documentElement.getAttribute('data-theme')).toBe('gamificado');

    // 2. En el header general NO aparece el selector de temas (aria-label="Atajo de tema")
    const header = screen.getByTestId('app-header');
    expect(header.querySelector('[aria-label="Atajo de tema"]')).toBeNull();

    // 3. Navegar a Enfoque, Cursos o Errores mantiene el tema Gamificado
    fireEvent.click(screen.getByTestId('nav-enfoque'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('gamificado');

    fireEvent.click(screen.getByTestId('nav-cursos'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('gamificado');

    fireEvent.click(screen.getByTestId('nav-errores'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('gamificado');

    // 4. En la pestaña UI sí está disponible para gestión de temas
    fireEvent.click(screen.getByTestId('nav-ui'));
    expect(screen.getByRole('group', { name: 'Atajo de tema' })).toBeTruthy();
  });

  it('permite seleccionar temas oficiales y regular la transparencia de tarjetas del 0 al 100% en la pestaña UI', async () => {
    render(<App fechaHoyOverride="2026-04-15" vistaInicial="ui" />);

    const cardGamificado = await screen.findByTestId('card-tema-gamificado');
    expect(cardGamificado).toBeTruthy();

    fireEvent.click(cardGamificado);
    expect(document.documentElement.getAttribute('data-theme')).toBe('gamificado');

    // Muestra panel de transparencia rescatado
    expect(await screen.findByTestId('panel-transparencia-tarjetas')).toBeTruthy();
    const slider = screen.getByTestId('slider-transparencia');
    expect(slider).toBeTruthy();

    // Regular transparencia al 60%
    fireEvent.change(slider, { target: { value: '60' } });
    expect(document.documentElement.getAttribute('data-glass')).toBe('true');
    expect(screen.getByTestId('badge-transparencia-valor').textContent).toContain('60 %');

    // Cambiar a tipografía Hacker Mono
    fireEvent.click(screen.getByTestId('btn-fuente-mono'));
    expect(document.documentElement.style.fontFamily).toContain('JetBrains Mono');
  });

  it('permite cambiar la tipografía globalmente con cualquier tema activo (incluyendo fuentes nuevas)', async () => {
    render(<App fechaHoyOverride="2026-04-15" vistaInicial="ui" />);

    // El tema activo inicial es dark-modern
    const cardDark = await screen.findByTestId('card-tema-dark-modern');
    fireEvent.click(cardDark);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark-modern');

    // Selector de fuentes con nuevas tipografías
    const btnQuicksand = screen.getByTestId('btn-fuente-quicksand');
    expect(btnQuicksand).toBeTruthy();
    fireEvent.click(btnQuicksand);
    expect(document.documentElement.style.fontFamily).toContain('Quicksand');

    const btnArvo = screen.getByTestId('btn-fuente-arvo');
    fireEvent.click(btnArvo);
    expect(document.documentElement.style.fontFamily).toContain('Arvo');

    // Cambiar a tema OLED y verificar que la tipografía se mantiene
    const cardOled = screen.getByTestId('card-tema-oled');
    fireEvent.click(cardOled);
    expect(document.documentElement.getAttribute('data-theme')).toBe('oled');
    expect(document.documentElement.style.fontFamily).toContain('Arvo');
  });
});

describe('2. <ProgressBar /> y función pura de umbral 85 % (casos 84 %, 85 %, 100 %, 120 %)', () => {
  it('al 84 % (< 0.85) devuelve color sólido en todos los temas y sin animación', () => {
    for (const tema of TEMAS_UI) {
      const est = evaluarBarraProgreso(84, 100, tema, false);
      expect(est.porcentaje).toBe(84);
      expect(est.superaUmbral85).toBe(false);
      expect(est.modoVisual).toBe('solido');
      expect(est.animada).toBe(false);
      expect(est.claseRelleno).toBe('bg-accent');
    }
  });

  it.each([
    [85, 100, 85, 85],
    [100, 100, 100, 100],
    [120, 100, 120, 100],
  ])(
    'a %d/%d (%d %%) activa el gradiente RGB animado SOLO en "gamificado" y resalte estático en los otros 3 temas',
    (val, max, pctEsperado, anchoEsperado) => {
      const gam = evaluarBarraProgreso(val, max, 'gamificado', false);
      expect(gam.porcentaje).toBe(pctEsperado);
      expect(gam.anchoPorcentaje).toBe(anchoEsperado);
      expect(gam.superaUmbral85).toBe(true);
      expect(gam.modoVisual).toBe('rgb-animado');
      expect(gam.animada).toBe(true);
      expect(gam.claseRelleno).toContain('animate-gradient-x');

      for (const otroTema of ['dark-modern', 'oled', 'clinico'] as const) {
        const est = evaluarBarraProgreso(val, max, otroTema, false);
        expect(est.superaUmbral85).toBe(true);
        expect(est.modoVisual).toBe('resalte-estatico');
        expect(est.animada).toBe(false);
        expect(est.claseRelleno).not.toContain('animate-gradient-x');
      }
    },
  );

  it('con prefers-reduced-motion desactiva la animación incluso en el tema "gamificado"', () => {
    const est = evaluarBarraProgreso(90, 100, 'gamificado', true);
    expect(est.superaUmbral85).toBe(true);
    expect(est.animada).toBe(false);
    expect(est.modoVisual).toBe('resalte-estatico');
    expect(est.claseRelleno).not.toContain('animate-gradient-x');
  });
});

describe('3. <GoldCounter />: formateo es-PE, aria-label y reglas de destello', () => {
  it('formatea con separador de miles es-PE y construye el aria-label exacto', () => {
    expect(formatearContadorDorado(0)).toBe('0');
    expect(formatearContadorDorado(85)).toBe('85');
    const f1428 = formatearContadorDorado(1428);
    expect(f1428).toMatch(/^1[.,\s\u00a0]?428$/);
    expect(etiquetaAriaContadorDorado(1428)).toBe(`Total histórico: ${f1428} preguntas`);
  });

  it('desactiva el destello en el tema "oled" y cuando prefers-reduced-motion está activo', () => {
    expect(permiteDestelloDorado('dark-modern', false)).toBe(true);
    expect(permiteDestelloDorado('gamificado', false)).toBe(true);
    expect(permiteDestelloDorado('clinico', false)).toBe(true);
    expect(permiteDestelloDorado('oled', false)).toBe(false);
    expect(permiteDestelloDorado('gamificado', true)).toBe(false);
  });

  it('renderiza con aria-label="Total histórico: N preguntas", destella al montar (~1.2 s) y anima al subir', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ThemeProvider temaInicial="dark-modern">
        <GoldCounter value={100} prefersReducedMotionForzado={false} />
      </ThemeProvider>,
    );

    const el = screen.getByTestId('gold-counter');
    expect(el.getAttribute('aria-label')).toBe('Total histórico: 100 preguntas');
    expect(el.getAttribute('data-shining')).toBe('true');

    // Al pasar 1.2 s se apaga el destello inicial
    act(() => {
      vi.advanceTimersByTime(1250);
    });
    expect(screen.getByTestId('gold-counter').getAttribute('data-shining')).toBe('false');

    // Al subir el valor a 150 vuelve a destellar y completa la cuenta en ~400 ms
    rerender(
      <ThemeProvider temaInicial="dark-modern">
        <GoldCounter value={150} prefersReducedMotionForzado={false} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('gold-counter').getAttribute('data-shining')).toBe('true');
    expect(screen.getByTestId('gold-counter').getAttribute('aria-label')).toBe(
      'Total histórico: 150 preguntas',
    );

    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByTestId('gold-counter').textContent).toBe('150');
  });
});

describe('4. Componentes base (<KpiCard />, <Chip />, <Button />, <Sheet />, <Toast />, <RingProgress />) y página /ui', () => {
  it('renderiza Sheet y cierra con Escape; Toast ejecuta Deshacer', () => {
    let cerradoSheet = false;
    let deshecho = false;
    let cerradoToast = false;

    render(
      <ThemeProvider>
        <KpiCard label="Puntaje" value="1626.342" badge={<Chip tone="success">OK</Chip>} />
        <RingProgress value={20} max={25} phase="focus" />
        <Sheet
          open
          onClose={() => {
            cerradoSheet = true;
          }}
          title="Título Sheet"
        >
          Contenido modal
        </Sheet>
        <Toast
          open
          message="Acción guardada"
          onUndo={() => {
            deshecho = true;
          }}
          onClose={() => {
            cerradoToast = true;
          }}
          durationMs={0}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(cerradoSheet).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(deshecho).toBe(true);
    expect(cerradoToast).toBe(true);
  });

  it('la página /ui muestra los 4 temas con ProgressBar a 70 % y 90 % y el GoldCounter en cada tema', async () => {
    const testDb = new AureonDB(`test-showcase-${Date.now()}-${Math.random()}`);
    render(
      <ThemeProvider database={testDb}>
        <UiShowcase />
      </ThemeProvider>,
    );

    for (const idTema of TEMAS_UI) {
      const card = screen.getByTestId(`showcase-theme-card-${idTema}`);
      expect(card).toBeTruthy();
      expect(
        screen.getByRole('progressbar', { name: `Meta semanal (${idTema} · 70 %)` }),
      ).toBeTruthy();
      expect(
        screen.getByRole('progressbar', { name: `Meta semanal (${idTema} · 90 % >= 85 %)` }),
      ).toBeTruthy();
    }

    const goldCounters = screen.getAllByTestId('gold-counter');
    expect(goldCounters.length).toBeGreaterThanOrEqual(5);

    await testDb.delete();
  });

  it('Button mantiene objetivo táctil mínimo (>= 44 px via min-h-11 min-w-11)', () => {
    render(<Button>Registrar</Button>);
    const btn = screen.getByRole('button', { name: 'Registrar' });
    expect(btn.className).toContain('min-h-11');
    expect(btn.className).toContain('min-w-11');
  });
});
