// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { db, repositorios, type Mistake, type Simulacro } from '../../data';

describe('Feature Errores & Simulacros — Leitner selectivo, Dropzone de Imagen y Scroll de Revisión', () => {
  beforeEach(async () => {
    await db.borrarDatosEstudio();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('muestra el cuadro dropzone enmarcado para adjuntar foto en el formulario de captura de errores', async () => {
    render(<App fechaHoyOverride="2026-04-15" vistaInicial="errores" />);

    const dropzone = await screen.findByTestId('dropzone-foto-error');
    expect(dropzone).toBeTruthy();
    expect(dropzone.textContent).toContain('Toca o arrastra aquí para seleccionar imagen');

    // Opción para excluir de Leitner desde el formulario
    expect(screen.getByTestId('chk-excluir-leitner-nuevo')).toBeTruthy();
  });

  it('omite errores de Habilidad Verbal por defecto en flashcards Leitner y permite sacarlos con el botón', async () => {
    const fecha = '2026-04-15';
    // 1. Error de HV que vence hoy
    const errorHv: Mistake = {
      id: 'err-hv-1',
      origen: 'tanda',
      simulacroId: null,
      cursoId: 'hv',
      temaId: null,
      categoria: 'lectura',
      nota: 'Mala inferencia en texto filosófico',
      fotoId: null,
      creadoEn: 1000,
      fecha,
      estado: 'repaso',
      caja: 1,
      proximoRepaso: fecha,
      historial: [],
    };
    await repositorios.mistakes.guardar(errorHv);

    // 2. Error de Biología que vence hoy
    const errorBio: Mistake = {
      id: 'err-bio-1',
      origen: 'tanda',
      simulacroId: null,
      cursoId: 'bio',
      temaId: null,
      categoria: 'teoria',
      nota: 'Fase luminosa de la fotosíntesis',
      fotoId: null,
      creadoEn: 2000,
      fecha,
      estado: 'repaso',
      caja: 1,
      proximoRepaso: fecha,
      historial: [],
    };
    await repositorios.mistakes.guardar(errorBio);

    render(<App fechaHoyOverride={fecha} vistaInicial="errores" />);

    // Por defecto el toggle de omitir HV está activo y muestra el error de Biología en vez del de HV
    const toggleHv = (await screen.findByTestId('toggle-omitir-hv-leitner')) as HTMLInputElement;
    expect(toggleHv.checked).toBe(true);

    const flashcard = await screen.findByTestId('leitner-flashcard');
    expect(flashcard.textContent).toContain('Biología');
    expect(flashcard.textContent).toContain('Fase luminosa de la fotosíntesis');

    // Botón para sacar de Leitner
    const btnExcluir = screen.getByTestId('btn-excluir-de-leitner');
    fireEvent.click(btnExcluir);

    // Ahora queda sin errores vencidos
    await waitFor(() => {
      expect(screen.getByText('Sin repasos Leitner vencidos para hoy.')).toBeTruthy();
    });

    const guardado = await db.mistakes.get('err-bio-1');
    expect(guardado?.excluirDeLeitner).toBe(true);
    expect(guardado?.caja).toBe(0);
  });

  it('al presionar "Revisar errores" en el historial de simulacros abre el panel y ejecuta scroll suave', async () => {
    const fecha = '2026-04-15';
    const sim: Simulacro = {
      id: 'sim-test-scroll',
      fecha,
      ts: 1000,
      tipo: 'cepre1',
      porCurso: {
        hm: { ok: 10, bad: 5, blanco: 0 },
        hv: { ok: 12, bad: 3, blanco: 0 },
      },
      revisado: false,
      total: 180,
      secciones: {
        act: { ok: 0, bad: 0, blanco: 0 },
        hab: { ok: 22, bad: 8, blanco: 0 },
        conoc: { ok: 30, bad: 10, blanco: 30 },
      },
    };
    await repositorios.simulacros.guardar(sim);

    render(<App fechaHoyOverride={fecha} vistaInicial="simulacros" />);

    const btnRevisar = await screen.findByTestId(`btn-revisar-sim-${sim.id}`);
    expect(btnRevisar).toBeTruthy();

    fireEvent.click(btnRevisar);

    // El panel de revisión debe aparecer
    const panelRevision = await screen.findByTestId('panel-revision-simulacro');
    expect(panelRevision).toBeTruthy();
    expect(panelRevision.textContent).toContain('Revisión de Errores');

    // También incluye el dropzone para fotos en simulacros
    expect(screen.getByTestId('dropzone-foto-simulacro')).toBeTruthy();
  });
});
