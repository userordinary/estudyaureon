/**
 * Generador puro del plan diario de estudio (`src/domain/plan.ts`).
 *
 * Reglas del PROMPT:
 * (a) Todo curso con peso > 0 aparece al menos una vez por semana (ningún curso queda > 7 días sin aparecer).
 * (b) Cabe en `minutosDisponibles` y mezcla:
 *     - 1 tema nuevo de la semana actual (`tema_nuevo`)
 *     - 1–2 repasos espaciados de semanas anteriores con intervalos 1/3/7/14/30 días (`repaso_espaciado`)
 *     - repasos de errores vencidos (`repaso_errores`)
 * (c) Prioridad por peso en el área, dominio bajo, tiempo sin practicar y errores abiertos;
 *     cada ítem trae su `"porQue"` en una frase.
 * (d) No dos bloques seguidos del mismo curso.
 */
import {
  CURSO_IDS,
  cursoPorId,
  PESOS_AREA,
  REGLAS_EVALUACION,
  temasDeCurso,
  type AreaId,
  type CursoId,
  type EvalCepreId,
  type FechaISO,
} from './index';
import { diasEntre } from './fechas';
import { escalonRepasoTema, INTERVALOS_REPASO_TEMA } from './repaso';

export type TipoBloquePlan = 'tema_nuevo' | 'repaso_espaciado' | 'repaso_errores';

export interface BloquePlanDia {
  id: string;
  tipo: TipoBloquePlan;
  cursoId: CursoId;
  cursoNombre: string;
  temaId: string | null;
  temaTitulo: string;
  preguntas: number;
  minutos: number;
  prioridad: number;
  porQue: string;
}

export interface EntradaPlanDelDia {
  fecha: FechaISO;
  minutosDisponibles: number;
  semana: number;
  evaluacion: EvalCepreId;
  area?: AreaId;
  /** Dominio (0–100) por `temaId`. Si un tema no está, se asume pendiente/nuevo. */
  dominioPorTema: Readonly<Record<string, number>>;
  /** Cantidad de errores abiertos o vencidos por `cursoId`. */
  erroresPorCurso: Readonly<Partial<Record<CursoId, number>>>;
  /** Última fecha (`YYYY-MM-DD`) en que se practicó cada curso, o `null` si nunca se practicó. */
  ultimaPracticaPorCurso: Readonly<Partial<Record<CursoId, FechaISO | null>>>;
  /** Cursos bajo el umbral de seguridad (ej. < 70 %) o marcados flojos en simulacro. */
  cursosBajoUmbral: readonly CursoId[];
  /** Cursos programados en el horario de clases para la fecha del plan. */
  cursosDelDia?: readonly CursoId[];
}

export interface PlanDelDia {
  fecha: FechaISO;
  semana: number;
  evaluacion: EvalCepreId;
  minutosDisponibles: number;
  minutosAsignados: number;
  accionPrincipal: BloquePlanDia | null;
  bloques: BloquePlanDia[];
}

/**
 * Peso efectivo de un curso en la evaluación activa para un área dada (A–E).
 * HV y HM valen 15+15 en cepre1–3 y 10+10 en cepre4; los 17 de Conocimientos usan `PESOS_AREA`.
 */
export function pesoEfectivoCurso(cursoId: CursoId, area: AreaId, evaluacion: EvalCepreId): number {
  const regla = REGLAS_EVALUACION[evaluacion];
  if (cursoId === 'hv') return regla.hv;
  if (cursoId === 'hm') return regla.hm;
  return PESOS_AREA[area][cursoId] ?? 0;
}

function elegirTemaDeCurso(
  cursoId: CursoId,
  semanaObjetivo: number,
  semanaMaxEval: number,
  dominioPorTema: Readonly<Record<string, number>>,
  preferirNuevo: boolean,
): { id: string; titulo: string; semana: number; dominio: number } {
  const lista = temasDeCurso(cursoId);
  const deSemanaActual = lista.find((t) => t.semana === semanaObjetivo);

  if (preferirNuevo && deSemanaActual && (dominioPorTema[deSemanaActual.id] ?? 0) < 85) {
    return {
      id: deSemanaActual.id,
      titulo: `S${deSemanaActual.semana} · ${deSemanaActual.titulo}`,
      semana: deSemanaActual.semana,
      dominio: dominioPorTema[deSemanaActual.id] ?? 0,
    };
  }

  // Para repaso espaciado: priorizar semanas anteriores dentro del rango de la evaluación con menor dominio
  const anteriores = lista
    .filter((t) => t.semana < semanaObjetivo && t.semana <= semanaMaxEval)
    .slice()
    .sort((a, b) => (dominioPorTema[a.id] ?? 40) - (dominioPorTema[b.id] ?? 40));

  if (!preferirNuevo && anteriores[0]) {
    const t = anteriores[0];
    return {
      id: t.id,
      titulo: `S${t.semana} · ${t.titulo}`,
      semana: t.semana,
      dominio: dominioPorTema[t.id] ?? 40,
    };
  }

  const enRango = lista
    .filter((t) => t.semana <= Math.min(semanaObjetivo, semanaMaxEval))
    .slice()
    .sort((a, b) => (dominioPorTema[a.id] ?? 0) - (dominioPorTema[b.id] ?? 0));

  const elegido = deSemanaActual ?? enRango[0] ?? lista[0];
  if (!elegido) {
    return {
      id: `${cursoId}-general`,
      titulo: 'Práctica general',
      semana: semanaObjetivo,
      dominio: 0,
    };
  }
  return {
    id: elegido.id,
    titulo: `S${elegido.semana} · ${elegido.titulo}`,
    semana: elegido.semana,
    dominio: dominioPorTema[elegido.id] ?? 0,
  };
}

function dimensionarBloque(
  peso: number,
  tipo: TipoBloquePlan,
  minutosRestantes: number,
  presupuestoTotal: number,
): { preguntas: number; minutos: number } {
  const minutosBase =
    tipo === 'repaso_errores'
      ? 15
      : tipo === 'repaso_espaciado'
        ? peso >= 7
          ? 20
          : 15
        : peso >= 10
          ? 25
          : peso >= 6
            ? 20
            : 15;

  // Garantiza que en presupuestos estándar (>= 45 min) quepan al menos 3–4 bloques diarios
  const topePorBloque =
    presupuestoTotal >= 45
      ? Math.max(15, Math.min(30, Math.floor(presupuestoTotal / 3)))
      : minutosRestantes;

  const minutos = Math.max(10, Math.min(minutosBase, topePorBloque, minutosRestantes));
  const preguntas =
    tipo === 'repaso_errores'
      ? Math.max(5, Math.round(minutos * 0.6))
      : Math.max(8, Math.round(minutos * 0.6));
  return { preguntas, minutos };
}

function construirFrasePorQue(params: {
  tipo: TipoBloquePlan;
  peso: number;
  diasSinPracticar: number;
  errores: number;
  bajoUmbral: boolean;
  dominio: number;
  semanaTema: number;
  enHorarioDelDia?: boolean;
}): string {
  const {
    tipo,
    peso,
    diasSinPracticar,
    errores,
    bajoUmbral,
    dominio,
    semanaTema,
    enHorarioDelDia,
  } = params;

  if (diasSinPracticar >= 6) {
    return `Lleva ${diasSinPracticar} días sin práctica (garantía semanal activa · peso ${peso} preg).`;
  }
  if (tipo === 'repaso_errores' && errores > 0) {
    return `Tienes ${errores} error(es) abierto(s) pendientes de corregir en este curso (peso ${peso} preg).`;
  }
  if (enHorarioDelDia) {
    if (tipo === 'tema_nuevo') {
      return `Curso en tu horario de clases de hoy (S${semanaTema} · ${peso} preg en el examen).`;
    }
    return `Curso programado en tu horario de clases de hoy (peso ${peso} preg).`;
  }
  if (tipo === 'tema_nuevo') {
    return `Tema nuevo de la Semana S${semanaTema} con alto impacto en tu área (${peso} preg en el examen).`;
  }
  const escalon = escalonRepasoTema(Math.max(1, diasSinPracticar)) ?? INTERVALOS_REPASO_TEMA[0];
  if (bajoUmbral) {
    return `Repaso espaciado (${escalon}d): dominio actual ${dominio}% bajo el umbral de seguridad (${peso} preg).`;
  }
  return `Repaso espaciado del ciclo de ${escalon}d para consolidar S${semanaTema} (hace ${diasSinPracticar}d · peso ${peso} preg).`;
}

/**
 * Reordena los bloques para garantizar la invariante (d): no dos bloques seguidos del mismo curso.
 */
export function evitarCursosConsecutivos(bloques: readonly BloquePlanDia[]): BloquePlanDia[] {
  if (bloques.length <= 1) return [...bloques];
  const pendientes = [...bloques];
  const resultado: BloquePlanDia[] = [];

  while (pendientes.length > 0) {
    const ultimoCurso = resultado[resultado.length - 1]?.cursoId;
    const idxDistinto = pendientes.findIndex((b) => b.cursoId !== ultimoCurso);
    if (idxDistinto >= 0) {
      const [elegido] = pendientes.splice(idxDistinto, 1);
      if (elegido) resultado.push(elegido);
    } else {
      // Si solo quedan del mismo curso, descartamos el duplicado consecutivo fusionando o tomando solo uno
      break;
    }
  }
  return resultado;
}

/**
 * Función pura que construye el plan del día cumpliendo las reglas (a), (b), (c) y (d).
 */
export function generarPlanDelDia(entrada: EntradaPlanDelDia): PlanDelDia {
  const {
    fecha,
    minutosDisponibles,
    semana,
    evaluacion,
    area = 'A',
    dominioPorTema,
    erroresPorCurso,
    ultimaPracticaPorCurso,
    cursosBajoUmbral,
    cursosDelDia,
  } = entrada;

  const presupuestoTotal = Math.max(0, Math.trunc(minutosDisponibles));
  if (presupuestoTotal < 10) {
    return {
      fecha,
      semana,
      evaluacion,
      minutosDisponibles: presupuestoTotal,
      minutosAsignados: 0,
      accionPrincipal: null,
      bloques: [],
    };
  }

  const semanaSegura = Math.max(1, Math.min(15, Math.trunc(semana)));
  const semanaMaxEval = REGLAS_EVALUACION[evaluacion].semanas[1];
  const setBajoUmbral = new Set<CursoId>(cursosBajoUmbral);

  interface MetricaCurso {
    cursoId: CursoId;
    peso: number;
    diasSinPracticar: number;
    errores: number;
    bajoUmbral: boolean;
    dominioMedio: number;
    scoreGeneral: number;
    urgenciaSemanal: boolean;
  }

  // Evaluamos todos los cursos con peso > 0 (regla a)
  const metricas: MetricaCurso[] = [];

  for (const cid of CURSO_IDS) {
    const peso = pesoEfectivoCurso(cid, area, evaluacion);
    if (peso <= 0) continue;

    const ultima = ultimaPracticaPorCurso[cid];
    const diasSinPracticar = ultima && ultima <= fecha ? Math.max(0, diasEntre(ultima, fecha)) : 7;

    const errores = Math.max(0, erroresPorCurso[cid] ?? 0);
    const bajoUmbral = setBajoUmbral.has(cid);

    const temasEnRango = temasDeCurso(cid).filter((t) => t.semana <= semanaSegura);
    const sumaDominio = temasEnRango.reduce((s, t) => s + (dominioPorTema[t.id] ?? 35), 0);
    const dominioMedio =
      temasEnRango.length > 0 ? Math.round(sumaDominio / temasEnRango.length) : 35;

    // Regla (a): cualquier curso que lleve >= 6 días sin tocarse recibe un impulso decisivo
    // para que ningún curso supere 7 días sin aparecer en el plan semanal.
    const urgenciaSemanal = diasSinPracticar >= 6;
    const bonusRotacionSemanal = urgenciaSemanal
      ? 120 + diasSinPracticar * 18
      : diasSinPracticar * 6;
    const scorePeso = peso * 3.2;
    const scoreDominio = (100 - dominioMedio) * 0.35 + (bajoUmbral ? 18 : 0);
    const scoreErrores = Math.min(35, errores * 9);

    const scoreGeneral = Math.round(bonusRotacionSemanal + scorePeso + scoreDominio + scoreErrores);

    metricas.push({
      cursoId: cid,
      peso,
      diasSinPracticar,
      errores,
      bajoUmbral,
      dominioMedio,
      scoreGeneral,
      urgenciaSemanal,
    });
  }

  metricas.sort((a, b) => {
    if (b.scoreGeneral !== a.scoreGeneral) return b.scoreGeneral - a.scoreGeneral;
    return b.peso - a.peso;
  });

  // Regla de horario semanal: los dos cursos con más preguntas/urgencia se mantienen arriba (top 2),
  // y a partir de ahí se priorizan los cursos correspondientes al horario del día.
  if (cursosDelDia && cursosDelDia.length > 0) {
    const setDelDia = new Set<CursoId>(cursosDelDia);
    const top2 = metricas.slice(0, 2);
    const resto = metricas.slice(2);
    resto.sort((a, b) => {
      const enDiaA = setDelDia.has(a.cursoId) ? 1 : 0;
      const enDiaB = setDelDia.has(b.cursoId) ? 1 : 0;
      if (enDiaB !== enDiaA) return enDiaB - enDiaA;
      if (b.scoreGeneral !== a.scoreGeneral) return b.scoreGeneral - a.scoreGeneral;
      return b.peso - a.peso;
    });
    metricas.splice(0, metricas.length, ...top2, ...resto);
  }

  const bloquesSeleccionados: BloquePlanDia[] = [];
  const cursosUsados = new Set<CursoId>();
  let minutosRestantes = presupuestoTotal;

  const agregarBloque = (m: MetricaCurso, tipo: TipoBloquePlan): boolean => {
    if (minutosRestantes < 10) return false;
    const preferirNuevo = tipo === 'tema_nuevo';
    const tema = elegirTemaDeCurso(
      m.cursoId,
      semanaSegura,
      semanaMaxEval,
      dominioPorTema,
      preferirNuevo,
    );
    const { preguntas, minutos } = dimensionarBloque(
      m.peso,
      tipo,
      minutosRestantes,
      presupuestoTotal,
    );
    if (minutos > minutosRestantes) return false;

    const curso = cursoPorId(m.cursoId);
    const enHorarioDelDia = cursosDelDia ? cursosDelDia.includes(m.cursoId) : false;
    const porQue = construirFrasePorQue({
      tipo,
      peso: m.peso,
      diasSinPracticar: m.diasSinPracticar,
      errores: m.errores,
      bajoUmbral: m.bajoUmbral,
      dominio: tema.dominio,
      semanaTema: tema.semana,
      enHorarioDelDia,
    });

    bloquesSeleccionados.push({
      id: `plan-${fecha}-${bloquesSeleccionados.length + 1}-${m.cursoId}`,
      tipo,
      cursoId: m.cursoId,
      cursoNombre: curso.nombre,
      temaId: tema.id,
      temaTitulo: tema.titulo,
      preguntas,
      minutos,
      prioridad: Math.min(99, Math.max(10, m.scoreGeneral)),
      porQue,
    });

    cursosUsados.add(m.cursoId);
    minutosRestantes -= minutos;
    return true;
  };

  // 1) Bloque de Tema Nuevo de la semana actual (el curso más prioritario disponible)
  const candidatoTemaNuevo = metricas[0];
  if (candidatoTemaNuevo) {
    agregarBloque(candidatoTemaNuevo, 'tema_nuevo');
  }

  // 2) 1–2 bloques de Repaso Espaciado (1/3/7/14/30 días o cursos que llevan más días sin tocarse)
  const candidatosEspaciado = metricas.filter((m) => !cursosUsados.has(m.cursoId));
  let repasosEspaciadosAgregados = 0;
  for (const m of candidatosEspaciado) {
    if (repasosEspaciadosAgregados >= 2 || minutosRestantes < 15) break;
    // Dejamos espacio para errores vencidos si existen y el presupuesto es ajustado
    const hayErroresPendientes = metricas.some(
      (x) => !cursosUsados.has(x.cursoId) && x.errores > 0,
    );
    if (repasosEspaciadosAgregados === 1 && hayErroresPendientes && minutosRestantes < 35) {
      break;
    }
    if (agregarBloque(m, 'repaso_espaciado')) {
      repasosEspaciadosAgregados += 1;
    }
  }

  // 3) Bloque de Repaso de Errores vencidos/abiertos (priorizando urgencia semanal y cantidad de errores)
  const candidatosErrores = metricas
    .filter((m) => !cursosUsados.has(m.cursoId) && m.errores > 0)
    .sort(
      (a, b) =>
        Number(b.urgenciaSemanal) - Number(a.urgenciaSemanal) ||
        b.errores - a.errores ||
        b.scoreGeneral - a.scoreGeneral,
    );

  if (candidatosErrores[0] && minutosRestantes >= 10) {
    agregarBloque(candidatosErrores[0], 'repaso_errores');
  }

  // 4) Completar presupuesto restante con cursos en rotación semanal (garantía <= 7 días para los 19 cursos)
  while (minutosRestantes >= 15 && bloquesSeleccionados.length < 5) {
    const siguienteRotacion = metricas.find((m) => !cursosUsados.has(m.cursoId));
    if (!siguienteRotacion) break;
    const tipoExtra: TipoBloquePlan =
      siguienteRotacion.errores > 0 ? 'repaso_errores' : 'repaso_espaciado';
    if (!agregarBloque(siguienteRotacion, tipoExtra)) break;
  }

  // 5) Garantizar regla (d): nunca dos bloques seguidos del mismo curso
  const bloquesOrdenados = evitarCursosConsecutivos(bloquesSeleccionados);
  const minutosAsignados = bloquesOrdenados.reduce((s, b) => s + b.minutos, 0);

  return {
    fecha,
    semana: semanaSegura,
    evaluacion,
    minutosDisponibles: presupuestoTotal,
    minutosAsignados,
    accionPrincipal: bloquesOrdenados[0] ?? null,
    bloques: bloquesOrdenados,
  };
}
