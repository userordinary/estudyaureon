import { describe, expect, it } from 'vitest';
import { CARRERAS, CURSOS, PESOS_AREA, REGLAS_EVALUACION, TEMARIO, temasDeCurso } from './index';
import { AREAS, CURSO_IDS, CURSOS_CONOCIMIENTOS, type BloqueId } from '../tipos';

describe('pesos-area.json', () => {
  it.each(AREAS)('el área %s reparte exactamente 70 preguntas de Conocimientos', (area) => {
    const suma = Object.values(PESOS_AREA[area]).reduce((s, n) => s + n, 0);
    expect(suma).toBe(70);
  });

  it.each(AREAS)(
    'el área %s cubre los 17 cursos de Conocimientos y no incluye HV ni HM',
    (area) => {
      const cursos = Object.keys(PESOS_AREA[area]).sort();
      expect(cursos).toEqual([...CURSOS_CONOCIMIENTOS].sort());
      expect(cursos).not.toContain('hv');
      expect(cursos).not.toContain('hm');
    },
  );
});

describe('cursos.json', () => {
  it('tiene los 19 cursos (HV, HM y 17 de Conocimientos) con ids únicos', () => {
    expect(CURSOS).toHaveLength(19);
    expect(new Set(CURSOS.map((c) => c.id)).size).toBe(19);
    expect(CURSOS.map((c) => c.id).sort()).toEqual([...CURSO_IDS].sort());
  });

  it('agrupa los cursos en los bloques del radar', () => {
    const por = (b: BloqueId): string[] => CURSOS.filter((c) => c.bloque === b).map((c) => c.id);
    expect(por('aptitud')).toEqual(['hv', 'hm']);
    expect(por('matematica')).toEqual(['arit', 'alg', 'geom', 'trig']);
    expect(por('letras')).toEqual([
      'leng',
      'lit',
      'psic',
      'civ',
      'hperu',
      'huniv',
      'geog',
      'econ',
      'filo',
    ]);
    expect(por('ciencias')).toEqual(['fis', 'quim', 'bio', 'anat']);
  });

  it('solo HV y HM pertenecen a la sección Habilidades', () => {
    const hab = CURSOS.filter((c) => c.seccion === 'habilidades').map((c) => c.id);
    expect(hab).toEqual(['hv', 'hm']);
  });
});

describe('temario.json', () => {
  it('tiene ids estables y únicos con el formato curso-sNN-slug', () => {
    expect(new Set(TEMARIO.map((t) => t.id)).size).toBe(TEMARIO.length);
    for (const t of TEMARIO) {
      expect(t.id.startsWith(`${t.cursoId}-s${String(t.semana).padStart(2, '0')}-`)).toBe(true);
    }
  });

  it('incluye el id de ejemplo del PROMPT 0 (Química S3 · Enlace químico)', () => {
    const t = TEMARIO.find((x) => x.id === 'quim-s03-enlace-quimico');
    expect(t).toMatchObject({ cursoId: 'quim', semana: 3, titulo: 'Enlace químico' });
  });

  it('marca todo el temario como verificado según la guía oficial 2026-II', () => {
    expect(TEMARIO.every((t) => t.verificado === true)).toBe(true);
  });

  it('cada curso tiene temas y sus semanas están entre 1 y 15 sin repetirse', () => {
    for (const id of CURSO_IDS) {
      const temas = temasDeCurso(id);
      expect(temas.length).toBeGreaterThan(0);
      const semanas = temas.map((t) => t.semana);
      expect(new Set(semanas).size).toBe(semanas.length);
      expect(semanas.every((s) => s >= 1 && s <= 15)).toBe(true);
    }
  });
});

describe('carreras.json', () => {
  it('tiene ids únicos e incluye Medicina Humana (área A)', () => {
    expect(new Set(CARRERAS.map((c) => c.id)).size).toBe(CARRERAS.length);
    expect(CARRERAS.find((c) => c.id === 'medicina-humana')?.area).toBe('A');
  });

  it('cepreFirst y cepreLast vienen juntos (ambos oficiales o ambos ausentes)', () => {
    for (const c of CARRERAS) expect(c.cepreFirst === null).toBe(c.cepreLast === null);
  });

  it('el total de cepreLast coincide con la suma de las 4 evaluaciones salvo las discrepancias conocidas del legacy', () => {
    const discrepancias = CARRERAS.filter((c) => c.cepreLast !== null)
      .filter((c) => {
        const [a, b, d, e, total] = c.cepreLast ?? [0, 0, 0, 0, 0];
        return Math.round((a + b + d + e) * 1000) !== Math.round(total * 1000);
      })
      .map((c) => c.id);
    expect(discrepancias).toEqual([
      'ciencia-de-la-computacion',
      'arquitectura-y-urbanismo',
      'ingenieria-mecanica-de-fluidos',
    ]);
  });
});

describe('reglas-evaluacion.json', () => {
  it('las 4 evaluaciones CEPRE suman 2000 puntos', () => {
    const { cepre1, cepre2, cepre3, cepre4 } = REGLAS_EVALUACION;
    expect(cepre1.max + cepre2.max + cepre3.max + cepre4.max).toBe(2000);
  });

  it('cada regla es coherente: buena × preguntas = máximo y las secciones suman 100', () => {
    for (const r of Object.values(REGLAS_EVALUACION)) {
      expect(r.buena * r.preguntas).toBe(r.max);
      expect(r.actitudinal + r.hv + r.hm).toBeLessThan(r.preguntas);
      expect(r.preguntas - r.actitudinal - r.hv - r.hm).toBe(70);
    }
  });

  it('HV y HM valen 15+15 en las evaluaciones 1–3 y 10+10 en la 4.ª y la admisión', () => {
    for (const k of ['cepre1', 'cepre2', 'cepre3'] as const) {
      expect(REGLAS_EVALUACION[k]).toMatchObject({ hv: 15, hm: 15, actitudinal: 0 });
    }
    for (const k of ['cepre4', 'admision'] as const) {
      expect(REGLAS_EVALUACION[k]).toMatchObject({ hv: 10, hm: 10, actitudinal: 10 });
    }
  });
});
