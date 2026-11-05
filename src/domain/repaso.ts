/**
 * Repaso espaciado de errores (Leitner cajas 1–6 con intervalos 1/2/5/10/20/60 días, caja 7 = dominado),
 * intervalos de repaso espaciado de temas (1/3/7/14/30 días) y cálculo puro de racha de estudio
 * (>= 10 preguntas o >= 25 min de enfoque, con días de gracia por semana configurables y récord personal).
 */
import { diasEntre, lunesDe, sumarDias } from './fechas';
import type { CursoId, FechaISO } from './tipos';

// ---------------------------------------------------------------------------
// 1. Sistema Leitner de errores (intervalos 1 / 2 / 5 / 10 / 20 / 60 días)
// ---------------------------------------------------------------------------

export const INTERVALOS_LEITNER: Readonly<Record<1 | 2 | 3 | 4 | 5 | 6, number>> = {
  1: 1,
  2: 2,
  3: 5,
  4: 10,
  5: 20,
  6: 60,
};

export const TOPE_REPASOS_DIARIO_POR_DEFECTO = 15;

export interface EstadoLeitnerError {
  id: string;
  estado: 'abierto' | 'repaso' | 'dominado';
  caja: number;
  proximoRepaso: FechaISO | null;
}

export interface TransicionLeitner {
  estado: 'abierto' | 'repaso' | 'dominado';
  cajaAnterior: number;
  cajaNueva: number;
  proximoRepaso: FechaISO | null;
}

/**
 * Envía un error abierto al circuito Leitner (Caja 1, próximo repaso mañana).
 */
export function activarRepasoError(fechaHoy: FechaISO): TransicionLeitner {
  return {
    estado: 'repaso',
    cajaAnterior: 0,
    cajaNueva: 1,
    proximoRepaso: sumarDias(fechaHoy, INTERVALOS_LEITNER[1]),
  };
}

/**
 * Evalúa la respuesta de una flashcard Leitner ("Lo recordé" = 'ok' | "Fallé" = 'fail').
 * - Si acierta en cajas 1..5 -> sube 1 caja y programa con `INTERVALOS_LEITNER[cajaNueva]`.
 * - Si acierta en caja 6 -> pasa a caja 7 (`dominado`, `proximoRepaso: null`).
 * - Si falla en cualquier caja -> regresa a caja 1 (`repaso`, próximo repaso en +1 día).
 */
export function evaluarRespuestaLeitner(
  cajaActual: number,
  resultado: 'ok' | 'fail',
  fechaHoy: FechaISO,
): TransicionLeitner {
  const cajaBase = Math.max(1, Math.min(6, Math.trunc(cajaActual || 1)));

  if (resultado === 'fail') {
    return {
      estado: 'repaso',
      cajaAnterior: cajaBase,
      cajaNueva: 1,
      proximoRepaso: sumarDias(fechaHoy, INTERVALOS_LEITNER[1]),
    };
  }

  if (cajaBase >= 6) {
    return {
      estado: 'dominado',
      cajaAnterior: cajaBase,
      cajaNueva: 7,
      proximoRepaso: null,
    };
  }

  const siguienteCaja = (cajaBase + 1) as 2 | 3 | 4 | 5 | 6;
  const dias = INTERVALOS_LEITNER[siguienteCaja];
  return {
    estado: 'repaso',
    cajaAnterior: cajaBase,
    cajaNueva: siguienteCaja,
    proximoRepaso: sumarDias(fechaHoy, dias),
  };
}

export interface ColaLeitnerDiaria<T extends EstadoLeitnerError> {
  /** Errores que entran en la sesión de hoy (máximo `topeDiario`). */
  paraHoy: T[];
  /** Excedente vencido repartido en los días siguientes respetando `topeDiario` por día. */
  excedenteRepartido: Array<{ item: T; fechaReprogramada: FechaISO }>;
  /** Total de errores que estaban vencidos hoy antes de aplicar el tope. */
  totalVencidos: number;
}

/**
 * Selecciona los errores vencidos para repasar hoy aplicando un tope diario (por defecto 15)
 * para no saturar al estudiante, y reparte el excedente en los días siguientes.
 */
export function planificarColaLeitner<T extends EstadoLeitnerError>(
  errores: readonly T[],
  fechaHoy: FechaISO,
  topeDiario: number = TOPE_REPASOS_DIARIO_POR_DEFECTO,
): ColaLeitnerDiaria<T> {
  const tope = Math.max(1, Math.trunc(topeDiario));
  const vencidos = errores
    .filter(
      (e) =>
        e.estado === 'repaso' &&
        e.caja >= 1 &&
        e.caja <= 6 &&
        e.proximoRepaso !== null &&
        e.proximoRepaso <= fechaHoy,
    )
    .slice()
    .sort((a, b) => {
      const cmpFecha = (a.proximoRepaso ?? '').localeCompare(b.proximoRepaso ?? '');
      if (cmpFecha !== 0) return cmpFecha;
      return a.caja - b.caja;
    });

  const paraHoy = vencidos.slice(0, tope);
  const sobrantes = vencidos.slice(tope);
  const excedenteRepartido = sobrantes.map((item, idx) => {
    const diasDesplazamiento = Math.floor(idx / tope) + 1;
    return {
      item,
      fechaReprogramada: sumarDias(fechaHoy, diasDesplazamiento),
    };
  });

  return {
    paraHoy,
    excedenteRepartido,
    totalVencidos: vencidos.length,
  };
}

// ---------------------------------------------------------------------------
// 2. Intervalos de repaso espaciado de temas (1 / 3 / 7 / 14 / 30 días)
// ---------------------------------------------------------------------------

export const INTERVALOS_REPASO_TEMA = [1, 3, 7, 14, 30] as const;
export type IntervaloRepasoTema = (typeof INTERVALOS_REPASO_TEMA)[number];

export interface RegistroTemaPracticado {
  cursoId: CursoId;
  temaId: string;
  ultimaFecha: FechaISO;
  dominio: number; // 0..100
}

/**
 * Determina cuál escalón de repaso espaciado (1, 3, 7, 14 o 30 días) le corresponde a un tema
 * según los días transcurridos desde su última práctica.
 */
export function escalonRepasoTema(diasDesdeUltimaPractica: number): IntervaloRepasoTema | null {
  if (diasDesdeUltimaPractica < 1) return null;
  let elegido: IntervaloRepasoTema = 1;
  for (const escalon of INTERVALOS_REPASO_TEMA) {
    if (diasDesdeUltimaPractica >= escalon) {
      elegido = escalon;
    }
  }
  return elegido;
}

// ---------------------------------------------------------------------------
// 3. Día cumplido y Racha (con día de gracia semanal y récord personal)
// ---------------------------------------------------------------------------

export const MIN_PREGUNTAS_DIA_CUMPLIDO = 10;
export const MIN_MINUTOS_ENFOQUE_DIA_CUMPLIDO = 25;

export interface ActividadDiariaResumen {
  fecha: FechaISO;
  preguntas: number;
  minutosEnfoque: number;
}

export function esDiaCumplido(
  preguntas: number,
  minutosEnfoque: number,
  minPreguntas = MIN_PREGUNTAS_DIA_CUMPLIDO,
  minMinutos = MIN_MINUTOS_ENFOQUE_DIA_CUMPLIDO,
): boolean {
  return preguntas >= minPreguntas || minutosEnfoque >= minMinutos;
}

export interface ResultadoRacha {
  /** Racha activa hasta `fechaHoy` (en días cumplidos efectivos). */
  rachaActual: number;
  /** Mayor racha alcanzada en todo el historial. */
  recordPersonal: number;
  /** true si `fechaHoy` ya cumple la meta diaria (>=10 preg o >=25 min). */
  hoyCumplido: boolean;
  /** Días de gracia usados en la semana actual (lunes a domingo). */
  diasGraciaUsadosSemana: number;
  /** Días de gracia disponibles por semana. */
  diasGraciaMaxSemana: number;
}

/**
 * Calcula la racha actual y el récord personal evaluando día por día.
 * Regla:
 * - Un día se cumple con `>= 10` preguntas O `>= 25` min de enfoque.
 * - Se permite hasta `diasGraciaPorSemana` (por defecto 1) día sin actividad por cada semana ISO
 *   (lunes–domingo) sin romper la racha, siempre que haya actividad previa en la racha.
 * - Si hoy aún no se cumple pero ayer la racha seguía viva, la racha no se pierde durante el día de hoy.
 */
export function calcularRacha(
  actividades: readonly ActividadDiariaResumen[],
  fechaHoy: FechaISO,
  diasGraciaPorSemana = 1,
): ResultadoRacha {
  const graciaMax = Math.max(0, Math.min(3, Math.trunc(diasGraciaPorSemana)));
  const mapa = new Map<FechaISO, { preguntas: number; minutos: number }>();

  for (const a of actividades) {
    const prev = mapa.get(a.fecha);
    mapa.set(a.fecha, {
      preguntas: (prev?.preguntas ?? 0) + a.preguntas,
      minutos: (prev?.minutos ?? 0) + a.minutosEnfoque,
    });
  }

  const hoyInfo = mapa.get(fechaHoy) ?? { preguntas: 0, minutos: 0 };
  const hoyCumplido = esDiaCumplido(hoyInfo.preguntas, hoyInfo.minutos);

  const fechasConDatos = Array.from(mapa.keys())
    .filter((f) => f <= fechaHoy)
    .sort();

  if (fechasConDatos.length === 0) {
    return {
      rachaActual: 0,
      recordPersonal: 0,
      hoyCumplido: false,
      diasGraciaUsadosSemana: 0,
      diasGraciaMaxSemana: graciaMax,
    };
  }

  const primeraFecha = fechasConDatos[0] ?? fechaHoy;
  const totalDias = Math.max(0, diasEntre(primeraFecha, fechaHoy)) + 1;
  const ultimoDiaEvaluar = hoyCumplido ? totalDias - 1 : totalDias - 2;

  let racha = 0;
  let record = 0;
  let graciaUsadaPorSemana = new Map<FechaISO, number>();

  for (let i = 0; i <= ultimoDiaEvaluar; i++) {
    const f = sumarDias(primeraFecha, i);
    const info = mapa.get(f) ?? { preguntas: 0, minutos: 0 };
    const cumplido = esDiaCumplido(info.preguntas, info.minutos);
    const semana = lunesDe(f);

    if (cumplido) {
      racha += 1;
      if (racha > record) record = racha;
    } else if (racha > 0) {
      const usados = graciaUsadaPorSemana.get(semana) ?? 0;
      if (usados < graciaMax) {
        graciaUsadaPorSemana.set(semana, usados + 1);
        // El día de gracia conserva la racha sin romperla
      } else {
        racha = 0;
        graciaUsadaPorSemana = new Map<FechaISO, number>();
      }
    }
  }

  const semanaActual = lunesDe(fechaHoy);
  const diasGraciaUsadosSemana = graciaUsadaPorSemana.get(semanaActual) ?? 0;

  return {
    rachaActual: racha,
    recordPersonal: Math.max(record, racha),
    hoyCumplido,
    diasGraciaUsadosSemana,
    diasGraciaMaxSemana: graciaMax,
  };
}
