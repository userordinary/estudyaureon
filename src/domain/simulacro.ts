/**
 * Reglas puras del dominio para `simulacros` (PROMPT 7):
 * - Preguntas esperadas por curso según tipo (1.ª–4.ª CEPRE o Admisión) y área (A–E)
 * - Validación en vivo por curso, cálculo automático de blancos y puntaje por sección/total
 * - Parseo de pegado rápido de fila/tabla de números
 * - Comparación contra último puesto, primer puesto y meta personal de esa evaluación + acumulado directo y brecha
 * - Invariante de revisión de errores: pasa a `revisado: true` únicamente cuando todas las incorrectas están clasificadas con categoría obligatoria
 * - Cronómetro de simulacro de 3 h (Bloque 1 [90m] → Pausa [5m] → Bloque 2 [90m]) por marca de tiempo
 */
import {
  acumuladoReal,
  brecha,
  objetivoTotal,
  type AcumuladoReal,
  type Objetivo,
} from './acumulado';
import { buscarCarrera, referenciasDeCarrera } from './benchmarks';
import { PESOS_AREA, REGLAS_EVALUACION } from './data';
import { aMilesimas, deMilesimas, redondear3 } from './redondeo';
import {
  calcularPuntaje,
  seccionesDesdePorCurso,
  type ClavePorCurso,
  type PorCurso,
  type ResultadoPuntaje,
} from './scoring';
import { CURSO_IDS, type AreaId, type CursoId, type TipoEval } from './tipos';

/**
 * Devuelve las claves activas en la tabla por curso para un tipo de simulacro:
 * - En `cepre4` y `admision`: incluye `'act'` (10 preg) + los 19 cursos.
 * - En `cepre1`, `cepre2` y `cepre3`: los 19 cursos (`actitudinal = 0`).
 */
export function clavesActivasSimulacro(tipo: TipoEval): ClavePorCurso[] {
  const regla = REGLAS_EVALUACION[tipo];
  if (regla.actitudinal > 0) {
    return ['act', ...CURSO_IDS];
  }
  return [...CURSO_IDS];
}

/**
 * Cantidad exacta de preguntas esperadas para una clave (`'act'` o `CursoId`)
 * según la estructura del tipo de evaluación y el peso del curso en el área.
 */
export function preguntasEsperadasPorClave(
  tipo: TipoEval,
  area: AreaId,
  clave: ClavePorCurso,
): number {
  const regla = REGLAS_EVALUACION[tipo];
  if (clave === 'act') return regla.actitudinal;
  if (clave === 'hv') return regla.hv;
  if (clave === 'hm') return regla.hm;
  return PESOS_AREA[area][clave] ?? 0;
}

export interface FilaValidadaSimulacro {
  clave: ClavePorCurso;
  esperadas: number;
  ok: number;
  bad: number;
  blanco: number;
  excedeCapacidad: boolean;
}

export interface SeccionesCompletasSimulacro {
  act: { ok: number; bad: number; blanco: number };
  hab: { ok: number; bad: number; blanco: number };
  conoc: { ok: number; bad: number; blanco: number };
}

export interface ValidacionSimulacroPorCurso {
  valido: boolean;
  filas: Record<ClavePorCurso, FilaValidadaSimulacro>;
  clavesConError: ClavePorCurso[];
  porCurso: Record<ClavePorCurso, { ok: number; bad: number; blanco: number }>;
  secciones: SeccionesCompletasSimulacro;
  puntaje: ResultadoPuntaje | null;
}

/**
 * Valida en vivo las respuestas `ok` y `bad` por curso contra el total de preguntas de cada curso,
 * calcula automáticamente los blancos y obtiene el puntaje por sección y total.
 */
export function validarYCalcularSimulacroPorCurso(
  tipo: TipoEval,
  area: AreaId,
  entrada: Readonly<Partial<Record<ClavePorCurso, { ok: number; bad: number }>>>,
): ValidacionSimulacroPorCurso {
  const todasLasClaves: readonly ClavePorCurso[] = ['act', ...CURSO_IDS];
  const filas = {} as Record<ClavePorCurso, FilaValidadaSimulacro>;
  const porCurso = {} as Record<ClavePorCurso, { ok: number; bad: number; blanco: number }>;
  const clavesConError: ClavePorCurso[] = [];

  for (const clave of todasLasClaves) {
    const esperadas = preguntasEsperadasPorClave(tipo, area, clave);
    const raw = entrada[clave];
    const ok = raw ? Math.max(0, Math.trunc(raw.ok)) : 0;
    const bad = raw ? Math.max(0, Math.trunc(raw.bad)) : 0;
    const excedeCapacidad =
      !Number.isInteger(ok) || !Number.isInteger(bad) || ok < 0 || bad < 0 || ok + bad > esperadas;
    const blanco = excedeCapacidad ? 0 : Math.max(0, esperadas - ok - bad);

    filas[clave] = {
      clave,
      esperadas,
      ok,
      bad,
      blanco,
      excedeCapacidad,
    };

    if (esperadas > 0 || ok > 0 || bad > 0) {
      porCurso[clave] = { ok, bad, blanco };
    }
    if (excedeCapacidad) {
      clavesConError.push(clave);
    }
  }

  const valido = clavesConError.length === 0;
  const porCursoParaScoring: PorCurso = {};
  for (const [k, v] of Object.entries(porCurso)) {
    porCursoParaScoring[k as ClavePorCurso] = { ok: v.ok, bad: v.bad, blanco: v.blanco };
  }

  const secBase = seccionesDesdePorCurso(porCursoParaScoring);
  const secciones: SeccionesCompletasSimulacro = {
    act: {
      ok: secBase.act?.ok ?? 0,
      bad: secBase.act?.bad ?? 0,
      blanco: Math.max(
        0,
        REGLAS_EVALUACION[tipo].actitudinal - (secBase.act?.ok ?? 0) - (secBase.act?.bad ?? 0),
      ),
    },
    hab: {
      ok: secBase.hab.ok,
      bad: secBase.hab.bad,
      blanco: Math.max(
        0,
        REGLAS_EVALUACION[tipo].hv + REGLAS_EVALUACION[tipo].hm - secBase.hab.ok - secBase.hab.bad,
      ),
    },
    conoc: {
      ok: secBase.conoc.ok,
      bad: secBase.conoc.bad,
      blanco: Math.max(0, 70 - secBase.conoc.ok - secBase.conoc.bad),
    },
  };

  const puntaje = valido ? calcularPuntaje(tipo, { porCurso: porCursoParaScoring }) : null;

  return {
    valido,
    filas,
    clavesConError,
    porCurso,
    secciones,
    puntaje,
  };
}

/**
 * Permite pegar una fila o tabla de números (`ok bad ok bad ...`) para llenar rápidamente la tabla por curso.
 */
export function parsearPegadoRapidoSimulacro(
  texto: string,
  clavesOrdenadas: readonly ClavePorCurso[],
): Partial<Record<ClavePorCurso, { ok: number; bad: number }>> {
  const numeros = (texto.match(/\d+/g) ?? []).map((n) => Number.parseInt(n, 10));
  const resultado: Partial<Record<ClavePorCurso, { ok: number; bad: number }>> = {};

  for (let i = 0; i < clavesOrdenadas.length; i++) {
    const clave = clavesOrdenadas[i];
    const ok = numeros[i * 2];
    const bad = numeros[i * 2 + 1];
    if (clave && ok !== undefined) {
      resultado[clave] = {
        ok: Math.max(0, ok),
        bad: bad !== undefined ? Math.max(0, bad) : 0,
      };
    }
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Comparación contra referencias de carrera, meta personal, acumulado y brecha
// ---------------------------------------------------------------------------

export interface ComparacionSimulacro {
  tipo: TipoEval;
  puntaje: number;
  /** Referencia del último puesto con vacante en ESTA evaluación. */
  ultimoPuestoEval: number;
  /** Referencia del primer puesto en ESTA evaluación. */
  primerPuestoEval: number;
  /** Meta personal correspondiente a ESTA evaluación. */
  metaPersonalEval: number;
  /** Diferencia exacta: puntaje − ultimoPuestoEval (positiva = supera el corte). */
  diferenciaUltimoEval: number;
  /** Diferencia exacta: puntaje − primerPuestoEval. */
  diferenciaPrimeroEval: number;
  /** Diferencia exacta: puntaje − metaPersonalEval. */
  diferenciaMetaEval: number;
  /** Acumulado real CEPRE (SUMA DIRECTA de las 4 evaluaciones, mejor intento por tipo). */
  acumulado: AcumuladoReal;
  /** Objetivo total del ciclo (meta personal o corte acumulado). */
  objetivoCiclo: Objetivo;
  /** Brecha exacta restante para alcanzar el objetivo del ciclo (`objetivo - acumulado.total`). */
  brechaCiclo: number;
  /** `true` si la carrera tiene corte oficial CEPRE; `false` si se deriva por estimación. */
  esCorteOficial: boolean;
}

const INDICE_SERIE5: Readonly<Record<TipoEval, 0 | 1 | 2 | 3 | 4>> = {
  cepre1: 0,
  cepre2: 1,
  cepre3: 2,
  cepre4: 3,
  admision: 4,
};

export function compararSimulacroContraReferencias(params: {
  tipo: TipoEval;
  puntaje: number;
  carreraId: string;
  metaPersonal: number | null;
  simulacrosGuardados: readonly { tipo: TipoEval; total: number }[];
}): ComparacionSimulacro {
  const { tipo, puntaje, carreraId, metaPersonal, simulacrosGuardados } = params;
  const refs = referenciasDeCarrera(carreraId);
  const idx = INDICE_SERIE5[tipo];

  const ultimoPuestoEval = refs.ultimo[idx];
  const primerPuestoEval = refs.primero[idx];

  const maxEval = REGLAS_EVALUACION[tipo].max;
  const metaPersonalEval =
    metaPersonal !== null
      ? tipo === 'admision'
        ? redondear3(metaPersonal)
        : redondear3(metaPersonal * (maxEval / 2000))
      : ultimoPuestoEval;

  const diferenciaUltimoEval = deMilesimas(aMilesimas(puntaje) - aMilesimas(ultimoPuestoEval));
  const diferenciaPrimeroEval = deMilesimas(aMilesimas(puntaje) - aMilesimas(primerPuestoEval));
  const diferenciaMetaEval = deMilesimas(aMilesimas(puntaje) - aMilesimas(metaPersonalEval));

  const acumulado = acumuladoReal(simulacrosGuardados);
  const objetivoCiclo = objetivoTotal(carreraId, metaPersonal);
  const brechaCiclo = brecha(acumulado.total, objetivoCiclo);

  return {
    tipo,
    puntaje: redondear3(puntaje),
    ultimoPuestoEval,
    primerPuestoEval,
    metaPersonalEval,
    diferenciaUltimoEval,
    diferenciaPrimeroEval,
    diferenciaMetaEval,
    acumulado,
    objetivoCiclo,
    brechaCiclo,
    esCorteOficial: refs.esOficial,
  };
}

export function areaDeCarrera(carreraId: string): AreaId {
  try {
    return buscarCarrera(carreraId).area;
  } catch {
    return 'A';
  }
}

// ---------------------------------------------------------------------------
// Revisión de errores del simulacro (invariante de `revisado: true`)
// ---------------------------------------------------------------------------

export interface PendienteClasificacionCurso {
  cursoId: CursoId;
  incorrectas: number;
  clasificadas: number;
  faltan: number;
}

export interface EstadoRevisionSimulacro {
  pendientesPorCurso: PendienteClasificacionCurso[];
  totalIncorrectas: number;
  totalClasificadas: number;
  totalFaltan: number;
  erroresSinCategoria: number;
  /**
   * `true` únicamente cuando TODAS las respuestas incorrectas de los cursos tienen su
   * `Mistake` asociado con categoría no nula y no existe ningún error sin categoría.
   */
  listoParaMarcarRevisado: boolean;
}

export function calcularEstadoRevisionSimulacro(
  porCurso: Readonly<Partial<Record<ClavePorCurso, { ok: number; bad: number }>>>,
  erroresDelSimulacro: readonly { cursoId: string; categoria: string | null }[],
): EstadoRevisionSimulacro {
  const pendientesPorCurso: PendienteClasificacionCurso[] = [];
  let totalIncorrectas = 0;
  let totalClasificadas = 0;
  let totalFaltan = 0;

  const erroresSinCategoria = erroresDelSimulacro.filter((e) => e.categoria === null).length;

  for (const cid of CURSO_IDS) {
    const fila = porCurso[cid];
    const incorrectas = Math.max(0, Math.trunc(fila?.bad ?? 0));
    if (incorrectas <= 0) continue;

    const clasificadasCurso = erroresDelSimulacro.filter(
      (e) => e.cursoId === cid && e.categoria !== null,
    ).length;
    const clasificadasEfectivas = Math.min(incorrectas, clasificadasCurso);
    const faltan = Math.max(0, incorrectas - clasificadasEfectivas);

    pendientesPorCurso.push({
      cursoId: cid,
      incorrectas,
      clasificadas: clasificadasEfectivas,
      faltan,
    });

    totalIncorrectas += incorrectas;
    totalClasificadas += clasificadasEfectivas;
    totalFaltan += faltan;
  }

  const listoParaMarcarRevisado = totalFaltan === 0 && erroresSinCategoria === 0;

  return {
    pendientesPorCurso,
    totalIncorrectas,
    totalClasificadas,
    totalFaltan,
    erroresSinCategoria,
    listoParaMarcarRevisado,
  };
}

// ---------------------------------------------------------------------------
// Cronómetro de Simulacro de 3 h (Bloque 1 [90m] → Pausa [5m] → Bloque 2 [90m])
// ---------------------------------------------------------------------------

export type FaseCronometroSimulacro = 'bloque1' | 'pausa' | 'bloque2' | 'completado';

export const DURACIONES_CRONOMETRO_SIMULACRO_MIN: Readonly<
  Record<Exclude<FaseCronometroSimulacro, 'completado'>, number>
> = {
  bloque1: 90,
  pausa: 5,
  bloque2: 90,
};

export interface EstadoCronometroSimulacro {
  fase: FaseCronometroSimulacro;
  duracionFaseMs: number;
  inicioTramoMs: number | null;
  acumuladoPrevioMs: number;
}

export function crearCronometroSimulacro3h(ahoraMs: number): EstadoCronometroSimulacro {
  return {
    fase: 'bloque1',
    duracionFaseMs: DURACIONES_CRONOMETRO_SIMULACRO_MIN.bloque1 * 60_000,
    inicioTramoMs: ahoraMs,
    acumuladoPrevioMs: 0,
  };
}

export function avanzarFaseCronometroSimulacro(
  actual: EstadoCronometroSimulacro,
  ahoraMs: number,
): EstadoCronometroSimulacro {
  if (actual.fase === 'bloque1') {
    return {
      fase: 'pausa',
      duracionFaseMs: DURACIONES_CRONOMETRO_SIMULACRO_MIN.pausa * 60_000,
      inicioTramoMs: ahoraMs,
      acumuladoPrevioMs: 0,
    };
  }
  if (actual.fase === 'pausa') {
    return {
      fase: 'bloque2',
      duracionFaseMs: DURACIONES_CRONOMETRO_SIMULACRO_MIN.bloque2 * 60_000,
      inicioTramoMs: ahoraMs,
      acumuladoPrevioMs: 0,
    };
  }
  return {
    fase: 'completado',
    duracionFaseMs: DURACIONES_CRONOMETRO_SIMULACRO_MIN.bloque2 * 60_000,
    inicioTramoMs: null,
    acumuladoPrevioMs: DURACIONES_CRONOMETRO_SIMULACRO_MIN.bloque2 * 60_000,
  };
}
