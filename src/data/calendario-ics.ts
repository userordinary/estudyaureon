/**
 * Generador de calendario iCalendar `.ics` (RFC 5545) compatible con Google Calendar,
 * Apple Calendar y Outlook (PROMPT 10 — Capa A de recordatorios confiables en el teléfono):
 * - Eventos recurrentes:
 *   1. Bloques de estudio (Lunes a Sábado)
 *   2. Repaso diario de errores Leitner (Diario)
 *   3. Cierre del día de 2 min (Diario)
 *   4. Simulacro del sábado de 3 h (Sábados)
 * - Eventos puntuales:
 *   5. Las 4 fechas de evaluación CEPRE (`cepre1`..`cepre4`)
 * Todos los eventos incluyen bloque `BEGIN:VALARM` para sonar en el calendario nativo del teléfono.
 */
import {
  CICLO_POR_DEFECTO,
  EVALUACIONES_CEPRE,
  REGLAS_EVALUACION,
  sumarDias,
  type EvalCepreId,
  type FechaISO,
} from '../domain';

export interface ConfigExportacionICS {
  fechaInicio: FechaISO;
  fechasEval?: Readonly<Record<EvalCepreId, FechaISO>>;
  /** Hora de inicio del bloque principal de estudio en formato 'HH:MM' (por defecto '16:00'). */
  horaBloqueEstudio?: string;
  /** Duración en minutos del bloque de estudio (por defecto 90). */
  minutosBloqueEstudio?: number;
  /** Hora del repaso diario de errores Leitner en formato 'HH:MM' (por defecto '19:30'). */
  horaRepasoDiario?: string;
  /** Hora del cierre del día en formato 'HH:MM' (por defecto '21:30'). */
  horaCierreDia?: string;
  /** Hora del simulacro del sábado en formato 'HH:MM' (por defecto '09:00'). */
  horaSimulacroSabado?: string;
}

function escaparTextoICS(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function fechaCompactaICS(fecha: FechaISO): string {
  return fecha.replace(/-/g, '');
}

function formatearHoraCompacta(horaHHMM: string, minutosAdicionales = 0): string {
  const partes = horaHHMM.split(':');
  const hBase = Number(partes[0] ?? 0);
  const mBase = Number(partes[1] ?? 0);
  const totalMin = hBase * 60 + mBase + minutosAdicionales;
  const hFinal = Math.floor((((totalMin % 1440) + 1440) % 1440) / 60);
  const mFinal = ((totalMin % 60) + 60) % 60;
  return `${String(hFinal).padStart(2, '0')}${String(mFinal).padStart(2, '0')}00`;
}

function encontrarProximoSabado(desde: FechaISO): FechaISO {
  let cursor = desde;
  for (let i = 0; i < 7; i++) {
    const [y, m, d] = cursor.split('-').map(Number);
    const dt = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1));
    if (dt.getUTCDay() === 6) return cursor;
    cursor = sumarDias(cursor, 1);
  }
  return desde;
}

function construirAlarmaICS(descripcion: string, trigger = '-PT15M'): string[] {
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escaparTextoICS(descripcion)}`,
    `TRIGGER:${trigger}`,
    'END:VALARM',
  ];
}

export function generarCalendarioICS(config: ConfigExportacionICS): string {
  const {
    fechaInicio,
    fechasEval = CICLO_POR_DEFECTO.fechasEval,
    horaBloqueEstudio = '16:00',
    minutosBloqueEstudio = 90,
    horaRepasoDiario = '19:30',
    horaCierreDia = '21:30',
    horaSimulacroSabado = '09:00',
  } = config;

  const dtstamp = `${fechaCompactaICS(fechaInicio)}T120000Z`;
  const fechaCompacta = fechaCompactaICS(fechaInicio);
  const sabadoInicial = fechaCompactaICS(encontrarProximoSabado(fechaInicio));

  const lineas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AUREON//Agenda de Estudio CEPRE UNMSM//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:AUREON Estudio',
    'X-WR-TIMEZONE:America/Lima',
  ];

  // 1. Bloques de estudio recurrentes (Lunes a Sábado)
  lineas.push(
    'BEGIN:VEVENT',
    `UID:aureon-bloque-estudio-${fechaCompacta}@aureon.local`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=America/Lima:${fechaCompacta}T${formatearHoraCompacta(horaBloqueEstudio, 0)}`,
    `DTEND;TZID=America/Lima:${fechaCompacta}T${formatearHoraCompacta(horaBloqueEstudio, minutosBloqueEstudio)}`,
    'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA;COUNT=108',
    `SUMMARY:${escaparTextoICS('AUREON · Bloque de Estudio y Práctica DECO')}`,
    `DESCRIPTION:${escaparTextoICS('Inicia tu siguiente bloque del plan del día en AUREON (Enfoque + tanda de preguntas).')}`,
    ...construirAlarmaICS('Hora de tu bloque de estudio en AUREON', '-PT10M'),
    'END:VEVENT',
  );

  // 2. Repaso diario de errores Leitner (Todos los días)
  lineas.push(
    'BEGIN:VEVENT',
    `UID:aureon-repaso-diario-${fechaCompacta}@aureon.local`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=America/Lima:${fechaCompacta}T${formatearHoraCompacta(horaRepasoDiario, 0)}`,
    `DTEND;TZID=America/Lima:${fechaCompacta}T${formatearHoraCompacta(horaRepasoDiario, 25)}`,
    'RRULE:FREQ=DAILY;COUNT=126',
    `SUMMARY:${escaparTextoICS('AUREON · Repaso Diario de Errores (Leitner)')}`,
    `DESCRIPTION:${escaparTextoICS('Completa tus flashcards vencidas de hoy para mantener tu memoria de largo plazo.')}`,
    ...construirAlarmaICS('Tienes repasos de errores programados en AUREON', '-PT10M'),
    'END:VEVENT',
  );

  // 3. Cierre del día (2 min · Todos los días)
  lineas.push(
    'BEGIN:VEVENT',
    `UID:aureon-cierre-dia-${fechaCompacta}@aureon.local`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=America/Lima:${fechaCompacta}T${formatearHoraCompacta(horaCierreDia, 0)}`,
    `DTEND;TZID=America/Lima:${fechaCompacta}T${formatearHoraCompacta(horaCierreDia, 10)}`,
    'RRULE:FREQ=DAILY;COUNT=126',
    `SUMMARY:${escaparTextoICS('AUREON · Cierre del Día (2 min)')}`,
    `DESCRIPTION:${escaparTextoICS('Clasifica los errores pendientes de hoy, asegura tu racha y revisa el plan de mañana.')}`,
    ...construirAlarmaICS('Cierre del día en AUREON (2 min)', '-PT5M'),
    'END:VEVENT',
  );

  // 4. Simulacro del sábado (3 horas · Sábados)
  lineas.push(
    'BEGIN:VEVENT',
    `UID:aureon-simulacro-sabado-${sabadoInicial}@aureon.local`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=America/Lima:${sabadoInicial}T${formatearHoraCompacta(horaSimulacroSabado, 0)}`,
    `DTEND;TZID=America/Lima:${sabadoInicial}T${formatearHoraCompacta(horaSimulacroSabado, 185)}`,
    'RRULE:FREQ=WEEKLY;BYDAY=SA;COUNT=18',
    `SUMMARY:${escaparTextoICS('AUREON · Simulacro Semanal del Sábado (3 h)')}`,
    `DESCRIPTION:${escaparTextoICS('Simulacro completo cronometrado (90m + 5m pausa + 90m) y revisión obligatoria de errores.')}`,
    ...construirAlarmaICS('Prepárate para el Simulacro del Sábado en AUREON', '-PT15M'),
    'END:VEVENT',
  );

  // 5. Fechas de las 4 evaluaciones oficiales CEPRE
  for (const evalId of EVALUACIONES_CEPRE) {
    const fechaEval = fechasEval[evalId];
    if (!fechaEval) continue;
    const inicioDia = fechaCompactaICS(fechaEval);
    const finDia = fechaCompactaICS(sumarDias(fechaEval, 1));
    const regla = REGLAS_EVALUACION[evalId];

    lineas.push(
      'BEGIN:VEVENT',
      `UID:aureon-eval-${evalId}-${inicioDia}@aureon.local`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${inicioDia}`,
      `DTEND;VALUE=DATE:${finDia}`,
      `SUMMARY:${escaparTextoICS(`AUREON · ${regla.nombre} (Máx. ${regla.max} pts)`)}`,
      `DESCRIPTION:${escaparTextoICS(`Evaluación oficial del ciclo (${regla.preguntas} preguntas). Registra tu desglose por curso en AUREON al terminar.`)}`,
      ...construirAlarmaICS(`Mañana: ${regla.nombre}`, '-P1D'),
      'END:VEVENT',
    );
  }

  lineas.push('END:VCALENDAR');
  return lineas.join('\r\n') + '\r\n';
}
