import { describe, expect, it } from 'vitest';
import {
  calcularAutopsiaErrores,
  calcularDatosRadarDominio,
  construirDatosCurvaAcumulacion,
  evaluarReglaR1,
  evaluarReglaR2,
  evaluarReglaR3,
  evaluarReglaR4,
  evaluarReglaR5,
  generarAccionesInmediatas,
} from './accion';
import { generarPlanDelDia } from './plan';
import { CURSOS, TEMARIO, temasDeCurso } from './data';
import type { CursoId } from './tipos';

describe('src/domain/accion — Reglas R1 a R5 (con y sin datos suficientes)', () => {
  it('R1: sin datos suficientes (< 10 preguntas en cualquier curso) devuelve aviso "Faltan datos" sin inventar', () => {
    const r1 = evaluarReglaR1({
      area: 'A',
      umbralSeguridad: 70,
      practices: [{ fecha: '2026-04-10', cursoId: 'bio', temaId: null, ok: 2, bad: 4 }],
      mistakes: [],
    });

    expect(r1.esFaltanDatos).toBe(true);
    expect(r1.regla).toBe('FALTAN_DATOS');
    expect(r1.texto).toContain('Faltan datos: registra 4 preguntas más en Biología');
  });

  it('R1: con datos suficientes (>= 10 preguntas) y bajo el umbral prioriza el curso de mayor peso e indica el tema con más errores', () => {
    const temasBio = temasDeCurso('bio');
    const temaS1 = temasBio[0]?.id ?? 'bio-s01';
    const temaS3 = temasBio[2]?.id ?? 'bio-s03';

    const r1 = evaluarReglaR1({
      area: 'A', // Biología tiene peso 10 en Área A; Historia del Perú tiene peso 3
      umbralSeguridad: 70,
      practices: [
        { fecha: '2026-04-10', cursoId: 'bio', temaId: temaS1, ok: 5, bad: 7 }, // 41.7% (<70%), 12 preg
        { fecha: '2026-04-10', cursoId: 'hperu', temaId: null, ok: 4, bad: 8 }, // 33.3% (<70%), 12 preg, menor peso
      ],
      mistakes: [
        {
          fecha: '2026-04-09',
          cursoId: 'bio',
          temaId: temaS3,
          categoria: 'teoria',
          estado: 'abierto',
        },
        {
          fecha: '2026-04-10',
          cursoId: 'bio',
          temaId: temaS3,
          categoria: 'teoria',
          estado: 'abierto',
        },
        {
          fecha: '2026-04-10',
          cursoId: 'bio',
          temaId: temaS1,
          categoria: 'lectura',
          estado: 'abierto',
        },
      ],
    });

    expect(r1.esFaltanDatos).toBe(false);
    expect(r1.regla).toBe('R1');
    expect(r1.cursoId).toBe('bio');
    expect(r1.temaId).toBe(temaS3);
    expect(r1.texto).toContain('Enfócate en Biología, tema con más errores:');
    expect(r1.texto).toContain('S3');
  });

  it('R2: sin datos suficientes (< 30 preguntas en cualquiera de las dos ventanas de 14 días) devuelve "Faltan datos"', () => {
    const r2 = evaluarReglaR2({
      fechaHoy: '2026-04-28',
      practices: [
        { fecha: '2026-04-05', cursoId: 'arit', temaId: null, ok: 15, bad: 5 }, // 20 preg en v1 (<30)
        { fecha: '2026-04-25', cursoId: 'arit', temaId: null, ok: 20, bad: 15 }, // 35 preg en v2 (>=30)
      ],
    });

    expect(r2.esFaltanDatos).toBe(true);
    expect(r2.regla).toBe('FALTAN_DATOS');
    expect(r2.texto).toContain('Faltan datos: registra 10 preguntas más en Aritmética');
    expect(r2.texto).toContain('ventanas de 14 días');
  });

  it('R2: detecta caída >= 8 puntos entre dos ventanas de 14 días con >= 30 preguntas en cada una', () => {
    const r2 = evaluarReglaR2({
      fechaHoy: '2026-04-28',
      practices: [
        // Ventana 1 (2026-04-01 a 2026-04-14): 32/40 = 80%
        { fecha: '2026-04-05', cursoId: 'alg', temaId: null, ok: 32, bad: 8 },
        // Ventana 2 (2026-04-15 a 2026-04-28): 24/40 = 60% -> caída de 20 puntos (>= 8)
        { fecha: '2026-04-22', cursoId: 'alg', temaId: null, ok: 24, bad: 16 },
      ],
    });

    expect(r2.esFaltanDatos).toBe(false);
    expect(r2.regla).toBe('R2');
    expect(r2.cursoId).toBe('alg');
    expect(r2.texto).toContain('Aviso de caída: Álgebra bajó 20 puntos de efectividad (80% → 60%)');
  });

  it('R3: sin >= 3 h (180 min) y >= 30 preguntas en la semana devuelve "Faltan datos"', () => {
    const r3 = evaluarReglaR3({
      fechaHoy: '2026-04-15',
      practices: [{ fecha: '2026-04-14', cursoId: 'quim', temaId: null, ok: 10, bad: 5 }],
      focusSessions: [{ fecha: '2026-04-14', cursoId: 'quim', minutosEnfoque: 100 }],
    });

    expect(r3.esFaltanDatos).toBe(true);
    expect(r3.regla).toBe('FALTAN_DATOS');
    expect(r3.texto).toContain('Faltan datos: registra 15 preguntas más en Química');
  });

  it('R3: con >= 3 h de enfoque y >= 30 preguntas en la semana + caída >= 8 puntos recomienda revisar método de estudio', () => {
    // 2026-04-15 es miércoles (lunes de esa semana = 2026-04-13)
    const r3 = evaluarReglaR3({
      fechaHoy: '2026-04-15',
      practices: [
        // Semana previa (< 2026-04-13): 18/20 = 90%
        { fecha: '2026-04-08', cursoId: 'fis', temaId: null, ok: 18, bad: 2 },
        // Semana actual (>= 2026-04-13): 21/30 = 70% (caída 20 pts >= 8, 30 preg >= 30)
        { fecha: '2026-04-14', cursoId: 'fis', temaId: null, ok: 21, bad: 9 },
      ],
      focusSessions: [
        { fecha: '2026-04-13', cursoId: 'fis', minutosEnfoque: 90 },
        { fecha: '2026-04-14', cursoId: 'fis', minutosEnfoque: 100 }, // 190 min >= 180 min
      ],
    });

    expect(r3.esFaltanDatos).toBe(false);
    expect(r3.regla).toBe('R3');
    expect(r3.cursoId).toBe('fis');
    expect(r3.texto).toContain('Revisa tu método de estudio en Física');
  });

  it('R4: sin suficientes errores clasificados (< 5) devuelve "Faltan datos"', () => {
    const r4 = evaluarReglaR4({
      mistakes: [
        {
          fecha: '2026-04-10',
          cursoId: 'hv',
          temaId: null,
          categoria: 'lectura',
          estado: 'abierto',
        },
        { fecha: '2026-04-10', cursoId: 'hv', temaId: null, categoria: null, estado: 'abierto' },
      ],
    });

    expect(r4.esFaltanDatos).toBe(true);
    expect(r4.regla).toBe('FALTAN_DATOS');
    expect(r4.texto).toContain('Faltan datos: registra 4 error(es) clasificado(s) más');
  });

  it('R4: cuando la categoría "lectura" domina los errores recientes emite la recomendación de lectura de enunciados', () => {
    const r4 = evaluarReglaR4({
      mistakes: [
        {
          fecha: '2026-04-10',
          cursoId: 'hv',
          temaId: null,
          categoria: 'lectura',
          estado: 'abierto',
        },
        {
          fecha: '2026-04-11',
          cursoId: 'leng',
          temaId: null,
          categoria: 'lectura',
          estado: 'abierto',
        },
        {
          fecha: '2026-04-12',
          cursoId: 'bio',
          temaId: null,
          categoria: 'lectura',
          estado: 'abierto',
        },
        {
          fecha: '2026-04-12',
          cursoId: 'arit',
          temaId: null,
          categoria: 'calculo',
          estado: 'abierto',
        },
        {
          fecha: '2026-04-13',
          cursoId: 'fis',
          temaId: null,
          categoria: 'teoria',
          estado: 'abierto',
        },
      ],
    });

    expect(r4.esFaltanDatos).toBe(false);
    expect(r4.regla).toBe('R4');
    expect(r4.texto).toContain('subraya NO, EXCEPTO');
  });

  it('R5: sin curso con >= 20 preguntas y >= 90 % devuelve "Faltan datos"', () => {
    const r5 = evaluarReglaR5({
      fechaHoy: '2026-04-15',
      practices: [{ fecha: '2026-04-10', cursoId: 'hv', temaId: null, ok: 10, bad: 0 }],
    });

    expect(r5.esFaltanDatos).toBe(true);
    expect(r5.regla).toBe('FALTAN_DATOS');
    expect(r5.texto).toContain('Faltan datos: registra 10 preguntas más en Habilidad Verbal');
  });

  it('R5: un curso dominado (>= 90 % en >= 20 preguntas) nunca se abandona: sugiere bloque de repaso mínimo semanal', () => {
    const r5 = evaluarReglaR5({
      fechaHoy: '2026-04-15',
      practices: [
        { fecha: '2026-04-08', cursoId: 'civ', temaId: null, ok: 23, bad: 2 }, // 92%, 25 preg
      ],
    });

    expect(r5.esFaltanDatos).toBe(false);
    expect(r5.regla).toBe('R5');
    expect(r5.cursoId).toBe('civ');
    expect(r5.texto).toContain('No abandones Cívica (92% de efectividad)');
    expect(r5.texto).toContain('ningún curso quede sin aparecer');
  });

  it('generarAccionesInmediatas devuelve máximo 3 acciones y comparte motor con la acción principal de "Hoy"', () => {
    const dominioPorTema: Record<string, number> = {};
    for (const t of TEMARIO) dominioPorTema[t.id] = 20;
    const erroresPorCurso = Object.fromEntries(CURSOS.map((c) => [c.id, 0])) as Record<
      CursoId,
      number
    >;
    erroresPorCurso.bio = 3;
    const ultimaPracticaPorCurso = Object.fromEntries(CURSOS.map((c) => [c.id, null])) as Record<
      CursoId,
      string | null
    >;

    const planHoy = generarPlanDelDia({
      fecha: '2026-04-15',
      minutosDisponibles: 90,
      semana: 3,
      evaluacion: 'cepre1',
      dominioPorTema,
      erroresPorCurso,
      ultimaPracticaPorCurso,
      cursosBajoUmbral: ['bio'],
    });

    const acciones = generarAccionesInmediatas({
      fechaHoy: '2026-04-15',
      area: 'A',
      umbralSeguridad: 70,
      practices: [
        { fecha: '2026-04-12', cursoId: 'bio', temaId: null, ok: 5, bad: 10 }, // Activa R1
        { fecha: '2026-04-08', cursoId: 'civ', temaId: null, ok: 24, bad: 1 }, // Activa R5
      ],
      mistakes: [
        {
          fecha: '2026-04-14',
          cursoId: 'bio',
          temaId: null,
          categoria: 'lectura',
          estado: 'abierto',
        },
      ],
      focusSessions: [],
      planDelDia: planHoy,
    });

    expect(acciones.length).toBeLessThanOrEqual(3);
    expect(acciones[0]?.regla).toBe('PLAN_HOY');
    expect(acciones[0]?.cursoId).toBe(planHoy.accionPrincipal?.cursoId ?? null);
    expect(acciones.some((a) => a.regla === 'R1')).toBe(true);
    expect(acciones.some((a) => a.regla === 'R5')).toBe(true);
  });
});

describe('src/domain/accion — Selectores de gráficos de Comando (Curva, Radar, Autopsia)', () => {
  it('construirDatosCurvaAcumulacion calcula los 4 puntos CEPRE, la brecha exacta y rotula corte estimado cuando aplica', () => {
    // Medicina Humana es corte oficial
    const curvaMed = construirDatosCurvaAcumulacion({
      carreraId: 'medicina-humana',
      metaPersonal: 1700,
      simulacros: [
        { tipo: 'cepre1', total: 240.5 },
        { tipo: 'cepre2', total: 310.25 },
      ],
    });

    expect(curvaMed.puntos).toHaveLength(4);
    expect(curvaMed.acumuladoTotal).toBe(550.75);
    expect(curvaMed.puntos[0]?.acumuladoReal).toBe(240.5);
    expect(curvaMed.puntos[1]?.acumuladoReal).toBe(550.75);
    expect(curvaMed.puntos[2]?.acumuladoReal).toBeNull();
    expect(curvaMed.puntos[3]?.lineaRequerida).toBe(1626.342);
    expect(curvaMed.puntos[3]?.lineaMetaPersonal).toBe(1700);
    expect(curvaMed.esCorteEstimado).toBe(false);

    // Carrera con corte estimado (Obstetricia tiene cepreLast null)
    const curvaEst = construirDatosCurvaAcumulacion({
      carreraId: 'obstetricia',
      metaPersonal: null,
      simulacros: [],
    });
    expect(curvaEst.esCorteEstimado).toBe(true);
  });

  it('calcularDatosRadarDominio indica faltan datos cuando no hay suficientes simulacros o práctica', () => {
    const radarVacioSim = calcularDatosRadarDominio({
      fuente: 'simulacros',
      fechaHoy: '2026-04-15',
      carreraId: 'medicina-humana',
      umbralSeguridad: 70,
      simulacros: [],
      practices: [],
    });
    expect(radarVacioSim.datosSuficientes).toBe(false);
    expect(radarVacioSim.mensajeFaltanDatos).toContain('Faltan datos');

    const radarVacioPrac = calcularDatosRadarDominio({
      fuente: 'practica_30d',
      fechaHoy: '2026-04-15',
      carreraId: 'medicina-humana',
      umbralSeguridad: 70,
      simulacros: [],
      practices: [{ fecha: '2026-04-14', cursoId: 'bio', temaId: null, ok: 5, bad: 5 }],
    });
    expect(radarVacioPrac.datosSuficientes).toBe(false);
    expect(radarVacioPrac.mensajeFaltanDatos).toContain('registra 10 preguntas más');
  });

  it('calcularDatosRadarDominio calcula efectividad de los 4 bloques y marca ejes/cursos bajo el umbral (< 70%)', () => {
    const radar = calcularDatosRadarDominio({
      fuente: 'practica_30d',
      fechaHoy: '2026-04-15',
      carreraId: 'medicina-humana',
      umbralSeguridad: 70,
      simulacros: [],
      practices: [
        // Aptitud: 18/20 = 90% (>= 70%)
        { fecha: '2026-04-10', cursoId: 'hv', temaId: null, ok: 18, bad: 2 },
        // Ciencias: 5/20 = 25% (< 70%)
        { fecha: '2026-04-11', cursoId: 'bio', temaId: null, ok: 5, bad: 15 },
      ],
    });

    expect(radar.datosSuficientes).toBe(true);
    expect(radar.ejes).toHaveLength(4);
    const ejeAptitud = radar.ejes.find((e) => e.bloque === 'aptitud');
    const ejeCiencias = radar.ejes.find((e) => e.bloque === 'ciencias');
    expect(ejeAptitud?.efectividad).toBe(90);
    expect(ejeAptitud?.bajoUmbral).toBe(false);
    expect(ejeCiencias?.efectividad).toBe(25);
    expect(ejeCiencias?.bajoUmbral).toBe(true);
  });

  it('calcularAutopsiaErrores distribuye por categoría y por grupo (Cognitivo/Procedimental/Mixto) y separa "por clasificar"', () => {
    const errores = [
      {
        fecha: '2026-04-14',
        cursoId: 'bio' as const,
        temaId: null,
        categoria: 'teoria' as const,
        estado: 'abierto' as const,
      },
      {
        fecha: '2026-04-14',
        cursoId: 'bio' as const,
        temaId: null,
        categoria: 'lectura' as const,
        estado: 'abierto' as const,
      },
      {
        fecha: '2026-04-14',
        cursoId: 'fis' as const,
        temaId: null,
        categoria: 'calculo' as const,
        estado: 'abierto' as const,
      },
      {
        fecha: '2026-04-14',
        cursoId: 'hv' as const,
        temaId: null,
        categoria: 'duda' as const,
        estado: 'abierto' as const,
      },
      {
        fecha: '2026-04-14',
        cursoId: 'hv' as const,
        temaId: null,
        categoria: null,
        estado: 'abierto' as const,
      },
    ];

    const porCat = calcularAutopsiaErrores({
      mistakes: errores,
      agrupacion: 'categoria',
      periodo: '30d',
      cursoFiltro: 'todos',
      fechaHoy: '2026-04-15',
    });
    expect(porCat.totalClasificados).toBe(4);
    expect(porCat.porClasificar).toBe(1);
    expect(porCat.segmentos).toHaveLength(5);

    const porGrupo = calcularAutopsiaErrores({
      mistakes: errores,
      agrupacion: 'grupo',
      periodo: '30d',
      cursoFiltro: 'todos',
      fechaHoy: '2026-04-15',
    });
    expect(porGrupo.segmentos).toHaveLength(3);
    expect(porGrupo.segmentos.find((s) => s.clave === 'cognitivo')?.cantidad).toBe(1);
    expect(porGrupo.segmentos.find((s) => s.clave === 'procedimental')?.cantidad).toBe(2);
    expect(porGrupo.segmentos.find((s) => s.clave === 'mixto')?.cantidad).toBe(1);
  });
});
