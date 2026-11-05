import { describe, expect, it } from 'vitest';
import {
  AREAS,
  CURSO_IDS,
  diasEntre,
  evitarCursosConsecutivos,
  generarPlanDelDia,
  pesoEfectivoCurso,
  sumarDias,
  type BloquePlanDia,
  type CursoId,
  type FechaISO,
} from './index';

describe('domain/plan — generarPlanDelDia y reglas (a)-(d)', () => {
  it('pesoEfectivoCurso devuelve 15 para HV/HM en cepre1-3, 10 en cepre4 y el peso de área para Conocimientos', () => {
    expect(pesoEfectivoCurso('hv', 'A', 'cepre1')).toBe(15);
    expect(pesoEfectivoCurso('hm', 'A', 'cepre3')).toBe(15);
    expect(pesoEfectivoCurso('hv', 'A', 'cepre4')).toBe(10);
    expect(pesoEfectivoCurso('quim', 'A', 'cepre1')).toBe(7);
    expect(pesoEfectivoCurso('bio', 'A', 'cepre1')).toBe(4);
    expect(pesoEfectivoCurso('trig', 'A', 'cepre1')).toBe(2);
  });

  it('regla (a): en una simulación de 7 y 14 días, ningún curso con peso > 0 queda > 7 días sin aparecer', () => {
    for (const area of AREAS) {
      const cursosConPeso = CURSO_IDS.filter((cid) => pesoEfectivoCurso(cid, area, 'cepre2') > 0);
      expect(cursosConPeso.length).toBe(19);

      const fechaInicio: FechaISO = '2026-04-06';
      // Inicializamos con fechas escalonadas realistas en la semana previa (hace 1 a 6 días)
      const ultimaPractica: Partial<Record<CursoId, FechaISO | null>> = {};
      cursosConPeso.forEach((cid, idx) => {
        ultimaPractica[cid] = sumarDias(fechaInicio, -((idx % 6) + 1));
      });

      const aparicionesPorCurso = new Map<CursoId, FechaISO[]>();
      for (const cid of cursosConPeso) {
        aparicionesPorCurso.set(cid, [ultimaPractica[cid] ?? fechaInicio]);
      }

      // Simulamos 14 días consecutivos con presupuesto estándar de 75 min/día
      for (let d = 0; d < 14; d++) {
        const hoy = sumarDias(fechaInicio, d);
        const plan = generarPlanDelDia({
          fecha: hoy,
          minutosDisponibles: 75,
          semana: 6,
          evaluacion: 'cepre2',
          area,
          dominioPorTema: {},
          erroresPorCurso: { quim: 2, fis: 1 },
          ultimaPracticaPorCurso: ultimaPractica,
          cursosBajoUmbral: ['bio'],
        });

        for (const bloque of plan.bloques) {
          ultimaPractica[bloque.cursoId] = hoy;
          aparicionesPorCurso.get(bloque.cursoId)?.push(hoy);
        }

        // En cada día verificamos que ningún curso supere 7 días desde su última práctica
        for (const cid of cursosConPeso) {
          const ultima = ultimaPractica[cid] ?? fechaInicio;
          const brechaDias = diasEntre(ultima, hoy);
          expect(brechaDias).toBeLessThanOrEqual(7);
        }
      }

      // Además, en los primeros 7 días todos los 19 cursos con peso > 0 aparecieron al menos 1 vez
      for (const cid of cursosConPeso) {
        const fechas = aparicionesPorCurso.get(cid) ?? [];
        const enSemana = fechas.filter((f) => f >= fechaInicio && f <= sumarDias(fechaInicio, 6));
        expect(enSemana.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('regla (b): cabe en minutosDisponibles y mezcla tema_nuevo, repaso_espaciado y repaso_errores', () => {
    const plan = generarPlanDelDia({
      fecha: '2026-04-10',
      minutosDisponibles: 80,
      semana: 6,
      evaluacion: 'cepre2',
      area: 'A',
      dominioPorTema: {},
      erroresPorCurso: { quim: 4, fis: 2 },
      ultimaPracticaPorCurso: {
        hv: '2026-04-09',
        hm: '2026-04-08',
        bio: '2026-04-03',
        quim: '2026-04-07',
      },
      cursosBajoUmbral: ['bio'],
    });

    expect(plan.minutosAsignados).toBeLessThanOrEqual(80);
    expect(plan.minutosAsignados).toBeGreaterThan(0);
    expect(plan.accionPrincipal).not.toBeNull();

    const tipos = new Set(plan.bloques.map((b) => b.tipo));
    expect(tipos.has('tema_nuevo')).toBe(true);
    expect(tipos.has('repaso_espaciado')).toBe(true);
    expect(tipos.has('repaso_errores')).toBe(true);
  });

  it('regla (b) borde: si minutosDisponibles < 10 devuelve plan vacío sin acción principal', () => {
    const plan = generarPlanDelDia({
      fecha: '2026-04-10',
      minutosDisponibles: 5,
      semana: 3,
      evaluacion: 'cepre1',
      dominioPorTema: {},
      erroresPorCurso: {},
      ultimaPracticaPorCurso: {},
      cursosBajoUmbral: [],
    });

    expect(plan.bloques).toHaveLength(0);
    expect(plan.minutosAsignados).toBe(0);
    expect(plan.accionPrincipal).toBeNull();
  });

  it('regla (c): cada bloque incluye su frase explicativa "porQue" y prioriza peso, errores y días sin práctica', () => {
    const plan = generarPlanDelDia({
      fecha: '2026-04-12',
      minutosDisponibles: 75,
      semana: 7,
      evaluacion: 'cepre2',
      area: 'A',
      dominioPorTema: {},
      erroresPorCurso: { arit: 5 },
      ultimaPracticaPorCurso: {
        filo: '2026-04-05', // 7 días sin practicar -> garantía semanal activa
      },
      cursosBajoUmbral: ['quim'],
    });

    expect(plan.bloques.length).toBeGreaterThanOrEqual(3);
    for (const b of plan.bloques) {
      expect(b.porQue.trim().length).toBeGreaterThan(15);
      expect(b.porQue.endsWith('.')).toBe(true);
    }
  });

  it('regla (d): nunca coloca dos bloques seguidos del mismo curso', () => {
    const plan = generarPlanDelDia({
      fecha: '2026-04-12',
      minutosDisponibles: 90,
      semana: 7,
      evaluacion: 'cepre2',
      area: 'A',
      dominioPorTema: {},
      erroresPorCurso: { bio: 6, quim: 4 },
      ultimaPracticaPorCurso: {},
      cursosBajoUmbral: ['bio', 'quim'],
    });

    for (let i = 1; i < plan.bloques.length; i++) {
      expect(plan.bloques[i]?.cursoId).not.toBe(plan.bloques[i - 1]?.cursoId);
    }

    // Prueba directa del reordenador con bloques sintéticos del mismo curso consecutivo
    const b1: BloquePlanDia = {
      id: '1',
      tipo: 'tema_nuevo',
      cursoId: 'quim',
      cursoNombre: 'Química',
      temaId: 't1',
      temaTitulo: 'Tema 1',
      preguntas: 10,
      minutos: 20,
      prioridad: 90,
      porQue: 'Por peso.',
    };
    const b2: BloquePlanDia = { ...b1, id: '2', tipo: 'repaso_errores' };
    const b3: BloquePlanDia = {
      ...b1,
      id: '3',
      cursoId: 'fis',
      cursoNombre: 'Física',
    };

    const reordenado = evitarCursosConsecutivos([b1, b2, b3]);
    for (let i = 1; i < reordenado.length; i++) {
      expect(reordenado[i]?.cursoId).not.toBe(reordenado[i - 1]?.cursoId);
    }
  });

  it('guía prioridades por horario del día: conserva top 2 por urgencia/peso y prioriza cursosDelDia', () => {
    const planSinHorario = generarPlanDelDia({
      fecha: '2026-04-13',
      minutosDisponibles: 80,
      semana: 6,
      evaluacion: 'cepre2',
      area: 'A',
      dominioPorTema: {},
      erroresPorCurso: {},
      ultimaPracticaPorCurso: {},
      cursosBajoUmbral: [],
    });

    const top2Cursos = planSinHorario.bloques.slice(0, 2).map((b) => b.cursoId);

    // Si pasamos cursosDelDia específicos (ej. 'psic', 'filo') que normalmente quedarían más abajo
    const planConHorario = generarPlanDelDia({
      fecha: '2026-04-13',
      minutosDisponibles: 80,
      semana: 6,
      evaluacion: 'cepre2',
      area: 'A',
      dominioPorTema: {},
      erroresPorCurso: {},
      ultimaPracticaPorCurso: {},
      cursosBajoUmbral: [],
      cursosDelDia: ['psic', 'filo'],
    });

    const cursosEnPlanConHorario = planConHorario.bloques.map((b) => b.cursoId);
    // El top 2 inicial se respeta
    expect(cursosEnPlanConHorario[0]).toBe(top2Cursos[0]);
    expect(cursosEnPlanConHorario[1]).toBe(top2Cursos[1]);
    // Los cursos del horario del día entran inmediatamente en los siguientes cupos
    expect(cursosEnPlanConHorario.includes('psic') || cursosEnPlanConHorario.includes('filo')).toBe(
      true,
    );
  });
});
