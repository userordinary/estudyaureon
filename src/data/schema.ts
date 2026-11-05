/**
 * Esquemas Zod y tipos del modelo de eventos persistente de AUREON.
 * Todo número del producto se deriva de estos eventos; nunca se guardan totales precalculados.
 */
import { z } from 'zod';
import {
  CICLO_POR_DEFECTO,
  CURSO_IDS,
  esFechaISO,
  TIPOS_EVAL,
  type ClavePorCurso,
} from '../domain';

export const fechaISOSchema = z.string().refine(esFechaISO, {
  message: 'Fecha inválida (se espera YYYY-MM-DD)',
});

/** Curso oficial o 'mix' para tandas/sesiones multitema heredadas o generales. */
export const CURSO_O_MIX_IDS = [...CURSO_IDS, 'mix'] as const;
export type CursoOMixId = (typeof CURSO_O_MIX_IDS)[number];
export const cursoOMixIdSchema = z.enum(CURSO_O_MIX_IDS);

export const cursoIdSchema = z.enum(CURSO_IDS);

/**
 * Categorías y grupos de errores según PROMPT 0:
 * - teoria = "Falta de teoría" (cognitivo)
 * - lectura = "Mala lectura de la premisa" (procedimental)
 * - duda = "Duda entre dos alternativas" (mixto)
 * - calculo = "Error de cálculo" (procedimental)
 * - tiempo = "Falta de tiempo" (procedimental)
 * Un error con categoria === null está "por clasificar".
 */
export const CATEGORIAS_ERROR = ['teoria', 'lectura', 'duda', 'calculo', 'tiempo'] as const;
export type CategoriaError = (typeof CATEGORIAS_ERROR)[number];
export const categoriaErrorSchema = z.enum(CATEGORIAS_ERROR);

export const GRUPOS_ERROR = ['cognitivo', 'procedimental', 'mixto'] as const;
export type GrupoError = (typeof GRUPOS_ERROR)[number];

export interface InfoCategoriaError {
  etiqueta: string;
  grupo: GrupoError;
  consejo: string;
}

export const CATALOGO_CATEGORIAS_ERROR: Readonly<Record<CategoriaError, InfoCategoriaError>> = {
  teoria: {
    etiqueta: 'Falta de teoría',
    grupo: 'cognitivo',
    consejo: 'Repasa el concepto clave en el boletín y explícalo en una frase propia.',
  },
  lectura: {
    etiqueta: 'Mala lectura de la premisa',
    grupo: 'procedimental',
    consejo: 'Subraya NO, EXCEPTO o la condición límite antes de mirar las alternativas.',
  },
  duda: {
    etiqueta: 'Duda entre dos alternativas',
    grupo: 'mixto',
    consejo: 'Busca la palabra que invalida al distractor y no cambies sin evidencia.',
  },
  calculo: {
    etiqueta: 'Error de cálculo',
    grupo: 'procedimental',
    consejo: 'Verifica signos, unidades y el último paso algebraico por escrito.',
  },
  tiempo: {
    etiqueta: 'Falta de tiempo',
    grupo: 'procedimental',
    consejo: 'Si en 40 s no ves ruta clara, marca y salta para asegurar puntos rápidos.',
  },
};

// ---------------------------------------------------------------------------
// 1. Practice
// ---------------------------------------------------------------------------

export const ORIGENES_PRACTICA = ['tanda', 'simulacro'] as const;
export type OrigenPractica = (typeof ORIGENES_PRACTICA)[number];

export const practiceSchema = z
  .object({
    id: z.string().min(1),
    ts: z.number().int().nonnegative(),
    fecha: fechaISOSchema,
    cursoId: cursoOMixIdSchema,
    temaId: z.string().min(1).nullable(),
    ok: z.number().int().nonnegative(),
    bad: z.number().int().nonnegative(),
    origen: z.enum(ORIGENES_PRACTICA),
    /**
     * true cuando proviene de celdas editadas a mano en `state.log` del v4 sin sesión asociada.
     * En ese caso `totalSinDetalle` guarda la cantidad de preguntas y `ok = 0`, `bad = 0`.
     */
    sinDetalle: z.boolean().optional(),
    totalSinDetalle: z.number().int().positive().optional(),
    uuid: z.string().min(1).optional(),
    updatedAt: z.number().int().nonnegative().optional(),
    deletedAt: z.number().int().nonnegative().nullable().optional(),
  })
  .refine(
    (p) => (p.sinDetalle ? (p.totalSinDetalle ?? 0) > 0 && p.ok === 0 && p.bad === 0 : true),
    { message: 'Practice sinDetalle requiere totalSinDetalle > 0 y ok=bad=0' },
  );

export type Practice = z.infer<typeof practiceSchema>;

/** Total de preguntas de un registro Practice (incluyendo los importados "sin detalle"). */
export function preguntasDePractice(p: Practice): number {
  return p.sinDetalle ? (p.totalSinDetalle ?? 0) : p.ok + p.bad;
}

// ---------------------------------------------------------------------------
// 2. Mistake
// ---------------------------------------------------------------------------

export const ESTADOS_MISTAKE = ['abierto', 'repaso', 'dominado'] as const;
export type EstadoMistake = (typeof ESTADOS_MISTAKE)[number];

export const RESULTADOS_REPASO = ['ok', 'fail'] as const;
export type ResultadoRepaso = (typeof RESULTADOS_REPASO)[number];

export const historialRepasoItemSchema = z.object({
  fecha: fechaISOSchema,
  ts: z.number().int().nonnegative(),
  resultado: z.enum(RESULTADOS_REPASO),
  cajaAnterior: z.number().int().min(0).max(7),
  cajaNueva: z.number().int().min(0).max(7),
});

export type HistorialRepasoItem = z.infer<typeof historialRepasoItemSchema>;

export const mistakeSchema = z.object({
  id: z.string().min(1),
  origen: z.enum(ORIGENES_PRACTICA),
  simulacroId: z.string().min(1).nullable(),
  cursoId: cursoOMixIdSchema,
  temaId: z.string().min(1).nullable(),
  categoria: categoriaErrorSchema.nullable(),
  nota: z.string(),
  fotoId: z.string().min(1).nullable(),
  creadoEn: z.number().int().nonnegative(),
  fecha: fechaISOSchema.optional(),
  estado: z.enum(ESTADOS_MISTAKE),
  caja: z.number().int().min(0).max(7),
  proximoRepaso: fechaISOSchema.nullable(),
  historial: z.array(historialRepasoItemSchema),
  /** Si es true, el error no entra en la cola de repaso Leitner (ej. errores de comprensión lectora de HV) */
  excluirDeLeitner: z.boolean().optional(),
  /** Causa original del v4 conservada como referencia de auditoría. */
  causaLegacy: z.string().optional(),
  uuid: z.string().min(1).optional(),
  updatedAt: z.number().int().nonnegative().optional(),
  deletedAt: z.number().int().nonnegative().nullable().optional(),
});

export type Mistake = z.infer<typeof mistakeSchema>;

// ---------------------------------------------------------------------------
// 3. FocusSession
// ---------------------------------------------------------------------------

export const MODOS_ENFOQUE = ['sprint', 'inmersion', 'simulacro', 'manual'] as const;
export type ModoEnfoqueEvento = (typeof MODOS_ENFOQUE)[number];

export const TIPOS_TAREA_ENFOQUE = [
  'teoria',
  'practica_deco',
  'correccion_errores',
  'repaso',
] as const;
export type TipoTareaEnfoque = (typeof TIPOS_TAREA_ENFOQUE)[number];

export const fatigaSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const focusSessionSchema = z.object({
  id: z.string().min(1),
  inicio: z.number().int().nonnegative(),
  fin: z.number().int().nonnegative(),
  fecha: fechaISOSchema,
  modo: z.enum(MODOS_ENFOQUE),
  cursoId: cursoOMixIdSchema,
  tipoTarea: z.enum(TIPOS_TAREA_ENFOQUE),
  minutosEnfoque: z.number().int().nonnegative(),
  fatiga: fatigaSchema.nullable(),
  distracciones: z.number().int().nonnegative(),
  completa: z.boolean(),
  uuid: z.string().min(1).optional(),
  updatedAt: z.number().int().nonnegative().optional(),
  deletedAt: z.number().int().nonnegative().nullable().optional(),
});

export type FocusSession = z.infer<typeof focusSessionSchema>;

// ---------------------------------------------------------------------------
// 4. TopicProgress
// ---------------------------------------------------------------------------

export const ESTADOS_TEMA = ['pendiente', 'trabajado', 'progreso', 'dominado'] as const;
export type EstadoTema = (typeof ESTADOS_TEMA)[number];

export const topicProgressSchema = z.object({
  cursoId: cursoIdSchema,
  temaId: z.string().min(1),
  estado: z.enum(ESTADOS_TEMA),
  actualizadoEn: z.number().int().nonnegative(),
  uuid: z.string().min(1).optional(),
  updatedAt: z.number().int().nonnegative().optional(),
  deletedAt: z.number().int().nonnegative().nullable().optional(),
});

export type TopicProgress = z.infer<typeof topicProgressSchema>;

// ---------------------------------------------------------------------------
// 5. Simulacro
// ---------------------------------------------------------------------------

export const respuestasSeccionSimSchema = z.object({
  ok: z.number().int().nonnegative(),
  bad: z.number().int().nonnegative(),
  blanco: z.number().int().nonnegative(),
});

export type RespuestasSeccionSim = z.infer<typeof respuestasSeccionSimSchema>;

export const CLAVES_POR_CURSO = [...CURSO_IDS, 'act'] as const satisfies readonly ClavePorCurso[];

export const simulacroSchema = z.object({
  id: z.string().min(1),
  fecha: fechaISOSchema,
  ts: z.number().int().nonnegative(),
  tipo: z.enum(TIPOS_EVAL),
  porCurso: z.partialRecord(z.enum(CLAVES_POR_CURSO), respuestasSeccionSimSchema),
  secciones: z.object({
    act: respuestasSeccionSimSchema,
    hab: respuestasSeccionSimSchema,
    conoc: respuestasSeccionSimSchema,
  }),
  total: z.number(),
  revisado: z.boolean(),
  /** Cursos marcados como flojos en el simulacro (opcional, heredado del v4). */
  cursosFlojos: z.array(cursoIdSchema).optional(),
  uuid: z.string().min(1).optional(),
  updatedAt: z.number().int().nonnegative().optional(),
  deletedAt: z.number().int().nonnegative().nullable().optional(),
});

export type Simulacro = z.infer<typeof simulacroSchema>;

// ---------------------------------------------------------------------------
// 6. Settings
// ---------------------------------------------------------------------------

export const TEMAS_UI = ['dark-modern', 'gamificado', 'oled', 'clinico'] as const;
export type TemaUI = (typeof TEMAS_UI)[number];
export const TEMA_UI_POR_DEFECTO: TemaUI = 'dark-modern';

export const FUENTES_UI = [
  'sans',
  'geist',
  'jakarta',
  'lexend',
  'mono',
  'space-mono',
  'serif',
  'playfair',
  'redondeada',
  'syne',
  'dislexica',
  'rubik-paint',
  'quicksand',
  'soria',
  'arvo',
] as const;
export type FuenteUI = (typeof FUENTES_UI)[number];
export const FUENTE_UI_POR_DEFECTO: FuenteUI = 'sans';

export const temaPersonalizadoSchema = z.object({
  bg: z.string(),
  surface: z.string(),
  surface2: z.string(),
  border: z.string(),
  text: z.string(),
  textMuted: z.string(),
  accent: z.string(),
  accent2: z.string(),
  transparencia: z.number().min(0.2).max(1),
  rgbArcoiris: z.boolean(),
  fuente: z.enum(FUENTES_UI),
});

export type TemaPersonalizadoConfig = z.infer<typeof temaPersonalizadoSchema>;

export const TEMA_PERSONALIZADO_POR_DEFECTO: TemaPersonalizadoConfig = {
  bg: '#0d1117',
  surface: '#161b22',
  surface2: '#21262d',
  border: '#30363d',
  text: '#f0f6fc',
  textMuted: '#8b949e',
  accent: '#58a6ff',
  accent2: '#bc8cff',
  transparencia: 0.95,
  rgbArcoiris: false,
  fuente: 'sans',
};

export const FONDOS_ANIMADOS = [
  'ninguno',
  'digital-rain',
  'rain-glass',
  'moonlit-ripple',
  'galaxy',
  'threads',
  'metal-esmeralda',
] as const;
export type FondoAnimadoId = (typeof FONDOS_ANIMADOS)[number];
export const FONDO_ANIMADO_POR_DEFECTO: FondoAnimadoId = 'ninguno';

export const fechasEvalSchema = z.object({
  cepre1: fechaISOSchema,
  cepre2: fechaISOSchema,
  cepre3: fechaISOSchema,
  cepre4: fechaISOSchema,
});

export const CATEGORIAS_RECURSO = ['boletines', 'solucionarios', 'simulacros', 'otro'] as const;
export type CategoriaRecurso = (typeof CATEGORIAS_RECURSO)[number];

export const recursoEnlaceSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  categoria: z.enum(CATEGORIAS_RECURSO),
  url: z.string(),
});

export type RecursoEnlace = z.infer<typeof recursoEnlaceSchema>;

export const horarioSemanalSchema = z.object({
  lunes: z.array(cursoIdSchema),
  martes: z.array(cursoIdSchema),
  miercoles: z.array(cursoIdSchema),
  jueves: z.array(cursoIdSchema),
  viernes: z.array(cursoIdSchema),
  sabado: z.array(cursoIdSchema),
  domingo: z.array(cursoIdSchema),
});

export type HorarioSemanal = z.infer<typeof horarioSemanalSchema>;

export const HORARIO_SEMANAL_DEFAULT: HorarioSemanal = {
  lunes: ['hm', 'bio', 'filo'],
  martes: ['arit', 'leng', 'quim'],
  miercoles: ['geom', 'fis', 'hperu'],
  jueves: ['alg', 'lit', 'psic'],
  viernes: ['trig', 'geog', 'civ'],
  sabado: ['hv', 'econ', 'huniv'],
  domingo: [],
};

export const RECURSOS_ENLACES_POR_DEFECTO: readonly RecursoEnlace[] = [
  {
    id: 'rec-boletines',
    titulo: 'Drive de Boletines CEPRE',
    categoria: 'boletines',
    url: 'https://drive.google.com/',
  },
  {
    id: 'rec-solucionarios',
    titulo: 'Carpeta de Solucionarios',
    categoria: 'solucionarios',
    url: 'https://drive.google.com/',
  },
  {
    id: 'rec-simulacros',
    titulo: 'Banco de Simulacros Oficiales',
    categoria: 'simulacros',
    url: 'https://drive.google.com/',
  },
];

export const settingsSchema = z.object({
  id: z.literal('default'),
  nombre: z.string().min(1),
  carreraId: z.string().min(1),
  metaPersonal: z.number().positive().max(2000).nullable(),
  umbralSeguridad: z.number().int().min(1).max(100),
  puntajeMinimoUltimoProceso: z.number().nullable().optional(),
  puntajeMaximoUltimoProceso: z.number().nullable().optional(),
  fechaExamenOrdinario: fechaISOSchema.nullable().optional(),
  tamanoTexto: z.enum(['normal', 'grande', 'extra']).optional(),
  altoContraste: z.boolean().optional(),
  transparenciaTarjetas: z.number().min(0).max(100).optional(),
  inicioCiclo: fechaISOSchema,
  fechasEval: fechasEvalSchema,
  metaHorasSemana: z.number().int().min(1).max(120),
  metaPreguntasSemana: z.number().int().min(1).max(5000),
  metasCursoSemana: z.partialRecord(cursoIdSchema, z.number().int().nonnegative()),
  tema: z.enum(TEMAS_UI),
  temaPersonalizado: temaPersonalizadoSchema.optional(),
  fuente: z.enum(FUENTES_UI).optional(),
  fondoAnimado: z.enum(FONDOS_ANIMADOS).optional(),
  ultimoCursoId: cursoOMixIdSchema.nullable(),
  cursosRecientes: z.array(cursoOMixIdSchema).optional(),
  topeRepasosDia: z.number().int().min(1).max(100).optional(),
  diasGraciaSemana: z.number().int().min(0).max(3).optional(),
  horarioSemanal: horarioSemanalSchema.optional(),
  recursosEnlaces: z.array(recursoEnlaceSchema).optional(),
  ultimoCierreDia: fechaISOSchema.nullable().optional(),
  actualizadoEn: z.number().int().nonnegative(),
  uuid: z.string().min(1).optional(),
  updatedAt: z.number().int().nonnegative().optional(),
  deletedAt: z.number().int().nonnegative().nullable().optional(),
}).passthrough();

export type Settings = z.infer<typeof settingsSchema>;

export const SETTINGS_POR_DEFECTO: Settings = {
  id: 'default',
  nombre: 'ESTUDIANTE',
  carreraId: 'medicina-humana',
  metaPersonal: null,
  umbralSeguridad: 70,
  puntajeMinimoUltimoProceso: null,
  puntajeMaximoUltimoProceso: null,
  fechaExamenOrdinario: null,
  tamanoTexto: 'normal',
  altoContraste: false,
  transparenciaTarjetas: 0,
  inicioCiclo: CICLO_POR_DEFECTO.inicio,
  fechasEval: { ...CICLO_POR_DEFECTO.fechasEval },
  metaHorasSemana: 25,
  metaPreguntasSemana: 85,
  metasCursoSemana: {},
  tema: TEMA_UI_POR_DEFECTO,
  fuente: FUENTE_UI_POR_DEFECTO,
  fondoAnimado: FONDO_ANIMADO_POR_DEFECTO,
  ultimoCursoId: null,
  cursosRecientes: [],
  topeRepasosDia: 15,
  diasGraciaSemana: 1,
  horarioSemanal: { ...HORARIO_SEMANAL_DEFAULT },
  recursosEnlaces: [...RECURSOS_ENLACES_POR_DEFECTO],
  actualizadoEn: 0,
};

/** Registro de foto adjunta a un Mistake (almacenado en IndexedDB con Blob y miniatura). */
export interface MistakePhoto {
  id: string;
  blob: Blob;
  mimeType: string;
  miniaturaDataUrl: string;
  creadoEn: number;
}

export const mistakePhotoSerializedSchema = z.object({
  id: z.string().min(1),
  mimeType: z.string(),
  miniaturaDataUrl: z.string(),
  creadoEn: z.number().int().nonnegative(),
});

export type MistakePhotoSerialized = z.infer<typeof mistakePhotoSerializedSchema>;

// ---------------------------------------------------------------------------
// 7. Respaldo versionado de AUREON y metadatos de autorrespaldo
// ---------------------------------------------------------------------------

export const AUREON_BACKUP_FORMAT = 'aureon-backup' as const;
export const AUREON_BACKUP_VERSION = 1 as const;

export const aureonPayloadSchema = z.object({
  practices: z.array(practiceSchema),
  mistakes: z.array(mistakeSchema),
  focusSessions: z.array(focusSessionSchema),
  topicProgress: z.array(topicProgressSchema),
  simulacros: z.array(simulacroSchema),
  settings: settingsSchema,
  mistakePhotos: z.array(mistakePhotoSerializedSchema).optional(),
}).passthrough();

export type AureonDataPayload = z.infer<typeof aureonPayloadSchema>;

export const aureonExportSchema = z.object({
  app: z.literal(AUREON_BACKUP_FORMAT),
  version: z.literal(AUREON_BACKUP_VERSION),
  exportadoEn: z.number().int().nonnegative(),
  fechaExportacion: fechaISOSchema,
  datos: aureonPayloadSchema,
}).passthrough();

export type AureonExportFile = z.infer<typeof aureonExportSchema>;

export interface AutoBackupEntry {
  id: string;
  semanaClave: string;
  creadoEn: number;
  fecha: string;
  motivo: 'semanal' | 'pre-restauracion' | 'manual';
  snapshot: AureonExportFile;
}

export interface BackupMeta {
  id: 'backup-meta';
  ultimaDescargaManualEn: number | null;
  ultimoAutoBackupEn: number | null;
  ultimaSemanaAutoBackup: string | null;
}

export const BACKUP_META_INICIAL: BackupMeta = {
  id: 'backup-meta',
  ultimaDescargaManualEn: null,
  ultimoAutoBackupEn: null,
  ultimaSemanaAutoBackup: null,
};
