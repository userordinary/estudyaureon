/**
 * Datos de dominio extraídos del legacy, validados con Zod al cargar el módulo.
 * Si un JSON se edita mal, la app falla al iniciar en vez de mostrar números falsos.
 */
import { z } from 'zod';
import {
  AREAS,
  BLOQUES,
  CURSO_IDS,
  CURSOS_CONOCIMIENTOS,
  SECCIONES_CURSO,
  type CursoId,
} from '../tipos';
import cursosJson from './cursos.json';
import temarioJson from './temario.json';
import carrerasJson from './carreras.json';
import pesosAreaJson from './pesos-area.json';
import reglasJson from './reglas-evaluacion.json';

const cursoIdSchema = z.enum(CURSO_IDS);
const areaSchema = z.enum(AREAS);
const enteroNoNeg = z.number().int().nonnegative();

const cursoSchema = z.object({
  id: cursoIdSchema,
  nombre: z.string().min(1),
  bloque: z.enum(BLOQUES),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  seccion: z.enum(SECCIONES_CURSO),
  orden: z.number().int().positive(),
});

const temaSchema = z.object({
  id: z.string().regex(/^[a-z]+-s\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/),
  cursoId: cursoIdSchema,
  semana: z.number().int().min(1).max(18),
  titulo: z.string().min(1),
  verificado: z.boolean(),
});

const serie5Schema = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]);

const carreraSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  nombre: z.string().min(1),
  area: areaSchema,
  admMax: z.number().positive(),
  admMin: z.number().positive(),
  cepreFirst: serie5Schema.nullable(),
  cepreLast: serie5Schema.nullable(),
});

const pesosAreaSchema = z.record(areaSchema, z.record(z.enum(CURSOS_CONOCIMIENTOS), enteroNoNeg));

const reglaSchema = z.object({
  nombre: z.string().min(1),
  semanas: z.tuple([z.number().int().min(1), z.number().int().max(18)]),
  buena: z.number().positive(),
  mala: z.number().positive(),
  max: z.number().int().positive(),
  preguntas: z.number().int().positive(),
  actitudinal: enteroNoNeg,
  hv: enteroNoNeg,
  hm: enteroNoNeg,
});

const reglasSchema = z.object({
  cepre1: reglaSchema,
  cepre2: reglaSchema,
  cepre3: reglaSchema,
  cepre4: reglaSchema,
  admision: reglaSchema,
});

export type Curso = Readonly<z.infer<typeof cursoSchema>>;
export type Tema = Readonly<z.infer<typeof temaSchema>>;
export type Carrera = Readonly<z.infer<typeof carreraSchema>>;
export type PesosArea = Readonly<z.infer<typeof pesosAreaSchema>>;
export type ReglaEvaluacion = Readonly<z.infer<typeof reglaSchema>>;
export type ReglasEvaluacion = Readonly<z.infer<typeof reglasSchema>>;

export const CURSOS: readonly Curso[] = z.array(cursoSchema).parse(cursosJson);
export const TEMARIO: readonly Tema[] = z.array(temaSchema).parse(temarioJson);
export const CARRERAS: readonly Carrera[] = z.array(carreraSchema).parse(carrerasJson);
export const PESOS_AREA: PesosArea = pesosAreaSchema.parse(pesosAreaJson);
export const REGLAS_EVALUACION: ReglasEvaluacion = reglasSchema.parse(reglasJson);

const cursosPorId = new Map<CursoId, Curso>(CURSOS.map((c) => [c.id, c]));

export function cursoPorId(id: CursoId): Curso {
  const c = cursosPorId.get(id);
  if (!c) throw new Error(`Curso desconocido: ${id}`);
  return c;
}

export function temasDeCurso(id: CursoId): readonly Tema[] {
  return TEMARIO.filter((t) => t.cursoId === id);
}
