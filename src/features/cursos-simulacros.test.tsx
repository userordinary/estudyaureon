// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { db, repositorios } from '../data';
import { CURSOS, temasDeCurso } from '../domain';
import { guardarSesionEnfoquePersistida } from './enfoque/EnfoqueView';
import { guardarCronoSimulacroPersistido } from './simulacros/SimulacrosView';

describe('E2E / Integración: `cursos` (PROMPT 6) y `simulacros` (PROMPT 7)', () => {
  beforeEach(async () => {
    guardarSesionEnfoquePersistida(null);
    guardarCronoSimulacroPersistido(null);
    await db.borrarDatosEstudio();
  });

  afterEach(() => {
    guardarSesionEnfoquePersistida(null);
    guardarCronoSimulacroPersistido(null);
    cleanup();
  });

  it('CURSOS: muestra los 19 cursos, persiste estados de temas/recursos y sugiere "Dominado" (sin aplicarlo solo) con >=85 % en >=20 preg y 0 errores abiertos', async () => {
    const temaQuimS1 = temasDeCurso('quim')[0]?.id ?? 'quim-s1';

    // Sembramos una práctica de 18 ok y 2 bad (20 preguntas, 90 % de precisión) sin errores abiertos en el tema S1 de Química
    await repositorios.practices.registrar(
      {
        id: 'prac-quim-s1',
        ts: 1_710_000_000_000,
        fecha: '2026-03-18',
        cursoId: 'quim',
        temaId: temaQuimS1,
        ok: 18,
        bad: 2,
        origen: 'tanda',
      },
      {
        cursoId: 'quim',
        temaId: temaQuimS1,
        estado: 'trabajado',
        actualizadoEn: 1_710_000_000_000,
      },
    );

    render(<App fechaHoyOverride="2026-03-18" vistaInicial="cursos" />);

    // 1) Verifica que se muestran los 19 cursos oficiales
    for (const c of CURSOS) {
      expect(await screen.findByTestId(`tarjeta-curso-${c.id}`)).toBeTruthy();
    }

    // 2) El tema S1 está en 'trabajado' (NO se aplicó 'dominado' solo) y muestra la sugerencia de 'Dominado'
    const selectEstado = (await screen.findByTestId(
      `select-estado-tema-${temaQuimS1}`,
    )) as HTMLSelectElement;
    expect(selectEstado.value).toBe('trabajado');
    expect(screen.getByTestId(`sugerencia-dominado-${temaQuimS1}`)).toBeTruthy();

    // 3) Al aplicar "Dominado" por decisión del usuario, persiste en IndexedDB
    fireEvent.click(screen.getByTestId(`btn-aplicar-dominado-${temaQuimS1}`));

    await waitFor(async () => {
      const listaTp = await repositorios.topicProgress.porCurso('quim');
      const tpS1 = listaTp.find((t) => t.temaId === temaQuimS1);
      expect(tpS1?.estado).toBe('dominado');
    });

    // 4) Editar un enlace de recursos en Ajustes persiste en Settings
    fireEvent.click(screen.getByTestId('nav-ajustes'));
    const inputUrl = await screen.findByTestId('input-url-recurso-rec-boletines');
    fireEvent.change(inputUrl, {
      target: { value: 'https://drive.google.com/drive/folders/ciclo-2026' },
    });

    await waitFor(async () => {
      const cfg = await repositorios.settings.obtener();
      const rec = cfg.recursosEnlaces?.find((r) => r.id === 'rec-boletines');
      expect(rec?.url).toBe('https://drive.google.com/drive/folders/ciclo-2026');
    });
  });

  it('SIMULACROS: guarda simulacro con revisado:false, actualiza acumulado directo y brecha, exige categoría obligatoria y pasa a revisado:true al clasificar todas las incorrectas', async () => {
    render(<App fechaHoyOverride="2026-03-18" vistaInicial="simulacros" />);

    // Ingresar respuestas en la tabla por curso para 1.ª CEPRE:
    // HV: 14 buenas, 0 malas (1 blanco)
    // Química: 5 buenas, 2 malas (0 blancos) -> 2 incorrectas por clasificar
    const inputOkHv = await screen.findByTestId('sim-ok-hv');
    fireEvent.change(inputOkHv, { target: { value: '14' } });
    fireEvent.change(screen.getByTestId('sim-ok-quim'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('sim-bad-quim'), { target: { value: '2' } });

    // Puntaje en vivo: 19 buenas * 3.00 - 2 malas * 0.168 = 57 - 0.336 = 56.664
    expect(screen.getByTestId('chip-puntaje-total-vivo').textContent).toContain('56.664');
    expect(screen.getByTestId('sim-blanco-hv').textContent).toBe('1');

    // Guardar simulacro
    fireEvent.click(screen.getByTestId('btn-guardar-simulacro'));

    // Verifica que se guardó con revisado: false y abrió la Revisión de errores
    await waitFor(async () => {
      const sims = await repositorios.simulacros.listar();
      expect(sims).toHaveLength(1);
      expect(sims[0]?.revisado).toBe(false);
      expect(sims[0]?.total).toBe(56.664);
    });

    expect(await screen.findByTestId('panel-revision-simulacro')).toBeTruthy();
    expect(screen.getByTestId('pendientes-curso-quim').textContent).toContain(
      'Te faltan clasificar 2 de 2 incorrectas',
    );

    // NO se puede marcar como revisado mientras falten incorrectas por clasificar
    const btnMarcarRevisado = screen.getByTestId(
      'btn-marcar-simulacro-revisado',
    ) as HTMLButtonElement;
    expect(btnMarcarRevisado.disabled).toBe(true);

    // NO se puede añadir error sin categoría (botón deshabilitado cuando categoría está vacía)
    const btnAgregarError = screen.getByTestId('btn-agregar-error-simulacro') as HTMLButtonElement;
    expect(btnAgregarError.disabled).toBe(true);

    // Clasificar el 1.er error de Química con categoría 'teoria'
    fireEvent.change(screen.getByTestId('select-categoria-error-sim'), {
      target: { value: 'teoria' },
    });
    expect(btnAgregarError.disabled).toBe(false);
    fireEvent.click(btnAgregarError);

    await waitFor(() => {
      expect(screen.getByTestId('pendientes-curso-quim').textContent).toContain(
        'Te faltan clasificar 1 de 2 incorrectas',
      );
    });
    // Sigue sin poder marcarse como revisado porque falta 1 incorrecta
    expect(
      (screen.getByTestId('btn-marcar-simulacro-revisado') as HTMLButtonElement).disabled,
    ).toBe(true);

    // Clasificar el 2.º error de Química con categoría 'calculo'
    fireEvent.change(screen.getByTestId('select-categoria-error-sim'), {
      target: { value: 'calculo' },
    });
    fireEvent.click(screen.getByTestId('btn-agregar-error-simulacro'));

    // Al quedar las 2 incorrectas clasificadas con categoría, el simulacro pasa automáticamente a revisado: true
    // y los 2 errores nacen con origen 'simulacro' en Leitner Caja 1
    await waitFor(async () => {
      const sims = await repositorios.simulacros.listar();
      expect(sims[0]?.revisado).toBe(true);

      const errs = await repositorios.mistakes.listar();
      expect(errs).toHaveLength(2);
      expect(
        errs.every((e) => e.origen === 'simulacro' && e.caja === 1 && e.estado === 'repaso'),
      ).toBe(true);
    });
  });
});
