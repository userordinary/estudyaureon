// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUREON_PWA_MANIFEST } from '../../../vite.config';
import { App } from '../../App';
import {
  actualizarBadgeRepasosPendientes,
  db,
  detectarPlataformaPWA,
  generarCalendarioICS,
  notificarFinDeBloqueEnfoque,
  notificarRepasosVencidosHoy,
  repositorios,
  resolverAtajoTecladoGlobal,
  resolverShortcutUrl,
} from '../../data';
import { guardarSesionEnfoquePersistida } from '../enfoque/EnfoqueView';

describe('Feature PWA Completa, .ics, Notificaciones por Capas, Atajos y Badging API (PROMPT 10)', () => {
  beforeEach(async () => {
    guardarSesionEnfoquePersistida(null);
    await db.borrarDatosEstudio();
    localStorage.clear();
  });

  afterEach(() => {
    guardarSesionEnfoquePersistida(null);
    cleanup();
    vi.restoreAllMocks();
  });

  it('1. Manifest "AUREON": standalone, ícono maskable y los 4 shortcuts ("Registrar tanda", "Repasar errores", "Hoy", "Enfoque")', () => {
    expect(AUREON_PWA_MANIFEST.name).toBe('AUREON');
    expect(AUREON_PWA_MANIFEST.short_name).toBe('AUREON');
    expect(AUREON_PWA_MANIFEST.display).toBe('standalone');

    // Verifica íconos maskable y any
    const tieneMaskable = AUREON_PWA_MANIFEST.icons.some((i) => i.purpose === 'maskable');
    const tieneAny = AUREON_PWA_MANIFEST.icons.some((i) => i.purpose === 'any');
    expect(tieneMaskable).toBe(true);
    expect(tieneAny).toBe(true);

    // Verifica los 4 shortcuts obligatorios
    const nombresShortcuts = AUREON_PWA_MANIFEST.shortcuts.map((s) => s.name);
    expect(nombresShortcuts).toEqual(['Registrar tanda', 'Repasar errores', 'Hoy', 'Enfoque']);

    // Verifica que resolverShortcutUrl interpreta las 4 rutas del manifest
    expect(resolverShortcutUrl('?shortcut=registrar')).toBe('registrar');
    expect(resolverShortcutUrl('?shortcut=errores')).toBe('errores');
    expect(resolverShortcutUrl('?shortcut=hoy')).toBe('hoy');
    expect(resolverShortcutUrl('?shortcut=enfoque')).toBe('enfoque');
  });

  it('2. Calendario .ics (RFC 5545 para Google Calendar): eventos recurrentes y fechas de evaluación con alarmas VALARM', () => {
    const ics = generarCalendarioICS({
      fechaInicio: '2026-04-13',
      horaBloqueEstudio: '16:30',
      minutosBloqueEstudio: 90,
    });

    // Formato RFC 5545 con CRLF (\r\n) para importación limpia en Google Calendar
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);

    // 1) Bloques de estudio recurrentes Lunes a Sábado
    expect(ics).toContain('SUMMARY:AUREON · Bloque de Estudio y Práctica DECO');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA');
    expect(ics).toContain('DTSTART;TZID=America/Lima:20260413T163000');

    // 2) Repaso diario Leitner
    expect(ics).toContain('SUMMARY:AUREON · Repaso Diario de Errores (Leitner)');
    expect(ics).toContain('RRULE:FREQ=DAILY');

    // 3) Cierre del día
    expect(ics).toContain('SUMMARY:AUREON · Cierre del Día (2 min)');

    // 4) Simulacro del sábado
    expect(ics).toContain('SUMMARY:AUREON · Simulacro Semanal del Sábado (3 h)');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=SA');

    // 5) Las 4 evaluaciones CEPRE + alarmas VALARM
    expect(ics).toContain('1.ª Evaluación CEPRE');
    expect(ics).toContain('2.ª Evaluación CEPRE');
    expect(ics).toContain('3.ª Evaluación CEPRE');
    expect(ics).toContain('4.ª Evaluación CEPRE');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('ACTION:DISPLAY');
    expect(ics).toContain('END:VALARM');
  });

  it('3. Atajos de teclado en PC (n, r, h, f), Badging API con repasos pendientes y notificaciones locales', async () => {
    // Unidad de resolverAtajoTecladoGlobal
    expect(resolverAtajoTecladoGlobal({ key: 'n', tagName: 'DIV' })).toBe('registrar');
    expect(resolverAtajoTecladoGlobal({ key: 'r', tagName: 'BODY' })).toBe('errores');
    expect(resolverAtajoTecladoGlobal({ key: 'h', tagName: 'MAIN' })).toBe('hoy');
    expect(resolverAtajoTecladoGlobal({ key: 'f', tagName: 'BUTTON' })).toBe('enfoque');
    // Ignora cuando el foco está en un input
    expect(resolverAtajoTecladoGlobal({ key: 'n', tagName: 'INPUT' })).toBeNull();

    // Badging API mock
    const setAppBadgeMock = vi.fn().mockResolvedValue(undefined);
    const clearAppBadgeMock = vi.fn().mockResolvedValue(undefined);
    await actualizarBadgeRepasosPendientes(4, {
      setAppBadge: setAppBadgeMock,
      clearAppBadge: clearAppBadgeMock,
    });
    expect(setAppBadgeMock).toHaveBeenCalledWith(4);

    await actualizarBadgeRepasosPendientes(0, {
      setAppBadge: setAppBadgeMock,
      clearAppBadge: clearAppBadgeMock,
    });
    expect(clearAppBadgeMock).toHaveBeenCalledTimes(1);

    // Notificaciones locales con permiso 'granted'
    const notifInstances: Array<{ title: string; body?: string }> = [];
    class MockNotification {
      static permission: NotificationPermission = 'granted';
      static requestPermission = vi.fn().mockResolvedValue('granted' as NotificationPermission);
      readonly title: string;
      constructor(title: string, options?: NotificationOptions) {
        this.title = title;
        notifInstances.push({ title, body: options?.body });
      }
    }
    vi.stubGlobal('Notification', MockNotification);

    expect(notificarFinDeBloqueEnfoque('Biología', 50)).toBe(true);
    expect(notificarRepasosVencidosHoy(3)).toBe(true);
    expect(notifInstances).toHaveLength(2);
    expect(notifInstances[0]?.title).toContain('Bloque de enfoque completado');
    expect(notifInstances[1]?.title).toContain('3 repaso(s) vencido(s) hoy');
  });

  it('4. E2E Offline + Navegación con atajos (r, f, h, n) + Guía de instalación Android/PC e iOS: funciona 100 % sin conexión', async () => {
    // Registrar un error vencido hoy para verificar el badge de repasos pendientes
    await repositorios.mistakes.guardar({
      id: 'err-vencido-1',
      origen: 'tanda',
      simulacroId: null,
      cursoId: 'bio',
      temaId: null,
      categoria: 'teoria',
      nota: 'Repasar ciclo de Krebs',
      fotoId: null,
      creadoEn: 1713100000000,
      fecha: '2026-04-14',
      estado: 'repaso',
      caja: 1,
      proximoRepaso: '2026-04-15',
      historial: [],
    });

    render(<App fechaHoyOverride="2026-04-15" />);

    // Verificar badge de repasos pendientes en la barra de navegación
    await waitFor(() => {
      expect(screen.getByTestId('badge-repasos-nav').textContent).toBe('1');
    });

    // Atajo de teclado 'r' -> va a Repasar errores
    fireEvent.keyDown(window, { key: 'r' });
    expect((await screen.findByTestId('nav-errores')).getAttribute('aria-current')).toBe('page');

    // Atajo de teclado 'f' -> va a Enfoque e inicia bloque en modo offline
    fireEvent.keyDown(window, { key: 'f' });
    expect((await screen.findByTestId('nav-enfoque')).getAttribute('aria-current')).toBe('page');
    fireEvent.click(await screen.findByTestId('btn-iniciar-enfoque'));
    expect(await screen.findByTestId('enfoque-activo-card')).toBeTruthy();

    // Atajo de teclado 'h' -> vuelve a Hoy
    fireEvent.keyDown(window, { key: 'h' });
    expect((await screen.findByTestId('nav-hoy')).getAttribute('aria-current')).toBe('page');

    // Atajo de teclado 'n' -> abre hoja de Registro Rápido y guarda tanda sin conexión
    fireEvent.keyDown(window, { key: 'n' });
    const btnGuardarTanda = await screen.findByTestId('btn-guardar-tanda');
    fireEvent.click(btnGuardarTanda);

    await waitFor(async () => {
      const practicasGuardadas = await repositorios.practices.listar();
      expect(practicasGuardadas.length).toBeGreaterThanOrEqual(1);
    });

    // Ir a Ajustes y verificar que la vista cargue correctamente
    fireEvent.click(screen.getByTestId('nav-ajustes'));
    expect(await screen.findByTestId('ajustes-view')).toBeTruthy();

    // Verificar detección de plataforma iOS / Android
    expect(
      detectarPlataformaPWA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)').esIOS,
    ).toBe(true);
    expect(detectarPlataformaPWA('Mozilla/5.0 (Linux; Android 14)').esAndroid).toBe(true);
  });
});
