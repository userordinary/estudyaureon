import { describe, expect, it } from 'vitest';
import {
  areaDeCarrera,
  avanzarFaseCronometroSimulacro,
  calcularEstadoRevisionSimulacro,
  clavesActivasSimulacro,
  compararSimulacroContraReferencias,
  crearCronometroSimulacro3h,
  parsearPegadoRapidoSimulacro,
  preguntasEsperadasPorClave,
  validarYCalcularSimulacroPorCurso,
} from './index';

describe('domain/simulacro — cálculo por tipo, referencias, revisión obligatoria y cronómetro 3 h (PROMPT 7)', () => {
  it('preguntasEsperadasPorClave y clavesActivasSimulacro respetan la estructura de cada evaluación', () => {
    expect(areaDeCarrera('medicina-humana')).toBe('A');
    expect(areaDeCarrera('carrera-inexistente')).toBe('A');
    expect(clavesActivasSimulacro('cepre1')).toHaveLength(19);
    expect(clavesActivasSimulacro('cepre4')).toHaveLength(20);
    expect(clavesActivasSimulacro('admision')).toHaveLength(20);

    expect(preguntasEsperadasPorClave('cepre1', 'A', 'act')).toBe(0);
    expect(preguntasEsperadasPorClave('cepre4', 'A', 'act')).toBe(10);
    expect(preguntasEsperadasPorClave('cepre1', 'A', 'hv')).toBe(15);
    expect(preguntasEsperadasPorClave('cepre4', 'A', 'hv')).toBe(10);
    expect(preguntasEsperadasPorClave('cepre1', 'A', 'quim')).toBe(7);
  });

  it('validarYCalcularSimulacroPorCurso calcula blancos, puntaje por sección/total para cada tipo y detecta excesos', () => {
    // 1.ª CEPRE: +3.00 / -0.168
    const sim1 = validarYCalcularSimulacroPorCurso('cepre1', 'A', {
      hv: { ok: 12, bad: 2 }, // blanco = 1
      hm: { ok: 10, bad: 3 }, // blanco = 2
      quim: { ok: 6, bad: 1 }, // blanco = 0
    });
    expect(sim1.valido).toBe(true);
    expect(sim1.filas.hv.blanco).toBe(1);
    expect(sim1.filas.hm.blanco).toBe(2);
    expect(sim1.puntaje).not.toBeNull();
    // Buenas = 28 * 3 = 84; Malas = 6 * 0.168 = 1.008 -> 82.992
    expect(sim1.puntaje?.total).toBe(82.992);

    // 4.ª CEPRE: +8.00 / -0.450 con Actitudinal
    const sim4 = validarYCalcularSimulacroPorCurso('cepre4', 'A', {
      act: { ok: 9, bad: 1 },
      hv: { ok: 8, bad: 2 },
    });
    expect(sim4.valido).toBe(true);
    expect(sim4.puntaje?.act).toBe(71.55);
    expect(sim4.puntaje?.hab).toBe(63.1);
    expect(sim4.puntaje?.total).toBe(134.65);

    // Exceso de capacidad en un curso (Química tiene 7 preguntas en Área A; ingresamos 6 ok + 3 bad = 9 > 7)
    const invalido = validarYCalcularSimulacroPorCurso('cepre1', 'A', {
      quim: { ok: 6, bad: 3 },
    });
    expect(invalido.valido).toBe(false);
    expect(invalido.clavesConError).toContain('quim');
    expect(invalido.puntaje).toBeNull();
  });

  it('parsearPegadoRapidoSimulacro convierte una fila de números en pares ok/bad por curso', () => {
    const claves = clavesActivasSimulacro('cepre1');
    const pegado = parsearPegadoRapidoSimulacro('14\t1\t13\t2\t4\t0', claves);
    expect(pegado.hv).toEqual({ ok: 14, bad: 1 });
    expect(pegado.hm).toEqual({ ok: 13, bad: 2 });
    expect(pegado.arit).toEqual({ ok: 4, bad: 0 });
  });

  it('compararSimulacroContraReferencias suma el acumulado de forma DIRECTA y calcula la brecha exacta', () => {
    const comp = compararSimulacroContraReferencias({
      tipo: 'cepre2',
      puntaje: 320,
      carreraId: 'medicina-humana',
      metaPersonal: null,
      simulacrosGuardados: [
        { tipo: 'cepre1', total: 250 },
        { tipo: 'cepre2', total: 320 },
      ],
    });

    // Suma directa: 250 + 320 = 570 (sin multiplicar por porcentajes)
    expect(comp.acumulado.total).toBe(570);
    // Corte acumulado de Medicina Humana: 1626.342 -> brecha = 1626.342 - 570 = 1056.342
    expect(comp.objetivoCiclo.total).toBe(1626.342);
    expect(comp.brechaCiclo).toBe(1056.342);
    expect(comp.ultimoPuestoEval).toBe(315.95);
    expect(comp.diferenciaUltimoEval).toBe(4.05);
  });

  it('calcularEstadoRevisionSimulacro impide marcar "revisado" si faltan incorrectas o hay errores sin categoría', () => {
    const porCurso = {
      quim: { ok: 5, bad: 2 },
      fis: { ok: 4, bad: 1 },
    };

    // 1) Sin errores clasificados aún -> faltan 3, listoParaMarcarRevisado = false
    const rev0 = calcularEstadoRevisionSimulacro(porCurso, []);
    expect(rev0.totalIncorrectas).toBe(3);
    expect(rev0.totalFaltan).toBe(3);
    expect(rev0.listoParaMarcarRevisado).toBe(false);

    // 2) Se agregan 3 errores pero uno tiene categoria === null -> NO permite marcar revisado
    const revSinCat = calcularEstadoRevisionSimulacro(porCurso, [
      { cursoId: 'quim', categoria: 'teoria' },
      { cursoId: 'quim', categoria: null },
      { cursoId: 'fis', categoria: 'calculo' },
    ]);
    expect(revSinCat.erroresSinCategoria).toBe(1);
    expect(revSinCat.listoParaMarcarRevisado).toBe(false);

    // 3) Los 3 errores tienen categoría obligatoria asignada -> listoParaMarcarRevisado = true
    const revCompleta = calcularEstadoRevisionSimulacro(porCurso, [
      { cursoId: 'quim', categoria: 'teoria' },
      { cursoId: 'quim', categoria: 'lectura' },
      { cursoId: 'fis', categoria: 'calculo' },
    ]);
    expect(revCompleta.totalFaltan).toBe(0);
    expect(revCompleta.erroresSinCategoria).toBe(0);
    expect(revCompleta.listoParaMarcarRevisado).toBe(true);
  });

  it('cronómetro de 3 h transiciona por marca de tiempo entre bloque1 (90m), pausa (5m), bloque2 (90m) y completado', () => {
    const t0 = 1_710_000_000_000;
    const b1 = crearCronometroSimulacro3h(t0);
    expect(b1.fase).toBe('bloque1');
    expect(b1.duracionFaseMs).toBe(90 * 60_000);

    const pausa = avanzarFaseCronometroSimulacro(b1, t0 + 90 * 60_000);
    expect(pausa.fase).toBe('pausa');
    expect(pausa.duracionFaseMs).toBe(5 * 60_000);

    const b2 = avanzarFaseCronometroSimulacro(pausa, t0 + 95 * 60_000);
    expect(b2.fase).toBe('bloque2');
    expect(b2.duracionFaseMs).toBe(90 * 60_000);

    const fin = avanzarFaseCronometroSimulacro(b2, t0 + 185 * 60_000);
    expect(fin.fase).toBe('completado');
    expect(fin.inicioTramoMs).toBeNull();
  });
});
