// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import {
  AureonDB,
  CoordinadorSyncDispositivo,
  crearRepositorios,
  crearTombstoneSync,
  db,
  envolverEventoParaSync,
  fusionarLotesSync,
  NubeSyncEnMemoria,
  resolverConflictoSync,
  SETTINGS_POR_DEFECTO,
  SQL_RLS_SUPABASE_AUREON,
  type FocusSession,
  type Mistake,
  type Practice,
  type Simulacro,
  type TopicProgress,
} from '../../data';

describe('Feature Sincronización Celular ↔ PC Offline-First (PROMPT 11)', () => {
  beforeEach(async () => {
    await db.borrarDatosEstudio();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Cada uno de los 6 eventos (Practice, Mistake, FocusSession, TopicProgress, Simulacro, Settings) se envuelve con uuid, updatedAt y deletedAt', () => {
    const owner = 'user-123';

    const p: Practice = {
      id: 'p-1',
      ts: 1000,
      fecha: '2026-04-15',
      cursoId: 'bio',
      temaId: null,
      ok: 12,
      bad: 3,
      origen: 'tanda',
    };
    const m: Mistake = {
      id: 'm-1',
      origen: 'tanda',
      simulacroId: null,
      cursoId: 'bio',
      temaId: null,
      categoria: 'teoria',
      nota: 'Nota',
      fotoId: null,
      creadoEn: 2000,
      estado: 'abierto',
      caja: 0,
      proximoRepaso: null,
      historial: [],
    };
    const f: FocusSession = {
      id: 'f-1',
      inicio: 2500,
      fin: 3000,
      fecha: '2026-04-15',
      modo: 'inmersion',
      cursoId: 'bio',
      tipoTarea: 'practica_deco',
      minutosEnfoque: 50,
      fatiga: 3,
      distracciones: 1,
      completa: true,
    };
    const tp: TopicProgress = {
      cursoId: 'bio',
      temaId: 'bio-s01',
      estado: 'trabajado',
      actualizadoEn: 4000,
    };
    const s: Simulacro = {
      id: 's-1',
      fecha: '2026-04-15',
      ts: 5000,
      tipo: 'cepre1',
      porCurso: {},
      secciones: {
        act: { ok: 0, bad: 0, blanco: 0 },
        hab: { ok: 20, bad: 5, blanco: 5 },
        conoc: { ok: 40, bad: 10, blanco: 20 },
      },
      total: 200,
      revisado: true,
    };
    const cfg = { ...SETTINGS_POR_DEFECTO, actualizadoEn: 6000 };

    const sp = envolverEventoParaSync('practice', p, owner);
    const sm = envolverEventoParaSync('mistake', m, owner);
    const sf = envolverEventoParaSync('focusSession', f, owner);
    const stp = envolverEventoParaSync('topicProgress', tp, owner);
    const ss = envolverEventoParaSync('simulacro', s, owner);
    const scfg = envolverEventoParaSync('settings', cfg, owner);

    for (const sobre of [sp, sm, sf, stp, ss, scfg]) {
      expect(sobre.uuid.length).toBeGreaterThan(0);
      expect(sobre.updatedAt).toBeGreaterThan(0);
      expect(sobre.deletedAt).toBeNull();
      expect(sobre.payload?.uuid).toBe(sobre.uuid);
      expect(sobre.payload?.updatedAt).toBe(sobre.updatedAt);
      expect(sobre.payload?.deletedAt).toBeNull();
    }
  });

  it('2. Lógica de merge y resolución de conflictos: gana el updatedAt más reciente y el borrado lógico gana sobre ediciones más viejas o simultáneas', () => {
    const owner = 'user-abc';
    const basePractice: Practice = {
      id: 'prac-conflicto',
      ts: 1000,
      fecha: '2026-04-15',
      cursoId: 'fis',
      temaId: null,
      ok: 10,
      bad: 5,
      origen: 'tanda',
    };

    const edicionVieja = envolverEventoParaSync('practice', { ...basePractice, ok: 10 }, owner, {
      updatedAt: 1000,
    });
    const edicionReciente = envolverEventoParaSync('practice', { ...basePractice, ok: 18 }, owner, {
      updatedAt: 2500,
    });

    // 2a) Entre dos ediciones activas, gana el updatedAt más reciente en cualquier orden
    expect(resolverConflictoSync(edicionVieja, edicionReciente).payload?.ok).toBe(18);
    expect(resolverConflictoSync(edicionReciente, edicionVieja).payload?.ok).toBe(18);

    // 2b) El borrado lógico (t=3000) gana sobre la edición más vieja (t=2500) en ambas direcciones
    const borradoPosterior = crearTombstoneSync('practice', 'prac-conflicto', owner, 3000);
    expect(resolverConflictoSync(edicionReciente, borradoPosterior).deletedAt).toBe(3000);
    expect(resolverConflictoSync(borradoPosterior, edicionReciente).deletedAt).toBe(3000);

    // 2c) En empate exacto de marca de tiempo (t=2500), el borrado gana sobre la edición
    const borradoSimultaneo = crearTombstoneSync('practice', 'prac-conflicto', owner, 2500);
    expect(resolverConflictoSync(edicionReciente, borradoSimultaneo).deletedAt).toBe(2500);
    expect(resolverConflictoSync(borradoSimultaneo, edicionReciente).deletedAt).toBe(2500);

    // 2d) Fusión de lotes es idempotente y nunca duplica registros con el mismo uuid
    const lote1 = [edicionVieja, edicionReciente];
    const lote2 = [edicionReciente, edicionVieja];
    const fusion = fusionarLotesSync(lote1, lote2, owner);
    expect(fusion).toHaveLength(1);
    expect(fusion[0]?.payload && (fusion[0].payload as Practice).ok).toBe(18);
  });

  it('3. Reglas de seguridad (RLS): cada fila solo es accesible por su dueño y rechaza accesos cruzados', async () => {
    const nube = new NubeSyncEnMemoria();
    const sesionAna = { userId: 'user-ana', email: 'ana@unmsm.edu.pe' };
    const sesionBeto = { userId: 'user-beto', email: 'beto@unmsm.edu.pe' };

    const practicaAna = envolverEventoParaSync(
      'practice',
      {
        id: 'prac-ana-1',
        ts: 1500,
        fecha: '2026-04-15',
        cursoId: 'quim',
        temaId: null,
        ok: 14,
        bad: 1,
        origen: 'tanda',
      },
      sesionAna.userId,
    );

    await nube.pushCambios(sesionAna, [practicaAna]);

    // Beto no puede leer las filas de Ana
    const pullBeto = await nube.pullCambios(sesionBeto);
    expect(pullBeto).toHaveLength(0);

    // Beto no puede escribir filas a nombre de Ana
    await expect(nube.pushCambios(sesionBeto, [practicaAna])).rejects.toThrow(/Violación RLS/i);

    // El esquema SQL de Supabase define explícitamente RLS con auth.uid() = owner_id
    expect(SQL_RLS_SUPABASE_AUREON).toContain('enable row level security');
    expect(SQL_RLS_SUPABASE_AUREON).toContain('auth.uid() = owner_id');
  });

  it('4. Definición de terminado E2E: registrar una tanda sin red en el celular y verla en la PC al reconectar, sin duplicados', async () => {
    const dbCelular = new AureonDB('aureon-e2e-celular');
    const dbPC = new AureonDB('aureon-e2e-pc');
    await dbCelular.borrarDatosEstudio();
    await dbPC.borrarDatosEstudio();

    const nube = new NubeSyncEnMemoria();
    const sesionEstudiante = {
      userId: 'user-postulante-1',
      email: 'postulante@unmsm.edu.pe',
    };

    const syncCelular = new CoordinadorSyncDispositivo({
      database: dbCelular,
      proveedor: nube,
      sesion: sesionEstudiante,
      enLinea: false, // Celular SIN RED
    });

    const syncPC = new CoordinadorSyncDispositivo({
      database: dbPC,
      proveedor: nube,
      sesion: sesionEstudiante,
      enLinea: true, // PC conectada
    });

    const repoCelular = crearRepositorios(dbCelular);
    const repoPC = crearRepositorios(dbPC);

    // 1) El estudiante registra una tanda en el CELULAR SIN RED
    const tandaCelular: Practice = {
      id: 'prac-celular-offline-01',
      ts: 1713200000000,
      fecha: '2026-04-15',
      cursoId: 'bio',
      temaId: null,
      ok: 17,
      bad: 3,
      origen: 'tanda',
    };
    await repoCelular.practices.registrar(tandaCelular);
    syncCelular.encolarCambio('practice', tandaCelular);

    // Intentar sincronizar sin red en el celular NO bloquea ni lanza excepción; queda en pendiente_offline
    const intentoOffline = await syncCelular.sincronizarAhora(1713200005000);
    expect(intentoOffline.estado).toBe('pendiente_offline');
    expect(await repoPC.practices.listar()).toHaveLength(0);

    // 2) El celular RECONECTA a internet y sincroniza
    syncCelular.establecerConexion(true);
    const resPushCelular = await syncCelular.sincronizarAhora(1713200010000);
    expect(resPushCelular.exito).toBe(true);
    expect(resPushCelular.estado).toBe('sincronizado');

    // 3) La PC sincroniza y ve la tanda registrada en el celular
    const resPullPC = await syncPC.sincronizarAhora(1713200020000);
    expect(resPullPC.exito).toBe(true);

    const practicasEnPC = await repoPC.practices.listar();
    expect(practicasEnPC).toHaveLength(1);
    expect(practicasEnPC[0]?.id).toBe('prac-celular-offline-01');
    expect(practicasEnPC[0]?.ok).toBe(17);
    expect(practicasEnPC[0]?.bad).toBe(3);

    // 4) Sincronizar múltiples veces entre Celular y PC NO genera duplicados
    await syncCelular.sincronizarAhora(1713200030000);
    await syncPC.sincronizarAhora(1713200040000);
    expect(await repoPC.practices.listar()).toHaveLength(1);
    expect(await repoCelular.practices.listar()).toHaveLength(1);

    // 5) Si el celular elimina lógicamente la tanda en t=1713200090000, el borrado gana sobre la versión anterior en la PC
    await repoCelular.practices.eliminar('prac-celular-offline-01');
    syncCelular.encolarBorradoLogico('practice', 'prac-celular-offline-01', 1713200090000);
    await syncCelular.sincronizarAhora(1713200095000);
    await syncPC.sincronizarAhora(1713200100000);
    expect(await repoPC.practices.listar()).toHaveLength(0);

    await dbCelular.delete();
    await dbPC.delete();
  });

  it('5. UI: indicador discreto de estado de sync en barra superior que navega a Ajustes sin bloquear el uso local', async () => {
    render(<App fechaHoyOverride="2026-04-15" />);

    const pill = await screen.findByTestId('sync-status-pill');
    expect(pill.getAttribute('data-sync-state')).toBe('local');
    expect(pill.textContent).toContain('Local');

    // Al pulsar el indicador discreto de sync abre Ajustes
    fireEvent.click(pill);
    expect(await screen.findByTestId('ajustes-view')).toBeTruthy();
  });
});
