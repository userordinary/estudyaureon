// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { db, repositorios } from '../../data';
import { aplicarTemaEnDom, type TemaUI } from '../../ui';

describe('Feature Comando — Zona única de analítica (PROMPT 8)', () => {
  beforeEach(async () => {
    await db.borrarDatosEstudio();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('mantiene "Hoy" como pantalla inicial y navega a "Comando" en layout de 1280×800 sin scroll ni paneles prohibidos', async () => {
    window.innerWidth = 1280;
    window.innerHeight = 800;

    render(<App fechaHoyOverride="2026-04-15" />);

    // "Hoy" sigue siendo la pantalla inicial
    const navHoy = await screen.findByTestId('nav-hoy');
    expect(navHoy.getAttribute('aria-current')).toBe('page');

    // Al pulsar la pestaña "Comando", muestra las 5 zonas en una sola pantalla sin scroll (CSS grid viewport)
    fireEvent.click(screen.getByTestId('nav-comando'));

    const comandoView = await screen.findByTestId('comando-view');
    expect(comandoView.className).toContain('xl:h-[calc(100vh-4.75rem)]');
    expect(comandoView.className).toContain('xl:overflow-hidden');
    expect(comandoView.className).toContain('xl:grid-cols-12');

    // Las 5 secciones obligatorias están presentes
    expect(screen.getByTestId('comando-kpi-strip')).toBeTruthy();
    expect(screen.getByTestId('panel-curva-acumulacion')).toBeTruthy();
    expect(screen.getByTestId('panel-radar-dominio')).toBeTruthy();
    expect(screen.getByTestId('panel-autopsia-errores')).toBeTruthy();
    expect(screen.getByTestId('panel-accion-inmediata')).toBeTruthy();

    // Sin datos suficientes, el Radar indica "Faltan datos" en vez de dibujar un radar vacío
    expect(screen.getByTestId('radar-sin-datos').textContent).toMatch(/Faltan datos/i);

    // PROHIBIDO agregar otros paneles de analítica
    expect(screen.queryByText(/diagnóstico inteligente/i)).toBeNull();
    expect(screen.queryByText(/ranking de cursos/i)).toBeNull();
    expect(screen.queryByText(/pendiente de tendencia/i)).toBeNull();
    expect(screen.queryByText(/proyección con banda/i)).toBeNull();
  });

  it('muestra los 3 gráficos Recharts, baja al detalle por curso en el Radar, rotula Corte estimado y funciona en los 4 temas', async () => {
    // Configurar carrera con corte estimado (Obstetricia) para verificar rótulo "Corte estimado"
    await repositorios.settings.actualizar({
      carreraId: 'obstetricia',
      umbralSeguridad: 70,
    });

    // Registrar prácticas en los últimos 30 días (>= 20 preguntas para habilitar el Radar en modo 30d)
    await repositorios.practices.registrar({
      id: 'prac-hv-1',
      fecha: '2026-04-10',
      cursoId: 'hv',
      temaId: null,
      ok: 18,
      bad: 2,
      origen: 'tanda',
      ts: 1712700000000,
    });
    await repositorios.practices.registrar({
      id: 'prac-bio-1',
      fecha: '2026-04-12',
      cursoId: 'bio',
      temaId: null,
      ok: 4,
      bad: 12,
      origen: 'tanda',
      ts: 1712800000000,
    });

    // Registrar errores clasificados y 1 error por clasificar
    await repositorios.mistakes.guardar({
      id: 'err-bio-1',
      origen: 'tanda',
      simulacroId: null,
      cursoId: 'bio',
      temaId: null,
      categoria: 'lectura',
      nota: 'Pregunta de citología con distractor NO',
      fotoId: null,
      creadoEn: new Date('2026-04-14T10:00:00Z').getTime(),
      fecha: '2026-04-14',
      estado: 'abierto',
      caja: 1,
      proximoRepaso: '2026-04-16',
      historial: [],
    });
    await repositorios.mistakes.guardar({
      id: 'err-hv-1',
      origen: 'tanda',
      simulacroId: null,
      cursoId: 'hv',
      temaId: null,
      categoria: null,
      nota: 'Pregunta sin clasificar aún',
      fotoId: null,
      creadoEn: new Date('2026-04-14T12:00:00Z').getTime(),
      fecha: '2026-04-14',
      estado: 'abierto',
      caja: 1,
      proximoRepaso: '2026-04-16',
      historial: [],
    });

    render(<App fechaHoyOverride="2026-04-15" vistaInicial="comando" />);

    // Verificar badge de "Corte estimado" en Obstetricia
    await waitFor(() => {
      expect(screen.getByTestId('badge-corte-estimado').textContent).toContain('Corte estimado');
    });

    // Alternar Radar a "Últimos 30 días": ahora hay 36 preguntas (>= 20) y dibuja el Radar
    fireEvent.click(screen.getByTestId('btn-fuente-practica-30d'));
    await waitFor(() => {
      expect(screen.getByTestId('radar-chart-bloques')).toBeTruthy();
    });

    // El eje Ciencias (25% < 70%) está marcado bajo el umbral con color de alerta
    const btnCiencias = screen.getByTestId('btn-bloque-ciencias');
    expect(btnCiencias.getAttribute('data-bajo-umbral')).toBe('true');

    // Al tocar el bloque Ciencias, baja al detalle por curso (barras)
    fireEvent.click(btnCiencias);
    expect(await screen.findByTestId('radar-detalle-cursos-ciencias')).toBeTruthy();

    // Volver a los 4 bloques
    fireEvent.click(screen.getByTestId('btn-radar-volver-bloques'));
    expect(await screen.findByTestId('radar-chart-bloques')).toBeTruthy();

    // Autopsia de errores muestra "Por clasificar: 1" aparte y agrupa en Cognitivo/Proc./Mixto
    expect(screen.getByTestId('autopsia-por-clasificar').textContent).toContain(
      'Por clasificar: 1',
    );
    fireEvent.click(screen.getByTestId('btn-autopsia-grupo'));
    expect(screen.getByTestId('autopsia-item-procedimental').textContent).toContain('1 (100%)');

    // "Acción Inmediata" devuelve máximo 3 acciones y la #1 sale del mismo motor que "Hoy" (PLAN_HOY)
    const accion0 = screen.getByTestId('accion-inmediata-item-0');
    expect(accion0.getAttribute('data-regla')).toBe('PLAN_HOY');
    expect(screen.queryByTestId('accion-inmediata-item-3')).toBeNull();

    // Verificar que los 3 gráficos y el panel se ven correctos al alternar por los 4 temas
    const temas: Array<{ boton: string; id: string }> = [
      { boton: 'Gamificado', id: 'gamificado' },
      { boton: 'OLED Puro', id: 'oled' },
      { boton: 'Clínico', id: 'clinico' },
      { boton: 'Dark Modern', id: 'dark-modern' },
    ];
    for (const t of temas) {
      aplicarTemaEnDom(t.id as TemaUI);
      expect(document.documentElement.getAttribute('data-theme')).toBe(t.id);
      expect(screen.getByTestId('panel-curva-acumulacion')).toBeTruthy();
      expect(screen.getByTestId('panel-radar-dominio')).toBeTruthy();
      expect(screen.getByTestId('panel-autopsia-errores')).toBeTruthy();
      expect(screen.getByTestId('panel-accion-inmediata')).toBeTruthy();
    }
  });
});
