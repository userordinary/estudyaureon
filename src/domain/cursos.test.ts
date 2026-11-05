import { describe, expect, it } from 'vitest';
import {
  estadoTemaAlRegistrarPractica,
  evaluarSugerenciaDominado,
  filtrarTemasCurso,
  metaSemanalCursoEfectiva,
  temasDeCurso,
} from './index';

describe('domain/cursos — estados de tema, sugerencia de dominado y filtros (PROMPT 6)', () => {
  it('estadoTemaAlRegistrarPractica pasa de pendiente a trabajado y respeta progreso/dominado', () => {
    expect(estadoTemaAlRegistrarPractica(undefined)).toBe('trabajado');
    expect(estadoTemaAlRegistrarPractica(null)).toBe('trabajado');
    expect(estadoTemaAlRegistrarPractica('pendiente')).toBe('trabajado');
    expect(estadoTemaAlRegistrarPractica('trabajado')).toBe('trabajado');
    expect(estadoTemaAlRegistrarPractica('progreso')).toBe('progreso');
    expect(estadoTemaAlRegistrarPractica('dominado')).toBe('dominado');
  });

  it('evaluarSugerenciaDominado sugiere "dominado" (sin aplicarlo) solo con >= 85 % en >= 20 preguntas y 0 errores abiertos', () => {
    // Caso exacto en el borde: 17 buenas y 3 malas = 20 preguntas, 85.0 %, 0 errores abiertos -> sugiere
    const bordeExacto = evaluarSugerenciaDominado({
      estadoActual: 'trabajado',
      ok: 17,
      bad: 3,
      erroresAbiertos: 0,
    });
    expect(bordeExacto.sugerir).toBe(true);
    expect(bordeExacto.totalPreguntas).toBe(20);
    expect(bordeExacto.precisionPorcentaje).toBe(85);

    // Menos de 20 preguntas (19 buenas, 0 malas = 100 % pero 19 preguntas) -> NO sugiere
    const pocasPreguntas = evaluarSugerenciaDominado({
      estadoActual: 'progreso',
      ok: 19,
      bad: 0,
      erroresAbiertos: 0,
    });
    expect(pocasPreguntas.sugerir).toBe(false);
    expect(pocasPreguntas.cumplePreguntas).toBe(false);

    // Precisión < 85 % (16 buenas, 4 malas = 20 preguntas, 80 %) -> NO sugiere
    const bajaPrecision = evaluarSugerenciaDominado({
      estadoActual: 'trabajado',
      ok: 16,
      bad: 4,
      erroresAbiertos: 0,
    });
    expect(bajaPrecision.sugerir).toBe(false);
    expect(bajaPrecision.cumplePrecision).toBe(false);

    // Con errores abiertos del tema (> 0) -> NO sugiere aunque tenga 95 % en 20 preguntas
    const conErrores = evaluarSugerenciaDominado({
      estadoActual: 'trabajado',
      ok: 19,
      bad: 1,
      erroresAbiertos: 1,
    });
    expect(conErrores.sugerir).toBe(false);
    expect(conErrores.cumpleSinErrores).toBe(false);

    // Si ya está en 'dominado' -> NO vuelve a sugerir
    const yaDominado = evaluarSugerenciaDominado({
      estadoActual: 'dominado',
      ok: 25,
      bad: 0,
      erroresAbiertos: 0,
    });
    expect(yaDominado.sugerir).toBe(false);
  });

  it('filtrarTemasCurso aplica los filtros "hasta_evaluacion", "todas_18" y "solo_pendientes"', () => {
    const temasQuim = temasDeCurso('quim');
    expect(temasQuim).toHaveLength(15);

    // Hasta evaluación actual: cepre1 cubre S1–S4
    const hastaEval1 = filtrarTemasCurso(temasQuim, 'hasta_evaluacion', 'cepre1', {});
    expect(hastaEval1).toHaveLength(4);
    expect(hastaEval1.every((t) => t.semana <= 4)).toBe(true);

    // Las 15 semanas (filtro 'todas_18' devuelve el catálogo completo de 15 semanas)
    const todas = filtrarTemasCurso(temasQuim, 'todas_18', 'cepre1', {});
    expect(todas).toHaveLength(15);

    // Solo pendientes: si marcamos S1 y S2 como trabajados/dominados, quedan 13 pendientes
    const estados = {
      [temasQuim[0]?.id ?? '']: 'trabajado' as const,
      [temasQuim[1]?.id ?? '']: 'dominado' as const,
    };
    const pendientes = filtrarTemasCurso(temasQuim, 'solo_pendientes', 'cepre1', estados);
    expect(pendientes).toHaveLength(13);
  });

  it('metaSemanalCursoEfectiva respeta la meta personalizada o deriva una por peso', () => {
    expect(metaSemanalCursoEfectiva('quim', 'A', 'cepre1', { quim: 45 })).toBe(45);
    expect(metaSemanalCursoEfectiva('quim', 'A', 'cepre1', {})).toBe(28); // peso 7 * 4
  });
});
