import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CURSOS, sumarDias } from '../domain';
import {
  AUREON_BACKUP_FORMAT,
  AUREON_BACKUP_VERSION,
  AureonDB,
  calcularMinutosEnfoque,
  calcularTotalesPractica,
  CAUSAS_V4_A_CATEGORIA,
  contarErroresPorEstado,
  crearRepositorios,
  ejecutarAutorrespaldoSemanalSiCorresponde,
  evaluarRecordatorioDescargaManual,
  exportarAureonJSON,
  generarIdEstable,
  guardarCopiaRotativa,
  importarAureonJSON,
  importarRespaldoV4EnDB,
  listarCopiasAutorrespaldo,
  mapearCausaV4,
  MAX_COPIAS_AUTORRESPALDO,
  normalizarMistakeMigracion,
  restaurarDesdeCopiaAutorrespaldo,
  solicitarPersistenciaAlmacenamiento,
  totalesPracticaSemana,
  transformarRespaldoV4,
  V4_STORAGE_KEY,
  verificarRecordatorioDescargaManual,
} from './index';

// ---------------------------------------------------------------------------
// Respaldo realista del v4 (clave 'bitacora-estudio-v4') + funciones de conteo del v4
// ---------------------------------------------------------------------------

interface V4SampleState {
  profile: { name: string; career: string; area: string; msg: string };
  config: {
    examDate: string;
    targetScore: number;
    admMaxScore: number;
    baselineScore: number;
    cepreStart: string;
    currentCepreWeek: number;
    evalDates: { e1: string; e2: string; e3: string; e4: string };
  };
  hourGoal: number;
  weeklyQuestionTarget: number;
  dark: boolean;
  courses: Array<{
    id: string;
    name: string;
    goal: number;
    color: string;
    area: string;
    weight: number;
  }>;
  sessions: Array<{
    id: string;
    date: string;
    courseId: string;
    topic: string | null;
    q: number;
    ok: number;
    bad: number;
    skip: number;
    ts: number;
  }>;
  log: Record<string, Record<string, { q: number; ok?: number; bad?: number }>>;
  errors: Array<{
    id: string;
    courseId: string;
    topic: string;
    tag: string;
    desc: string;
    date: string;
    ts: number;
    status: 'abierto' | 'resuelto';
    box: number;
    nextReview: string | null;
    lastReview: string | null;
    reviews: number;
    fails: number;
  }>;
  simulacros: Array<{
    id: string;
    date: string;
    ts: number;
    simType: string;
    name: string;
    career: string;
    hab: { ok: number; bad: number; skip: number };
    conoc: { ok: number; bad: number; skip: number };
    act?: { ok: number; bad: number; skip: number };
    score: { hab: number; conoc: number; act: number; total: number };
    badCourses: string[];
  }>;
  topicStatus: Record<string, string>;
  hours: Record<string, number>;
  ui: { activeTab: string };
  pomo: { dur: number; brk: number; mode: string; running: boolean; remain: number };
  examTimer: { running: boolean; phase: string; phaseDur: number; remain: number };
}

function crearCursosV4(): V4SampleState['courses'] {
  return CURSOS.map((c) => ({
    id: `c${c.orden}`,
    name: c.nombre,
    goal: 20,
    color: c.color,
    area: c.bloque,
    weight: 4,
  }));
}

function construirRespaldoV4Realista(): V4SampleState {
  // c1 = Habilidad Verbal, c2 = Habilidad Matemática, c3 = Aritmética, c16 = Física, c17 = Química, c18 = Biología
  return {
    profile: {
      name: 'MANUEL',
      career: 'Medicina Humana',
      area: 'A',
      msg: 'Foco total en precisión.',
    },
    config: {
      examDate: '2026-12-06',
      targetScore: 1329.125,
      admMaxScore: 1624.875,
      baselineScore: 1650, // meta personal por encima del corte 1626.342
      cepreStart: '2026-11-02',
      currentCepreWeek: 3,
      evalDates: {
        e1: '2026-12-06',
        e2: '2027-01-03',
        e3: '2027-02-07',
        e4: '2027-03-07',
      },
    },
    hourGoal: 28,
    weeklyQuestionTarget: 120,
    dark: true,
    courses: [
      ...crearCursosV4(),
      { id: 'MIX', name: 'MIX (Varios)', goal: 10, color: '#7C3AED', area: 'Mix', weight: 0 },
    ],
    sessions: [
      {
        id: 'sess-1',
        date: '2026-11-02',
        courseId: 'c17', // Química
        topic: 'S3 · Enlace químico',
        q: 20,
        ok: 16,
        bad: 4,
        skip: 0,
        ts: 1793635200000,
      },
      {
        id: 'sess-2',
        date: '2026-11-03',
        courseId: 'c1', // Habilidad Verbal
        topic: 'S1 · Tipología textual: expositivos, informativos y narrativos',
        q: 15,
        ok: 13,
        bad: 2,
        skip: 0,
        ts: 1793721600000,
      },
      {
        id: 'sess-3',
        date: '2026-11-04',
        courseId: 'c18', // Biología
        topic: 'S2 · Virus y célula procariota',
        q: 25,
        ok: 20,
        bad: 5,
        skip: 0,
        ts: 1793808000000,
      },
      {
        id: 'sess-4',
        date: '2026-11-05',
        courseId: 'MIX',
        topic: 'Maratón Ciencias',
        q: 18,
        ok: 14,
        bad: 4,
        skip: 0,
        ts: 1793894400000,
      },
    ],
    // `log` incluye tanto las sesiones normales como celdas editadas a mano en la tabla:
    // - 2026-11-02 c17 tiene q=28 (20 de sess-1 + 8 editadas a mano en la tabla)
    // - 2026-11-03 c1 tiene q=15 (exactamente sess-2)
    // - 2026-11-04 c18 tiene q=25 (exactamente sess-3)
    // - 2026-11-05 MIX tiene q=18 (exactamente sess-4)
    // - 2026-11-06 c16 (Física) tiene q=12 sin ninguna sesión asociada (100% editado en tabla)
    log: {
      '2026-11-02': { c17: { q: 28, ok: 16, bad: 4 } },
      '2026-11-03': { c1: { q: 15, ok: 13, bad: 2 } },
      '2026-11-04': { c18: { q: 25, ok: 20, bad: 5 } },
      '2026-11-05': { MIX: { q: 18, ok: 14, bad: 4 } },
      '2026-11-06': { c16: { q: 12 } },
    },
    errors: [
      {
        id: 'err-1',
        courseId: 'c17',
        topic: 'S3 · Enlace químico',
        tag: 'Concepto',
        desc: 'Confundí enlace dativo con covalente polar',
        date: '2026-11-02',
        ts: 1793636000000,
        status: 'abierto',
        box: 0,
        nextReview: null,
        lastReview: null,
        reviews: 0,
        fails: 0,
      },
      {
        id: 'err-2',
        courseId: 'c1',
        topic: 'S1 · Tipología textual: expositivos, informativos y narrativos',
        tag: 'Leer texto primero',
        desc: 'No leí la pregunta antes del texto largo',
        date: '2026-11-03',
        ts: 1793722000000,
        status: 'abierto',
        box: 0,
        nextReview: null,
        lastReview: null,
        reviews: 0,
        fails: 0,
      },
      {
        id: 'err-3',
        courseId: 'c16',
        topic: 'S2 · Vectores analíticos; cinemática; MRU',
        tag: 'Cálculo',
        desc: 'Error de signo al descomponer el vector',
        date: '2026-11-04',
        ts: 1793809000000,
        status: 'resuelto',
        box: 3,
        nextReview: '2026-11-09',
        lastReview: '2026-11-04',
        reviews: 2,
        fails: 0,
      },
      {
        id: 'err-4',
        courseId: 'c18',
        topic: 'S2 · Virus y célula procariota',
        tag: 'Trampa DECO',
        desc: 'Duda entre cápside y envoltura viral',
        date: '2026-11-04',
        ts: 1793810000000,
        status: 'resuelto',
        box: 7,
        nextReview: null,
        lastReview: '2026-11-05',
        reviews: 6,
        fails: 0,
      },
      {
        id: 'err-5',
        courseId: 'c3',
        topic: 'General',
        tag: 'Otro',
        desc: 'Error sin causa específica',
        date: '2026-11-05',
        ts: 1793895000000,
        status: 'abierto',
        box: 0,
        nextReview: null,
        lastReview: null,
        reviews: 0,
        fails: 0,
      },
    ],
    simulacros: [
      {
        id: 'sim-1',
        date: '2026-12-06',
        ts: 1796572800000,
        simType: 'cepre1',
        name: 'MANUEL',
        career: 'Medicina Humana',
        hab: { ok: 26, bad: 2, skip: 2 },
        conoc: { ok: 58, bad: 6, skip: 6 },
        score: { hab: 77.664, conoc: 172.992, act: 0, total: 250.656 },
        badCourses: ['c16', 'c17'],
      },
    ],
    topicStatus: {
      'c17|S3 · Enlace químico': 'done',
      'c1|S1 · Tipología textual: expositivos, informativos y narrativos': 'prog',
    },
    hours: {
      '2026-11-02': 120,
      '2026-11-03': 95,
      '2026-11-04': 150,
    },
    ui: { activeTab: 'hoy' },
    pomo: { dur: 25, brk: 5, mode: 'focus', running: false, remain: 1500 },
    examTimer: { running: false, phase: 'idle', phaseDur: 0, remain: 0 },
  };
}

/**
 * Reproduce exactamente las fórmulas de `legacy/PREE.html` para:
 * - total histórico de preguntas (`allTime` en `renderProfileAndKPIs`, línea 2068)
 * - total semanal de preguntas (`weekTotalQ`, línea 1421)
 * - total de errores abiertos (`openErr` en `renderProfileAndKPIs`, línea 2062)
 */
function calcularTotalesComoV4(state: V4SampleState, lunesSemana: string) {
  let allTimeQ = 0;
  for (const ds of Object.keys(state.log)) {
    const dayObj = state.log[ds] ?? {};
    for (const cid of Object.keys(dayObj)) {
      allTimeQ += dayObj[cid]?.q ?? 0;
    }
  }

  let weekQ = 0;
  for (let i = 0; i < 7; i++) {
    const ds = sumarDias(lunesSemana, i);
    const dayObj = state.log[ds] ?? {};
    for (const c of state.courses) {
      weekQ += dayObj[c.id]?.q ?? 0;
    }
  }

  const openErrors = state.errors.filter((e) => e.status === 'abierto').length;
  const totalMinutes = Object.values(state.hours).reduce((a, b) => a + b, 0);

  return { allTimeQ, weekQ, openErrors, totalMinutes };
}

// ---------------------------------------------------------------------------
// Suite de tests
// ---------------------------------------------------------------------------

describe('Mapeo de las 17 causas del v4 a las 5 categorías nuevas', () => {
  it('contiene exactamente las 17 causas del FAIL_TAGS del v4', () => {
    expect(Object.keys(CAUSAS_V4_A_CATEGORIA)).toHaveLength(17);
  });

  it.each([
    ['Concepto', 'teoria'],
    ['No estudié el tema', 'teoria'],
    ['Memoria pura', 'teoria'],
    ['Olvido de fórmula', 'teoria'],
    ['No entendí', 'teoria'],
    ['Leer texto primero', 'lectura'],
    ['Omitir restricciones lógicas', 'lectura'],
    ['Distracción', 'lectura'],
    ['Caer en distractoras', 'lectura'],
    ['Cálculo', 'calculo'],
    ['Mala resolución', 'calculo'],
    ['Prisa', 'tiempo'],
    ['Estuve apurado', 'tiempo'],
    ['Obstinación y mal uso del tiempo', 'tiempo'],
    ['Cambiar respuestas por inseguridad', 'duda'],
    ['Trampa DECO', 'duda'],
    ['Otro', null],
  ] as const)('mapea "%s" → %s', (causaV4, esperado) => {
    expect(mapearCausaV4(causaV4)).toBe(esperado);
  });

  it('tolera diferencias de mayúsculas/tildes y devuelve null para causas desconocidas', () => {
    expect(mapearCausaV4('olvido de formula')).toBe('teoria');
    expect(mapearCausaV4('calculo')).toBe('calculo');
    expect(mapearCausaV4('')).toBeNull();
    expect(mapearCausaV4(null)).toBeNull();
  });
});

describe('Migración del respaldo v4 y paridad exacta de totales', () => {
  let testDb: AureonDB;

  beforeEach(() => {
    testDb = new AureonDB(`test-v4-${Date.now()}-${Math.random()}`);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('reproduce exactamente los mismos totales de preguntas (histórico y semanal) y errores abiertos que mostraba el v4', async () => {
    const v4State = construirRespaldoV4Realista();
    const totalesV4 = calcularTotalesComoV4(v4State, '2026-11-02');

    // Envolvemos bajo la clave real de localStorage 'bitacora-estudio-v4'
    const envoltorio = { [V4_STORAGE_KEY]: JSON.stringify(v4State) };
    const { datos, reporte } = await importarRespaldoV4EnDB(envoltorio, testDb, 1794000000000);

    const practicesEnDB = await testDb.practices.toArray();
    const mistakesEnDB = await testDb.mistakes.toArray();
    const focusEnDB = await testDb.focusSessions.toArray();

    const totalesHistoricosAureon = calcularTotalesPractica(practicesEnDB);
    const totalesSemanalesAureon = totalesPracticaSemana(practicesEnDB, '2026-11-04');
    const conteoErrores = contarErroresPorEstado(mistakesEnDB);
    const minutosEnfoque = calcularMinutosEnfoque(focusEnDB);

    // 1. Paridad exacta de preguntas totales y semanales (incluyendo las editadas en `log`)
    expect(totalesHistoricosAureon.preguntas).toBe(totalesV4.allTimeQ);
    expect(totalesHistoricosAureon.preguntas).toBe(98); // 78 en sesiones + 20 sin detalle en log
    expect(totalesSemanalesAureon.preguntas).toBe(totalesV4.weekQ);
    expect(reporte.importados.preguntasTotales).toBe(totalesV4.allTimeQ);

    // 2. Desglose entre sesiones con detalle y celdas de log "sin detalle"
    expect(totalesHistoricosAureon.conDetalle).toBe(78);
    expect(totalesHistoricosAureon.sinDetalle).toBe(20); // +8 en Química (2026-11-02) y +12 en Física (2026-11-06)
    expect(reporte.importados.practicesDeSesiones).toBe(4);
    expect(reporte.importados.practicesSinDetalleDeLog).toBe(2);

    const sinDetalle = practicesEnDB.filter((p) => p.sinDetalle);
    expect(sinDetalle).toHaveLength(2);
    expect(sinDetalle.every((p) => p.ok === 0 && p.bad === 0)).toBe(true);

    // 3. Paridad exacta de errores abiertos, en repaso (conservando caja y proximoRepaso) y dominados
    expect(conteoErrores.abierto).toBe(totalesV4.openErrors);
    expect(conteoErrores.abierto).toBe(3);
    expect(conteoErrores.repaso).toBe(1);
    expect(conteoErrores.dominado).toBe(1);
    expect(conteoErrores.porClasificar).toBe(1); // el de tag 'Otro'

    const errEnCaja3 = mistakesEnDB.find((m) => m.id === 'err-3');
    expect(errEnCaja3).toMatchObject({
      cursoId: 'fis',
      temaId: 'fis-s02-cinematica-mru-mruv-caida',
      categoria: 'calculo',
      estado: 'repaso',
      caja: 3,
      proximoRepaso: '2026-11-09',
    });

    const errDominado = mistakesEnDB.find((m) => m.id === 'err-4');
    expect(errDominado).toMatchObject({
      cursoId: 'bio',
      categoria: 'duda',
      estado: 'dominado',
      caja: 7,
      proximoRepaso: null,
    });

    // 4. Simulacro importado con porCurso vacío y revisado: true
    expect(datos.simulacros).toHaveLength(1);
    expect(datos.simulacros[0]).toMatchObject({
      id: 'sim-1',
      tipo: 'cepre1',
      porCurso: {},
      revisado: true,
      total: 250.656,
      cursosFlojos: ['fis', 'quim'],
    });

    // 5. topicStatus -> TopicProgress con ids estables
    const progQuim = await testDb.topicProgress.get(['quim', 'quim-s03-enlace-quimico']);
    expect(progQuim?.estado).toBe('dominado');
    const progHv = await testDb.topicProgress.get(['hv', 'hv-s01-tipologia-textual-i']);
    expect(progHv?.estado).toBe('progreso');
    const progBio = await testDb.topicProgress.get(['bio', 'bio-s02-celula-procariota-eucariota']);
    expect(progBio?.estado).toBe('trabajado'); // derivado de la sesión sess-3

    // 6. hours -> FocusSession con modo 'manual'
    expect(focusEnDB).toHaveLength(3);
    expect(focusEnDB.every((f) => f.modo === 'manual')).toBe(true);
    expect(minutosEnfoque).toBe(totalesV4.totalMinutes);
    expect(minutosEnfoque).toBe(365);

    // 7. Settings migrados
    expect(datos.settings).toMatchObject({
      nombre: 'MANUEL',
      carreraId: 'medicina-humana',
      metaPersonal: 1650,
      metaHorasSemana: 28,
      metaPreguntasSemana: 120,
      tema: 'dark-modern',
    });
  });

  it('genera un reporte detallado de elementos descartados y el motivo de cada descarte', () => {
    const v4ConBasura = {
      ...construirRespaldoV4Realista(),
      sessions: [
        ...construirRespaldoV4Realista().sessions,
        { id: 'bad-1', date: 'fecha-rota', courseId: 'c1', ok: 5, bad: 1 },
        { id: 'bad-2', date: '2026-11-02', courseId: 'curso-fantasma', ok: 5, bad: 1 },
        { id: 'bad-3', date: '2026-11-02', courseId: 'c1', ok: 0, bad: 0 },
      ],
      errors: [
        ...construirRespaldoV4Realista().errors,
        { id: 'bad-err', courseId: 'inexistente', tag: 'Concepto', status: 'abierto' },
      ],
      simulacros: [
        ...construirRespaldoV4Realista().simulacros,
        { id: 'bad-sim', date: '2026-12-06', simType: 'cepre99', score: { total: 100 } },
      ],
      topicStatus: {
        'c17|Tema inventado': 'done',
      },
      hours: {
        '2026-11-02': 60,
        'fecha-invalida': 30,
      },
    };

    const { reporte } = transformarRespaldoV4(v4ConBasura);
    const motivos = reporte.descartados.map((d) => `${d.origen}:${d.motivo}`);

    expect(motivos.some((m) => m.startsWith('sessions:Fecha inválida'))).toBe(true);
    expect(motivos.some((m) => m.startsWith('sessions:Curso desconocido'))).toBe(true);
    expect(motivos.some((m) => m.includes('0 preguntas'))).toBe(true);
    expect(motivos.some((m) => m.startsWith('errors:Curso desconocido'))).toBe(true);
    expect(motivos.some((m) => m.startsWith('simulacros:Tipo de simulacro desconocido'))).toBe(
      true,
    );
    expect(
      motivos.some((m) => m.startsWith('topicStatus:Tema no reconocido en el temario oficial')),
    ).toBe(true);
    expect(motivos.some((m) => m.startsWith('hours:Fecha inválida'))).toBe(true);
    expect(reporte.descartados.some((d) => d.origen === 'legacy_ui')).toBe(true);
  });
});

describe('Repositorios tipados, transacciones y Deshacer (Undo)', () => {
  let testDb: AureonDB;

  beforeEach(() => {
    testDb = new AureonDB(`test-repos-${Date.now()}-${Math.random()}`);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('registra una tanda junto con el progreso del tema y recuerda el último curso usado; deshacer revierte ambos', async () => {
    const repos = crearRepositorios(testDb);

    const op = await repos.practices.registrar(
      {
        id: 'p-1',
        ts: 1793635200000,
        fecha: '2026-11-02',
        cursoId: 'quim',
        temaId: 'quim-s03-enlace-quimico',
        ok: 18,
        bad: 2,
        origen: 'tanda',
      },
      {
        cursoId: 'quim',
        temaId: 'quim-s03-enlace-quimico',
        estado: 'trabajado',
        actualizadoEn: 1793635200000,
      },
    );

    expect(await repos.practices.listar()).toHaveLength(1);
    expect((await repos.settings.obtener()).ultimoCursoId).toBe('quim');
    expect(await repos.topicProgress.porCurso('quim')).toHaveLength(1);

    await op.deshacer();

    expect(await repos.practices.listar()).toHaveLength(0);
    expect(await repos.topicProgress.porCurso('quim')).toHaveLength(0);
  });

  it('guarda y deshace errores individuales, lotes de errores y simulacros con errores asociados', async () => {
    const repos = crearRepositorios(testDb);

    const opLote = await repos.mistakes.guardarLote([
      {
        id: 'm-1',
        origen: 'tanda',
        simulacroId: null,
        cursoId: 'fis',
        temaId: 'fis-s01-cantidades-fisicas',
        categoria: 'teoria',
        nota: 'Dimensiones de viscosidad',
        fotoId: null,
        creadoEn: 1000,
        fecha: '2026-11-02',
        estado: 'repaso',
        caja: 2,
        proximoRepaso: '2026-11-04',
        historial: [],
      },
    ]);

    expect(await repos.mistakes.pendientesRepaso('2026-11-04')).toHaveLength(1);
    expect(await repos.mistakes.pendientesRepaso('2026-11-03')).toHaveLength(0);

    await opLote.deshacer();
    expect(await repos.mistakes.listar()).toHaveLength(0);

    const opSim = await repos.simulacros.guardar(
      {
        id: 'sim-a',
        fecha: '2026-12-06',
        ts: 2000,
        tipo: 'cepre1',
        porCurso: {},
        secciones: {
          act: { ok: 0, bad: 0, blanco: 0 },
          hab: { ok: 25, bad: 5, blanco: 0 },
          conoc: { ok: 50, bad: 10, blanco: 10 },
        },
        total: 222.48,
        revisado: true,
      },
      [
        {
          id: 'm-sim-1',
          origen: 'simulacro',
          simulacroId: 'sim-a',
          cursoId: 'quim',
          temaId: null,
          categoria: 'calculo',
          nota: 'Estequiometría de gases',
          fotoId: null,
          creadoEn: 2000,
          fecha: '2026-12-06',
          estado: 'abierto',
          caja: 0,
          proximoRepaso: null,
          historial: [],
        },
      ],
    );

    expect(await repos.simulacros.listar()).toHaveLength(1);
    expect(await repos.mistakes.listarAbiertos()).toHaveLength(1);

    await opSim.deshacer();
    expect(await repos.simulacros.listar()).toHaveLength(0);
    expect(await repos.mistakes.listarAbiertos()).toHaveLength(0);
  });
});

describe('Exportar/importar AUREON (.json), autorrespaldo rotativo (8 copias) y borrar + restaurar', () => {
  let testDb: AureonDB;

  beforeEach(() => {
    testDb = new AureonDB(`test-backup-${Date.now()}-${Math.random()}`);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('ciclo completo: importa v4 → guarda copia → borra todos los datos → restaura desde copia o JSON reproduciendo el estado íntegro', async () => {
    const v4State = construirRespaldoV4Realista();
    await importarRespaldoV4EnDB(v4State, testDb, 1794000000000);

    // 1. Crear autorrespaldo en IndexedDB y exportar JSON manual
    const copiaAuto = await guardarCopiaRotativa(testDb, {
      ahora: 1794000000000,
      motivo: 'pre-restauracion',
    });
    const jsonExportado = await exportarAureonJSON(testDb, {
      marcarDescargaManual: true,
      ahora: 1794000000000,
    });
    const parsedExport = JSON.parse(jsonExportado) as { app: string; version: number };
    expect(parsedExport.app).toBe(AUREON_BACKUP_FORMAT);
    expect(parsedExport.version).toBe(AUREON_BACKUP_VERSION);

    // 2. Borrar todos los datos de estudio
    await testDb.borrarDatosEstudio();
    expect(await testDb.practices.count()).toBe(0);
    expect(await testDb.mistakes.count()).toBe(0);
    expect(await testDb.simulacros.count()).toBe(0);
    expect(await testDb.focusSessions.count()).toBe(0);
    expect(await testDb.topicProgress.count()).toBe(0);

    // 3. Restaurar desde la copia rotativa en IndexedDB
    await restaurarDesdeCopiaAutorrespaldo(copiaAuto.id, testDb);
    const practicesRestauradas = await testDb.practices.toArray();
    const mistakesRestaurados = await testDb.mistakes.toArray();

    expect(calcularTotalesPractica(practicesRestauradas).preguntas).toBe(98);
    expect(contarErroresPorEstado(mistakesRestaurados).abierto).toBe(3);
    expect(await testDb.simulacros.count()).toBe(1);

    // 4. Borrar de nuevo y restaurar desde el archivo .json exportado
    await testDb.borrarDatosEstudio();
    expect(await testDb.practices.count()).toBe(0);

    await importarAureonJSON(jsonExportado, testDb);
    expect(calcularTotalesPractica(await testDb.practices.toArray()).preguntas).toBe(98);
    expect((await testDb.settings.get('default'))?.nombre).toBe('MANUEL');
  });

  it('mantiene como máximo 8 copias semanales rotativas en IndexedDB y no duplica la misma semana', async () => {
    const inicioMs = Date.parse('2026-11-02T15:00:00Z');
    const unDiaMs = 86_400_000;

    // Primera ejecución en la semana del 2026-11-02 crea respaldo
    const primera = await ejecutarAutorrespaldoSemanalSiCorresponde(testDb, inicioMs);
    expect(primera).not.toBeNull();

    // Segunda ejecución en la misma semana no crea duplicado
    const repetida = await ejecutarAutorrespaldoSemanalSiCorresponde(
      testDb,
      inicioMs + 2 * unDiaMs,
    );
    expect(repetida).toBeNull();

    // Avanzar 10 semanas adicionales (total 11 semanas) -> solo deben quedar las 8 más recientes
    for (let sem = 1; sem <= 10; sem++) {
      const creado = await ejecutarAutorrespaldoSemanalSiCorresponde(
        testDb,
        inicioMs + sem * 7 * unDiaMs,
      );
      expect(creado).not.toBeNull();
    }

    const copias = await listarCopiasAutorrespaldo(testDb);
    expect(copias).toHaveLength(MAX_COPIAS_AUTORRESPALDO);
    // La más reciente es la semana 10 (2027-01-11) y la más antigua retenida es la semana 3 (2026-11-23)
    expect(copias[0]?.semanaClave).toBe('2027-01-11');
    expect(copias[MAX_COPIAS_AUTORRESPALDO - 1]?.semanaClave).toBe('2026-11-23');
  });

  it('activa el recordatorio de descarga manual solo cuando pasan más de 14 días (>14d)', async () => {
    const baseMs = Date.parse('2026-11-02T15:00:00Z');
    const unDiaMs = 86_400_000;

    // Base vacía sin datos -> no molesta al usuario nuevo
    expect((await verificarRecordatorioDescargaManual(testDb, baseMs)).debeRecordar).toBe(false);

    // Con datos y nunca descargado -> debe recordar
    await importarRespaldoV4EnDB(construirRespaldoV4Realista(), testDb, baseMs);
    const nunca = await verificarRecordatorioDescargaManual(testDb, baseMs);
    expect(nunca).toEqual({ debeRecordar: true, diasSinDescargar: null, nuncaDescargado: true });

    // Tras exportar manualmente hoy -> 0 días, no recordar
    await exportarAureonJSON(testDb, { marcarDescargaManual: true, ahora: baseMs });
    expect(
      (await verificarRecordatorioDescargaManual(testDb, baseMs + 14 * unDiaMs)).debeRecordar,
    ).toBe(false);

    // A los 15 días (>14 días) -> debe recordar
    const aLos15 = await verificarRecordatorioDescargaManual(testDb, baseMs + 15 * unDiaMs);
    expect(aLos15).toEqual({
      debeRecordar: true,
      diasSinDescargar: 15,
      nuncaDescargado: false,
    });

    // Evaluación pura directa
    expect(
      evaluarRecordatorioDescargaManual(
        {
          id: 'backup-meta',
          ultimaDescargaManualEn: baseMs,
          ultimoAutoBackupEn: null,
          ultimaSemanaAutoBackup: null,
        },
        baseMs + 20 * unDiaMs,
      ).diasSinDescargar,
    ).toBe(20);
  });

  it('solicitarPersistenciaAlmacenamiento invoca navigator.storage.persist() de forma segura', async () => {
    let llamadoPersist = false;
    const resConcedido = await solicitarPersistenciaAlmacenamiento({
      storage: {
        persisted: async () => false,
        persist: async () => {
          llamadoPersist = true;
          return true;
        },
      },
    });
    expect(llamadoPersist).toBe(true);
    expect(resConcedido).toEqual({ soportado: true, persistente: true });

    const resSinSoporte = await solicitarPersistenciaAlmacenamiento({});
    expect(resSinSoporte).toEqual({ soportado: false, persistente: false });
  });

  it('sella uuid/updatedAt/deletedAt en repositorios, genera IDs estables y respalda/deshace fotos de errores en .json', async () => {
    const id1 = generarIdEstable('prac', 1700000000000);
    const id2 = generarIdEstable('prac', 1700000000000);
    expect(id1).not.toBe(id2);
    expect(id1.startsWith('prac-1700000000000-')).toBe(true);

    const repos = crearRepositorios(testDb);
    const opPrac = await repos.practices.registrar({
      id: id1,
      ts: 1700000000000,
      fecha: '2026-11-02',
      cursoId: 'quim',
      temaId: null,
      ok: 12,
      bad: 2,
      origen: 'tanda',
    });

    const practicas = await repos.practices.listar();
    expect(practicas[0]?.uuid).toBe(id1);
    expect(practicas[0]?.updatedAt).toBeGreaterThanOrEqual(1700000000000);
    expect(practicas[0]?.deletedAt).toBeNull();

    // Deshacer práctica también revierte settings (ultimoCursoId)
    await opPrac.deshacer();
    expect((await repos.settings.obtener()).ultimoCursoId).toBeNull();

    // Guardar y deshacer foto de error + incluir foto en backup .json
    const opFoto = await repos.mistakePhotos.guardar({
      id: 'foto-test-1',
      blob: new Blob(['img-bytes'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      miniaturaDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      creadoEn: 1700000000000,
    });
    expect((await repos.mistakePhotos.obtener('foto-test-1'))?.miniaturaDataUrl).toContain(
      'data:image/jpeg',
    );

    const jsonConFoto = await exportarAureonJSON(testDb);
    await testDb.borrarDatosEstudio();
    expect(await repos.mistakePhotos.obtener('foto-test-1')).toBeUndefined();

    await importarAureonJSON(jsonConFoto, testDb);
    expect((await repos.mistakePhotos.obtener('foto-test-1'))?.mimeType).toBe('image/jpeg');

    const opElimFoto = await repos.mistakePhotos.eliminar('foto-test-1');
    expect(await repos.mistakePhotos.obtener('foto-test-1')).toBeUndefined();
    await opElimFoto.deshacer();
    expect((await repos.mistakePhotos.obtener('foto-test-1'))?.creadoEn).toBe(1700000000000);
    await opFoto.deshacer();
  });

  it('valida el json enviado por el usuario', async () => {
    const fullUserJson = {
  "app": "aureon-backup",
  "version": 1,
  "exportadoEn": 1793121362596,
  "fechaExportacion": "2026-10-27",
  "datos": {
    "practices": [
      {
        "id": "mvl9rc422f0et",
        "ts": 1792778044178,
        "fecha": "2026-10-23",
        "cursoId": "hm",
        "temaId": null,
        "ok": 20,
        "bad": 0,
        "origen": "tanda"
      },
      {
        "id": "mvlcimixxu3i0",
        "ts": 1792782676617,
        "fecha": "2026-10-23",
        "cursoId": "hm",
        "temaId": null,
        "ok": 10,
        "bad": 0,
        "origen": "tanda"
      },
      {
        "id": "mvloytp6o2blq",
        "ts": 1792803587802,
        "fecha": "2026-10-23",
        "cursoId": "hm",
        "temaId": null,
        "ok": 7,
        "bad": 0,
        "origen": "tanda"
      },
      {
        "id": "mvmipz5g04kfz",
        "ts": 1792853563444,
        "fecha": "2026-10-24",
        "cursoId": "hm",
        "temaId": null,
        "ok": 12,
        "bad": 0,
        "origen": "tanda"
      },
      {
        "id": "mvmume19ik68w",
        "ts": 1792873551501,
        "fecha": "2026-10-24",
        "cursoId": "hm",
        "temaId": null,
        "ok": 10,
        "bad": 0,
        "origen": "tanda"
      },
      {
        "id": "mvmvlmizoixax",
        "ts": 1792875195467,
        "fecha": "2026-10-24",
        "cursoId": "hm",
        "temaId": null,
        "ok": 2,
        "bad": 0,
        "origen": "tanda"
      },
      {
        "id": "mvmyxifejm5tx",
        "ts": 1792880788874,
        "fecha": "2026-10-24",
        "cursoId": "hm",
        "temaId": null,
        "ok": 11,
        "bad": 1,
        "origen": "tanda"
      },
      {
        "id": "mvnaisyzi9nt7",
        "ts": 1792900258091,
        "fecha": "2026-10-24",
        "cursoId": "hm",
        "temaId": "hm-s11-maximos-minimos",
        "ok": 1,
        "bad": 0,
        "origen": "tanda"
      },
      {
        "id": "mvnamgqsvfkd8",
        "ts": 1792900428868,
        "fecha": "2026-10-24",
        "cursoId": "hm",
        "temaId": "hm-s07-inductivo-simple",
        "ok": 1,
        "bad": 0,
        "origen": "tanda"
      },
      {
        "id": "prac-1793052867427-8b230ec7",
        "ts": 1793052867427,
        "fecha": "2026-10-26",
        "cursoId": "hm",
        "temaId": "hm-s01-deductivo-simple",
        "ok": 3,
        "bad": 0,
        "origen": "tanda",
        "uuid": "prac-1793052867427-8b230ec7",
        "updatedAt": 1793052867427,
        "deletedAt": null
      },
      {
        "id": "prac-1793054468123-c4dd58ac",
        "ts": 1793054468123,
        "fecha": "2026-10-26",
        "cursoId": "psic",
        "temaId": "psic-s01-introduccion-psicologia",
        "ok": 10,
        "bad": 1,
        "origen": "tanda",
        "uuid": "prac-1793054468123-c4dd58ac",
        "updatedAt": 1793054468123,
        "deletedAt": null
      },
      {
        "id": "prac-1793055597678-7484024f",
        "ts": 1793055597678,
        "fecha": "2026-10-26",
        "cursoId": "psic",
        "temaId": "psic-s01-introduccion-psicologia",
        "ok": 7,
        "bad": 3,
        "origen": "tanda",
        "uuid": "prac-1793055597678-7484024f",
        "updatedAt": 1793055597678,
        "deletedAt": null
      },
      {
        "id": "prac-1793071334154-0c1d8a3b",
        "ts": 1793071334154,
        "fecha": "2026-10-26",
        "cursoId": "hv",
        "temaId": "hv-s01-tipologia-textual",
        "ok": 10,
        "bad": 5,
        "origen": "tanda",
        "uuid": "prac-1793071334154-0c1d8a3b",
        "updatedAt": 1793071334154,
        "deletedAt": null
      }
    ],
    "mistakes": [
      {
        "id": "err-1793054468123-81755611",
        "origen": "tanda",
        "simulacroId": null,
        "cursoId": "psic",
        "temaId": "psic-s01-introduccion-psicologia",
        "categoria": "teoria",
        "nota": "Fallo registrado en tanda (1 incorrecta)",
        "fotoId": null,
        "creadoEn": 1793054468123,
        "fecha": "2026-10-26",
        "estado": "repaso",
        "caja": 1,
        "proximoRepaso": "2026-10-27",
        "historial": [],
        "uuid": "err-1793054468123-81755611",
        "updatedAt": 1793054468123,
        "deletedAt": null
      },
      {
        "id": "err-1793054520412-1a568ab8",
        "origen": "tanda",
        "simulacroId": null,
        "cursoId": "psic",
        "temaId": "psic-s01-introduccion-psicologia",
        "categoria": "teoria",
        "nota": "Error registrado para repaso",
        "fotoId": "foto-1793054520412-7468f7ef",
        "creadoEn": 1793054520412,
        "fecha": "2026-10-26",
        "estado": "repaso",
        "caja": 1,
        "proximoRepaso": "2026-10-27",
        "historial": [],
        "uuid": "err-1793054520412-1a568ab8",
        "updatedAt": 1793054520412,
        "deletedAt": null
      },
      {
        "id": "err-1793055597678-a051e0bd",
        "origen": "tanda",
        "simulacroId": null,
        "cursoId": "psic",
        "temaId": "psic-s01-introduccion-psicologia",
        "categoria": "teoria",
        "nota": "Fallo registrado en tanda (3 incorrectas)",
        "fotoId": null,
        "creadoEn": 1793055597678,
        "fecha": "2026-10-26",
        "estado": "repaso",
        "caja": 1,
        "proximoRepaso": "2026-10-27",
        "historial": [],
        "uuid": "err-1793055597678-a051e0bd",
        "updatedAt": 1793055597678,
        "deletedAt": null
      },
      {
        "id": "err-1793055762456-bdc65c1d",
        "origen": "tanda",
        "simulacroId": null,
        "cursoId": "psic",
        "temaId": "psic-s01-introduccion-psicologia",
        "categoria": "teoria",
        "nota": "No leí la palabra \"disociada\" en el enunciado II. La psicología clínica es la encargada de atender los desórdenes conductuales y emocionales a nivel de diagnóstico y tratamiento, y está comprendida dentro de la psicología aplicada.",
        "fotoId": "foto-1793055762456-2ed1aa74",
        "creadoEn": 1793055762456,
        "fecha": "2026-10-26",
        "estado": "repaso",
        "caja": 1,
        "proximoRepaso": "2026-10-27",
        "historial": [],
        "uuid": "err-1793055762456-bdc65c1d",
        "updatedAt": 1793055762456,
        "deletedAt": null
      },
      {
        "id": "err-1793055936418-43f325c2",
        "origen": "tanda",
        "simulacroId": null,
        "cursoId": "psic",
        "temaId": "psic-s01-introduccion-psicologia",
        "categoria": "teoria",
        "nota": "En el enunciado II no leí \"de un grupo de niños\" haciendo alusión al grupo exp. siendo ese el método exp.",
        "fotoId": "foto-1793055936418-1237ad00",
        "creadoEn": 1793055936418,
        "fecha": "2026-10-26",
        "estado": "repaso",
        "caja": 1,
        "proximoRepaso": "2026-10-27",
        "historial": [],
        "uuid": "err-1793055936418-43f325c2",
        "updatedAt": 1793055936418,
        "deletedAt": null
      },
      {
        "id": "err-1793056047251-1a972b02",
        "origen": "tanda",
        "simulacroId": null,
        "cursoId": "psic",
        "temaId": "psic-s01-introduccion-psicologia",
        "categoria": "lectura",
        "nota": "No leí bien y no lo analice como se debía",
        "fotoId": "foto-1793056047251-8652acc3",
        "creadoEn": 1793056047251,
        "fecha": "2026-10-26",
        "estado": "repaso",
        "caja": 1,
        "proximoRepaso": "2026-10-27",
        "historial": [],
        "uuid": "err-1793056047251-1a972b02",
        "updatedAt": 1793056047251,
        "deletedAt": null
      },
      {
        "id": "err-1793071334154-cd7635d6",
        "origen": "tanda",
        "simulacroId": null,
        "cursoId": "hv",
        "temaId": "hv-s01-tipologia-textual",
        "categoria": null,
        "nota": "Estoy fallando en inferencia y tema central",
        "fotoId": null,
        "creadoEn": 1793071334154,
        "fecha": "2026-10-26",
        "estado": "repaso",
        "caja": 2,
        "proximoRepaso": "2026-10-29",
        "historial": [
          {
            "fecha": "2026-10-27",
            "ts": 1793078408374,
            "resultado": "ok",
            "cajaAnterior": 1,
            "cajaNueva": 2
          }
        ],
        "uuid": "err-1793071334154-cd7635d6",
        "updatedAt": 1793071334154,
        "deletedAt": null
      },
      {
        "id": "err-1793078983812-2a153b12",
        "origen": "tanda",
        "simulacroId": null,
        "cursoId": "hm",
        "temaId": "hm-s01-deductivo-simple",
        "categoria": "tiempo",
        "nota": "4.  Jenny, Antonia y Diana son duenas de los caballos Bucefalo, Fobos y Pegaso, aunque no necesariamente en ese orden, que participan en una carrera de caballos internacional. Antonia dice: «Si mi caballo hablara y le hubiera puesto el nombre de un satelite, seguramente el me demandaría». Si Antonia felicito a Jenny porque Pegaso ganó la carrera, ¿qué afirmación es correcta?  A) Antonia es dueña de Fobos. B) Diana es dueña de Fobos. C) Antonia no es dueña de Bucéfalo. D) Diana es dueña de Bucéfalo. E) Jenny no es dueña de Pegaso.",
        "fotoId": null,
        "creadoEn": 1793078983812,
        "fecha": "2026-10-27",
        "estado": "abierto",
        "caja": 0,
        "proximoRepaso": null,
        "historial": [],
        "uuid": "err-1793078983812-2a153b12",
        "updatedAt": 1793078983812,
        "deletedAt": null
      },
      {
        "id": "mvjxn0selh9hu",
        "origen": "tanda",
        "simulacroId": null,
        "cursoId": "filo",
        "temaId": "filo-s17-historia-filosofia",
        "categoria": "teoria",
        "nota": "En la *Teoría de la Justicia* de John Rawls, se introduce la herramienta hipotética del 'velo de ignorancia' dentro de la 'posición original'. ¿Cuál es el propósito central de este recurso conceptual?",
        "fotoId": null,
        "creadoEn": 1792697221310,
        "fecha": "2026-10-22",
        "estado": "repaso",
        "caja": 2,
        "proximoRepaso": "2026-10-28",
        "historial": [],
        "causaLegacy": "Concepto"
      },
      {
        "id": "mvjxoicp210tn",
        "origen": "tanda",
        "simulacroId": null,
        "cursoId": "filo",
        "temaId": "filo-s17-historia-filosofia",
        "categoria": "teoria",
        "nota": "Charles Taylor, filofoso comunitarista canadiense, critica la visión liberal procedimental de autores como John Rawls. ¿Cuál es el eje de su teoría sobre la 'política del reconocimiento'?",
        "fotoId": null,
        "creadoEn": 1792697290729,
        "fecha": "2026-10-22",
        "estado": "repaso",
        "caja": 1,
        "proximoRepaso": "2026-10-27",
        "historial": [
          {
            "fecha": "2026-10-26",
            "ts": 1793045225718,
            "resultado": "fail",
            "cajaAnterior": 1,
            "cajaNueva": 1
          }
        ],
        "causaLegacy": "Concepto",
        "uuid": "mvjxoicp210tn",
        "updatedAt": 1793045225718,
        "deletedAt": null
      }
    ],
    "focusSessions": [
      {
        "id": "foc-1793047386836-37a7ff2f",
        "inicio": 1793047386836,
        "fin": 1793052717090,
        "fecha": "2026-10-26",
        "modo": "sprint",
        "cursoId": "hm",
        "tipoTarea": "correccion_errores",
        "minutosEnfoque": 15,
        "fatiga": null,
        "distracciones": 0,
        "completa": true,
        "uuid": "foc-1793047386836-37a7ff2f",
        "updatedAt": 1793052717090,
        "deletedAt": null
      },
      {
        "id": "foc-1793052810883-5096f12b",
        "inicio": 1793052810883,
        "fin": 1793052812386,
        "fecha": "2026-10-26",
        "modo": "sprint",
        "cursoId": "hm",
        "tipoTarea": "correccion_errores",
        "minutosEnfoque": 1,
        "fatiga": null,
        "distracciones": 0,
        "completa": false,
        "uuid": "foc-1793052810883-5096f12b",
        "updatedAt": 1793052812386,
        "deletedAt": null
      },
      {
        "id": "foc-1793053072629-b2bc989a",
        "inicio": 1793053072629,
        "fin": 1793053977088,
        "fecha": "2026-10-26",
        "modo": "sprint",
        "cursoId": "psic",
        "tipoTarea": "repaso",
        "minutosEnfoque": 15,
        "fatiga": null,
        "distracciones": 0,
        "completa": true,
        "uuid": "foc-1793053072629-b2bc989a",
        "updatedAt": 1793053977088,
        "deletedAt": null
      },
      {
        "id": "foc-1793054909623-89f01a0f",
        "inicio": 1793054909623,
        "fin": 1793055510075,
        "fecha": "2026-10-26",
        "modo": "sprint",
        "cursoId": "psic",
        "tipoTarea": "practica_deco",
        "minutosEnfoque": 10,
        "fatiga": null,
        "distracciones": 0,
        "completa": true,
        "uuid": "foc-1793054909623-89f01a0f",
        "updatedAt": 1793055510075,
        "deletedAt": null
      },
      {
        "id": "foc-1793057259438-85adb51c",
        "inicio": 1793057259438,
        "fin": 1793071074825,
        "fecha": "2026-10-26",
        "modo": "sprint",
        "cursoId": "hv",
        "tipoTarea": "practica_deco",
        "minutosEnfoque": 25,
        "fatiga": null,
        "distracciones": 3,
        "completa": true,
        "uuid": "foc-1793057259438-85adb51c",
        "updatedAt": 1793071074825,
        "deletedAt": null
      },
      {
        "id": "v4-hours-2026-10-22",
        "inicio": 1792670400000,
        "fin": 1792731600000,
        "fecha": "2026-10-22",
        "modo": "manual",
        "cursoId": "mix",
        "tipoTarea": "practica_deco",
        "minutosEnfoque": 1020,
        "fatiga": null,
        "distracciones": 0,
        "completa": true
      },
      {
        "id": "v4-hours-2026-10-23",
        "inicio": 1792756800000,
        "fin": 1792775400000,
        "fecha": "2026-10-23",
        "modo": "manual",
        "cursoId": "mix",
        "tipoTarea": "practica_deco",
        "minutosEnfoque": 310,
        "fatiga": null,
        "distracciones": 0,
        "completa": true
      },
      {
        "id": "v4-hours-2026-10-24",
        "inicio": 1792843200000,
        "fin": 1792863000000,
        "fecha": "2026-10-24",
        "modo": "manual",
        "cursoId": "mix",
        "tipoTarea": "practica_deco",
        "minutosEnfoque": 330,
        "fatiga": null,
        "distracciones": 0,
        "completa": true
      }
    ],
    "topicProgress": [
      {
        "cursoId": "alg",
        "temaId": "alg-s01-numeros-reales",
        "estado": "progreso",
        "actualizadoEn": 1793042017426
      },
      {
        "cursoId": "arit",
        "temaId": "arit-s01-logica-proposicional",
        "estado": "progreso",
        "actualizadoEn": 1793042017426
      },
      {
        "cursoId": "geom",
        "temaId": "geom-s04-aplicaciones-congruencia",
        "estado": "progreso",
        "actualizadoEn": 1793042017426
      },
      {
        "cursoId": "geom",
        "temaId": "geom-s05-cuadrilateros",
        "estado": "progreso",
        "actualizadoEn": 1793042017426
      },
      {
        "cursoId": "hm",
        "temaId": "hm-s01-deductivo-simple",
        "estado": "progreso",
        "actualizadoEn": 1793052867427,
        "uuid": "tp:hm:hm-s01-deductivo-simple",
        "updatedAt": 1793052867427,
        "deletedAt": null
      },
      {
        "cursoId": "hm",
        "temaId": "hm-s02-deductivo-compuesto",
        "estado": "progreso",
        "actualizadoEn": 1793042017426
      },
      {
        "cursoId": "hm",
        "temaId": "hm-s03-ordenamiento-informacion",
        "estado": "progreso",
        "actualizadoEn": 1793042017426
      },
      {
        "cursoId": "hm",
        "temaId": "hm-s04-suposicion-verdades",
        "estado": "progreso",
        "actualizadoEn": 1793042017426
      },
      {
        "cursoId": "hm",
        "temaId": "hm-s05-traslados-puntos",
        "estado": "progreso",
        "actualizadoEn": 1793042017426
      },
      {
        "cursoId": "hm",
        "temaId": "hm-s07-inductivo-simple",
        "estado": "trabajado",
        "actualizadoEn": 1792900428868
      },
      {
        "cursoId": "hm",
        "temaId": "hm-s11-maximos-minimos",
        "estado": "trabajado",
        "actualizadoEn": 1792900258091
      },
      {
        "cursoId": "hv",
        "temaId": "hv-s01-tipologia-textual",
        "estado": "trabajado",
        "actualizadoEn": 1793071334154,
        "uuid": "tp:hv:hv-s01-tipologia-textual",
        "updatedAt": 1793071334154,
        "deletedAt": null
      },
      {
        "cursoId": "psic",
        "temaId": "psic-s01-introduccion-psicologia",
        "estado": "trabajado",
        "actualizadoEn": 1793055597678,
        "uuid": "tp:psic:psic-s01-introduccion-psicologia",
        "updatedAt": 1793055597678,
        "deletedAt": null
      }
    ],
    "simulacros": [],
    "settings": {
      "id": "default",
      "nombre": "Manuel",
      "carreraId": "medicina-humana",
      "metaPersonal": null,
      "umbralSeguridad": 85,
      "inicioCiclo": "2026-11-02",
      "fechasEval": {
        "cepre1": "2026-12-06",
        "cepre2": "2027-01-03",
        "cepre3": "2027-02-07",
        "cepre4": "2027-02-28"
      },
      "metaHorasSemana": 40,
      "metaPreguntasSemana": 85,
      "metasCursoSemana": {
        "hv": 30,
        "hm": 60,
        "arit": 36,
        "alg": 20,
        "geom": 30,
        "trig": 20,
        "leng": 40,
        "lit": 40,
        "psic": 60,
        "civ": 40,
        "hperu": 40,
        "huniv": 40,
        "geog": 40,
        "econ": 40,
        "filo": 40,
        "fis": 50,
        "quim": 100,
        "bio": 80,
        "anat": 50
      },
      "tema": "gamificado",
      "ultimoCursoId": "hv",
      "cursosRecientes": [
        "hv",
        "psic",
        "hm"
      ],
      "recursosEnlaces": [
        {
          "id": "rec-boletines",
          "titulo": "Drive de Boletines CEPRE",
          "categoria": "boletines",
          "url": "https://drive.google.com/"
        },
        {
          "id": "rec-solucionarios",
          "titulo": "Carpeta de Solucionarios",
          "categoria": "solucionarios",
          "url": "https://drive.google.com/"
        },
        {
          "id": "rec-simulacros",
          "titulo": "Banco de Simulacros Oficiales",
          "categoria": "simulacros",
          "url": "https://drive.google.com/"
        },
        {
          "id": "rec-1793078526680-7c58c9fa",
          "titulo": "pre",
          "categoria": "boletines",
          "url": "https://drive.google.com/drive/folders/1a4BPNhmi7aWcbiPtrODj4sk4sRqCeEZC"
        }
      ],
      "ultimoCierreDia": "2026-10-26",
      "actualizadoEn": 1793078526680,
      "uuid": "settings:default",
      "updatedAt": 1793078526680,
      "deletedAt": null
    },
    "mistakePhotos": [
      {
        "id": "foto-1793054520412-7468f7ef",
        "mimeType": "image/png",
        "miniaturaDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAArUAAACKCAIAAAA7cSVH",
        "creadoEn": 1793054520412
      }
    ]
  }
};
    await expect(importarAureonJSON(JSON.stringify(fullUserJson), testDb)).resolves.toBeDefined();
  });
});

describe('Migración de esquema Dexie v1 -> v2', () => {
  it('actualiza una base creada en v1 a v2 normalizando invariantes de Mistake', async () => {
    const dbName = `test-upgrade-${Date.now()}`;

    // Abrir como v1 e insertar un error con caja 7 pero estado desincronizado
    const dbV1 = new Dexie(dbName);
    dbV1.version(1).stores({
      practices: 'id, ts, fecha, cursoId, temaId, origen, [fecha+cursoId]',
      mistakes: 'id, creadoEn, cursoId, temaId, categoria, estado, caja, proximoRepaso',
      focusSessions: 'id, inicio, fecha, cursoId, modo, tipoTarea',
      topicProgress: '[cursoId+temaId], cursoId, temaId, estado, actualizadoEn',
      simulacros: 'id, ts, fecha, tipo, revisado',
      settings: 'id',
    });
    await dbV1.open();
    await dbV1.table('mistakes').put({
      id: 'm-dirty',
      origen: 'tanda',
      simulacroId: null,
      cursoId: 'quim',
      temaId: null,
      categoria: 'teoria',
      nota: 'Regla del octeto',
      fotoId: null,
      creadoEn: 1000,
      estado: 'repaso',
      caja: 7,
      proximoRepaso: '2026-12-01',
      historial: [],
    });
    dbV1.close();

    // Abrir con AureonDB (v2): debe ejecutar el upgrade
    const dbV2 = new AureonDB(dbName);
    await dbV2.open();
    const migrado = await dbV2.mistakes.get('m-dirty');
    expect(migrado?.estado).toBe('dominado');
    expect(migrado?.caja).toBe(7);
    expect(migrado?.proximoRepaso).toBeNull();
    await dbV2.delete();

    // Función pura de normalización también cubre estado abierto con caja residual
    const normAbierto = normalizarMistakeMigracion({
      id: 'm-2',
      origen: 'tanda',
      simulacroId: null,
      cursoId: 'hv',
      temaId: null,
      categoria: null,
      nota: '',
      fotoId: null,
      creadoEn: 1,
      estado: 'abierto',
      caja: 0,
      proximoRepaso: '2026-11-10',
      historial: [],
    });
    expect(normAbierto.proximoRepaso).toBeNull();
  });
});
