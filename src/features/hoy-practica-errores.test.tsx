// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { db, repositorios } from '../data';
import { guardarSesionEnfoquePersistida } from './enfoque/EnfoqueView';

describe('E2E / Integración: hoy, practica y errores (móvil primero)', () => {
  beforeEach(async () => {
    guardarSesionEnfoquePersistida(null);
    await db.borrarDatosEstudio();
  });

  afterEach(() => {
    guardarSesionEnfoquePersistida(null);
    cleanup();
  });

  it('muestra <GoldCounter /> JUSTO DEBAJO de "Preguntas esta semana" y sube al guardar una tanda en <= 3 interacciones', async () => {
    render(<App fechaHoyOverride="2026-03-18" />);

    // Verificar que el KPI "Preguntas esta semana" contiene el GoldCounter justo debajo
    const kpiSemana = await screen.findByTestId('kpi-preguntas-semana');
    expect(within(kpiSemana).getByText(/Preguntas esta semana/i)).toBeTruthy();

    const contenedorGold = within(kpiSemana).getByTestId('contenedor-gold-bajo-semanal');
    const goldCounter = within(contenedorGold).getByTestId('gold-counter');
    expect(goldCounter.getAttribute('aria-label')).toBe('Total histórico: 0 preguntas');

    // E2E: Registrar una tanda en <= 3 interacciones:
    // Interacción 1: presionar tecla 'n' para abrir registro rápido
    fireEvent.keyDown(window, { key: 'n' });

    // Interacción 2: tocar chip de curso (ej. Biología)
    fireEvent.click(await screen.findByTestId('chip-curso-bio'));

    // Interacción 3: tocar "Guardar tanda" (viene prellenado con 10 ok, 0 bad -> 1 toque)
    fireEvent.click(screen.getByTestId('btn-guardar-tanda'));

    // Verificar que el GoldCounter subió a 10 y el KPI semanal también
    await waitFor(() => {
      const actualizado = within(screen.getByTestId('contenedor-gold-bajo-semanal')).getByTestId(
        'gold-counter',
      );
      expect(actualizado.getAttribute('aria-label')).toBe('Total histórico: 10 preguntas');
    });

    // El checklist del día marca automáticamente el bloque de práctica como completado
    expect(screen.getByTestId('chk-practica').getAttribute('data-checked')).toBe('true');
  });

  it('el formulario de registro rápido NO pierde estado al re-renderizar ni al cerrar/reabrir la hoja', async () => {
    const { rerender } = render(<App fechaHoyOverride="2026-03-18" />);

    // Abrir con atajo de teclado 'n'
    fireEvent.keyDown(window, { key: 'n' });

    const btnPreset20 = await screen.findByTestId('preset-ok-20');
    fireEvent.click(btnPreset20);
    fireEvent.click(screen.getByTestId('chip-curso-fis'));

    const inputOk = screen.getByLabelText('Cantidad de correctas') as HTMLInputElement;
    expect(inputOk.value).toBe('20');

    // Forzar re-render del árbol padre
    rerender(<App fechaHoyOverride="2026-03-18" />);

    expect((screen.getByLabelText('Cantidad de correctas') as HTMLInputElement).value).toBe('20');
    expect(screen.getByTestId('chip-curso-fis').getAttribute('aria-pressed')).toBe('true');

    // Incluso si se cierra con Escape y se vuelve a abrir, conserva el borrador en curso
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'n' });

    expect(
      ((await screen.findByLabelText('Cantidad de correctas')) as HTMLInputElement).value,
    ).toBe('20');
    expect(screen.getByTestId('chip-curso-fis').getAttribute('aria-pressed')).toBe('true');
  });

  it('si hay incorrectas ofrece las 5 categorías o "Omitir" (quedando por clasificar para el Cierre del día)', async () => {
    render(<App fechaHoyOverride="2026-03-18" />);

    fireEvent.keyDown(window, { key: 'n' });
    fireEvent.click(await screen.findByTestId('preset-bad-2'));
    fireEvent.click(screen.getByTestId('btn-guardar-tanda'));

    // Aparece el paso opcional de 1 toque con las 5 categorías y el botón Omitir
    expect(await screen.findByTestId('paso-causas-error')).toBeTruthy();
    expect(screen.getByTestId('chip-causa-teoria')).toBeTruthy();
    expect(screen.getByTestId('chip-causa-lectura')).toBeTruthy();
    expect(screen.getByTestId('chip-causa-calculo')).toBeTruthy();
    expect(screen.getByTestId('chip-causa-tiempo')).toBeTruthy();
    expect(screen.getByTestId('chip-causa-duda')).toBeTruthy();

    // Pulsamos "Omitir" para que quede sin categoría ("por clasificar")
    fireEvent.click(screen.getByTestId('btn-omitir-causa'));

    await waitFor(async () => {
      const errores = await repositorios.mistakes.listar();
      expect(errores).toHaveLength(1);
      expect(errores[0]?.categoria).toBeNull();
    });

    // Abrimos el Cierre del Día y clasificamos el error pendiente con 1 toque
    fireEvent.click(screen.getByTestId('btn-abrir-cierre-dia'));
    const errores = await repositorios.mistakes.listar();
    const errId = errores[0]?.id ?? '';

    const btnClasificar = await screen.findByTestId(`cierre-clasificar-${errId}-teoria`);
    fireEvent.click(btnClasificar);

    await waitFor(async () => {
      const actualizados = await repositorios.mistakes.listar();
      expect(actualizados[0]?.categoria).toBe('teoria');
    });
  });

  it('la acción principal de HOY inicia el Enfoque y al terminar abre el registro de tanda prellenado', async () => {
    render(<App fechaHoyOverride="2026-03-18" />);

    const btnEmpezar = await screen.findByTestId('btn-empezar-bloque-principal');
    fireEvent.click(btnEmpezar);

    const btnTerminarEnfoque = await screen.findByTestId('btn-terminar-enfoque-abrir-tanda');
    fireEvent.click(btnTerminarEnfoque);

    // Se abre automáticamente QuickRegisterSheet con las preguntas sugeridas prellenadas
    const btnGuardar = await screen.findByTestId('btn-guardar-tanda');
    expect(btnGuardar).toBeTruthy();
  });

  it('permite repasar errores vencidos como flashcards Leitner y editar/deshacer en el historial de práctica', async () => {
    // Sembramos un error vencido hoy en caja 1 (estado 'repaso')
    await repositorios.mistakes.guardar({
      id: 'err-leitner-1',
      origen: 'tanda',
      simulacroId: null,
      cursoId: 'quim',
      temaId: null,
      categoria: 'teoria',
      nota: 'Hibridación sp2 vs sp3',
      fotoId: null,
      creadoEn: 1_710_000_000_000,
      fecha: '2026-03-15',
      caja: 1,
      proximoRepaso: '2026-03-18',
      estado: 'repaso',
      historial: [],
    });

    render(<App fechaHoyOverride="2026-03-18" />);

    // Navegar a la pestaña Errores
    fireEvent.click(screen.getByTestId('nav-errores'));

    const card = await screen.findByTestId('leitner-flashcard');
    expect(within(card).getByText(/Hibridación sp2 vs sp3/i)).toBeTruthy();

    // Pulsar "Lo recordé" -> sube a caja 2 (+2 días)
    fireEvent.click(screen.getByTestId('btn-flashcard-recorde'));

    await waitFor(async () => {
      const lista = await repositorios.mistakes.listar();
      expect(lista[0]?.caja).toBe(2);
      expect(lista[0]?.proximoRepaso).toBe('2026-03-20');
    });
  });

  it('historial editable por día con Deshacer funcional en Práctica', async () => {
    await repositorios.practices.registrar({
      id: 'prac-hist-1',
      ts: 1_710_000_000_000,
      fecha: '2026-03-18',
      cursoId: 'quim',
      temaId: null,
      ok: 12,
      bad: 3,
      origen: 'tanda',
    });

    render(<App fechaHoyOverride="2026-03-18" />);

    fireEvent.click(screen.getByTestId('nav-practica'));

    const btnEditar = await screen.findByTestId('editar-practica-prac-hist-1');
    fireEvent.click(btnEditar);

    const inputOk = screen.getByLabelText('Editar correctas');
    fireEvent.change(inputOk, { target: { value: '18' } });
    fireEvent.click(screen.getByTestId('guardar-edicion-prac-hist-1'));

    await waitFor(async () => {
      const todas = await repositorios.practices.listar();
      expect(todas[0]?.ok).toBe(18);
    });

    // Borrar y luego pulsar Deshacer en el Toast
    fireEvent.click(screen.getByTestId('borrar-practica-prac-hist-1'));
    await waitFor(async () => {
      const todas = await repositorios.practices.listar();
      expect(todas).toHaveLength(0);
    });

    const btnDeshacer = await screen.findByRole('button', { name: /Deshacer/i });
    fireEvent.click(btnDeshacer);

    await waitFor(async () => {
      const restauradas = await repositorios.practices.listar();
      expect(restauradas).toHaveLength(1);
      expect(restauradas[0]?.ok).toBe(18);
    });
  });
});
