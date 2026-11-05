// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { db, repositorios, type Practice } from '../../data';

describe('Feature Hoy — Horario Semanal, Calendario CEPRE y Fidelidad de Checklist', () => {
  beforeEach(async () => {
    await db.borrarDatosEstudio();
  });

  afterEach(() => {
    cleanup();
  });

  it('no tacha el bloque de repaso espaciado de Filosofía si el usuario practica Psicología', async () => {
    // 2026-11-09 es lunes de S2. El plan tendrá como acción principal un curso y bloque de espaciado otro.
    const fecha = '2026-11-09';
    render(<App fechaHoyOverride={fecha} />);

    // El ítem de espaciado empieza desmarcado
    const chkEspaciado = await screen.findByTestId('chk-espaciado');
    expect(chkEspaciado.getAttribute('data-checked')).toBe('false');

    // Registramos una práctica de Psicología (que NO es el curso de espaciado)
    const practicaPsic: Practice = {
      id: 'prac-psic-1',
      ts: Date.now(),
      fecha,
      cursoId: 'psic',
      temaId: 'psi-s1-1',
      ok: 15,
      bad: 0,
      origen: 'tanda',
    };
    await repositorios.practices.registrar(practicaPsic);

    // Registramos una práctica de RM
    const practicaRm: Practice = {
      id: 'prac-rm-1',
      ts: Date.now() + 1000,
      fecha,
      cursoId: 'hm',
      temaId: 'hm-s1-1',
      ok: 15,
      bad: 0,
      origen: 'tanda',
    };
    await repositorios.practices.registrar(practicaRm);

    // Recargar vista forzando actualización
    cleanup();
    render(<App fechaHoyOverride={fecha} />);

    // Con 2 tandas hechas (Psicología y RM), chk-espaciado sigue false porque ninguna fue del curso asignado
    const chkEspaciadoDespues = await screen.findByTestId('chk-espaciado');
    expect(chkEspaciadoDespues.getAttribute('data-checked')).toBe('false');
  });

  it('muestra la sección de horario de clases de hoy con sus cursos y cuenta regresiva CEPRE', async () => {
    const fecha = '2026-11-09'; // Lunes
    render(<App fechaHoyOverride={fecha} />);

    expect(await screen.findByTestId('seccion-horario-clases')).toBeTruthy();
    expect(screen.getByText(/Horario de hoy \(Lunes\)/i)).toBeTruthy();

    // En el horario por defecto los lunes tocan HM, BIO, FILO
    expect(screen.getByTestId('chip-horario-hm')).toBeTruthy();
    expect(screen.getByTestId('chip-horario-bio')).toBeTruthy();
    expect(screen.getByTestId('chip-horario-filo')).toBeTruthy();

    // Cuenta regresiva a la próxima evaluación
    expect(screen.getByTestId('badge-proxima-eval')).toBeTruthy();
  });

  it('permite abrir el modal de horario, editar cursos del día y guardar cambios', async () => {
    const fecha = '2026-11-09';
    render(<App fechaHoyOverride={fecha} />);

    // Abrir modal de horario
    const btnAbrir = await screen.findByTestId('btn-abrir-editor-horario');
    fireEvent.click(btnAbrir);

    // Verificar que el modal está abierto con su título enfocado solo en el horario
    expect(screen.getByText('Mi Horario Semanal')).toBeTruthy();
    expect(screen.getByTestId('tab-horario-martes')).toBeTruthy();

    // Cambiar a pestaña Martes y agregar un curso
    fireEvent.click(screen.getByTestId('tab-horario-martes'));
    const btnAgregar = screen.getByTestId('btn-agregar-curso-horario');
    fireEvent.click(btnAgregar);

    const btnGuardar = screen.getByTestId('btn-guardar-horario-fechas');
    fireEvent.click(btnGuardar);

    await waitFor(async () => {
      const s = await db.settings.get('default');
      expect(s?.horarioSemanal?.martes).toContain('hm');
    });
  });

  it('no muestra los botones redundantes de + Tanda en cabecera ni el botón flotante inferior', () => {
    render(<App fechaHoyOverride="2026-11-09" />);
    expect(screen.queryByTestId('btn-header-nueva-tanda')).toBeNull();
    expect(screen.queryByTestId('fab-registro-rapido')).toBeNull();
  });

  it('muestra los recursos rápidos de estudio en Hoy justo debajo del checklist y permite configurar metas en Ajustes', async () => {
    render(<App fechaHoyOverride="2026-11-09" />);

    // 1) En Hoy se renderiza la sección de recursos rápidos
    const secRecursos = await screen.findByTestId('seccion-recursos-rapidos-hoy');
    expect(secRecursos).toBeTruthy();
    const linkBoletines = screen.getByTestId('enlace-rapido-rec-boletines');
    expect(linkBoletines.getAttribute('href')).toContain('drive.google.com');

    // 2) En Ajustes: configurar puntajes mínimo, máximo, meta de horas y accesibilidad
    fireEvent.click(screen.getByTestId('nav-ajustes'));
    const inputMin = await screen.findByTestId('input-ajustes-puntaje-min');
    fireEvent.change(inputMin, { target: { value: '1280.5' } });

    const inputMax = screen.getByTestId('input-ajustes-puntaje-max');
    fireEvent.change(inputMax, { target: { value: '1690.2' } });

    const inputMetaHoras = screen.getByTestId('input-ajustes-meta-horas');
    fireEvent.change(inputMetaHoras, { target: { value: '35' } });

    const inputMetaPreguntas = screen.getByTestId('input-ajustes-meta-preguntas');
    fireEvent.change(inputMetaPreguntas, { target: { value: '250' } });

    // Toggle de alto contraste y tamaño de texto
    const toggleContraste = screen.getByTestId('toggle-ajustes-alto-contraste');
    fireEvent.click(toggleContraste);
    expect(document.documentElement.getAttribute('data-high-contrast')).toBe('true');

    const selectTamano = screen.getByTestId('select-ajustes-tamano-texto');
    fireEvent.change(selectTamano, { target: { value: 'grande' } });
    expect(document.documentElement.getAttribute('data-text-size')).toBe('grande');

    await waitFor(async () => {
      const s = await db.settings.get('default');
      expect(s?.puntajeMinimoUltimoProceso).toBe(1280.5);
      expect(s?.puntajeMaximoUltimoProceso).toBe(1690.2);
      expect(s?.metaHorasSemana).toBe(35);
      expect(s?.metaPreguntasSemana).toBe(250);
      expect(s?.altoContraste).toBe(true);
      expect(s?.tamanoTexto).toBe('grande');
    });
  });

  it('permite edición rápida de meta semanal de preguntas en Hoy y muestra desglose de buenas y malas en histórico', async () => {
    // Insertar práctica con 10 ok y 3 bad
    await db.practices.add({
      id: 'prac-test-1',
      ts: Date.now(),
      fecha: '2026-03-18',
      cursoId: 'hm',
      temaId: null,
      ok: 10,
      bad: 3,
      origen: 'tanda',
    });

    render(<App fechaHoyOverride="2026-03-18" />);

    // Verificar que se ve el desglose en el KPI semanal y en histórico
    const kpiSemana = await screen.findByTestId('kpi-preguntas-semana');
    expect(within(kpiSemana).getAllByText(/✓ 10/).length).toBe(2);
    expect(within(kpiSemana).getAllByText(/✗ 3/).length).toBe(2);

    // Comprobar botón de edición rápida de meta semanal
    const btnEditar = screen.getByTestId('btn-editar-meta-preguntas-hoy');
    fireEvent.click(btnEditar);

    const inputEdicion = screen.getByLabelText('Nueva meta semanal de preguntas');
    fireEvent.change(inputEdicion, { target: { value: '300' } });
    fireEvent.click(screen.getByTitle('Guardar meta'));

    await waitFor(async () => {
      const s = await db.settings.get('default');
      expect(s?.metaPreguntasSemana).toBe(300);
    });
  });
});
