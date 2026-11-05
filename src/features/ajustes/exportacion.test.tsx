// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import {
  construirReporteTemasAReforzar,
  db,
  ENCABEZADOS_CSV_ERRORES,
  generarCSVMistakes,
  generarCSVSimulacros,
  repositorios,
  UTF8_BOM,
  type Mistake,
  type Simulacro,
} from '../../data';
import { temasDeCurso } from '../../domain';

describe('Feature Exportación y Ajustes (PROMPT 9)', () => {
  beforeEach(async () => {
    await db.borrarDatosEstudio();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('1. CSV de matriz de errores: incluye UTF-8 BOM para Excel, tildes, las 9 columnas y filtra por curso, categoría y estado', () => {
    const temaBioS1 = temasDeCurso('bio')[0]?.id ?? 'bio-s01';
    const errores: Mistake[] = [
      {
        id: 'e1',
        origen: 'tanda',
        simulacroId: null,
        cursoId: 'bio',
        temaId: temaBioS1,
        categoria: 'teoria',
        nota: 'Confundí ósmosis, difusión y "transporte activo"',
        fotoId: null,
        creadoEn: 1713100000000,
        fecha: '2026-04-14',
        estado: 'abierto',
        caja: 1,
        proximoRepaso: '2026-04-15',
        historial: [],
      },
      {
        id: 'e2',
        origen: 'simulacro',
        simulacroId: 'sim-1',
        cursoId: 'fis',
        temaId: null,
        categoria: 'calculo',
        nota: 'Error de signo en caída libre',
        fotoId: null,
        creadoEn: 1713180000000,
        fecha: '2026-04-15',
        estado: 'repaso',
        caja: 3,
        proximoRepaso: '2026-04-20',
        historial: [],
      },
      {
        id: 'e3',
        origen: 'tanda',
        simulacroId: null,
        cursoId: 'bio',
        temaId: temaBioS1,
        categoria: 'duda',
        nota: 'Duda entre A y C',
        fotoId: null,
        creadoEn: 1713190000000,
        fecha: '2026-04-15',
        estado: 'dominado',
        caja: 7,
        proximoRepaso: null,
        historial: [],
      },
    ];

    const csvCompleto = generarCSVMistakes(errores);

    // Verifica UTF-8 BOM al inicio para que Excel abra bien tildes y eñes
    expect(csvCompleto.startsWith(UTF8_BOM)).toBe(true);

    const lineas = csvCompleto.slice(UTF8_BOM.length).split('\r\n');
    expect(lineas).toHaveLength(4); // encabezado + 3 filas
    expect(lineas[0]).toBe(ENCABEZADOS_CSV_ERRORES.join(','));

    // Verifica tildes, grupo cognitivo/procedimental/mixto y escapado RFC 4180 de comas y comillas
    expect(lineas[1]).toContain('2026-04-14,Biología,');
    expect(lineas[1]).toContain(
      ',Falta de teoría,cognitivo,"Confundí ósmosis, difusión y ""transporte activo""",abierto,1,tanda',
    );
    expect(lineas[2]).toContain(
      '2026-04-15,Física,Sin tema específico,Error de cálculo,procedimental,Error de signo en caída libre,repaso,3,simulacro',
    );
    expect(lineas[3]).toContain(
      ',Duda entre dos alternativas,mixto,Duda entre A y C,dominado,7,tanda',
    );

    // Filtro por curso ('bio'), categoría ('teoria') y estado ('abierto')
    const csvFiltrado = generarCSVMistakes(errores, {
      curso: 'bio',
      categoria: 'teoria',
      estado: 'abierto',
    });
    const lineasFiltradas = csvFiltrado.slice(UTF8_BOM.length).split('\r\n');
    expect(lineasFiltradas).toHaveLength(2);
    expect(lineasFiltradas[1]).toContain('Biología');
  });

  it('2. CSV de simulacros: incluye UTF-8 BOM, fecha y hora, tipo, puntaje por sección y por curso, total y acumulado directo', () => {
    const simulacros: Simulacro[] = [
      {
        id: 'sim-1',
        ts: new Date('2026-04-10T14:30:00-05:00').getTime(),
        fecha: '2026-04-10',
        tipo: 'cepre1',
        secciones: {
          act: { ok: 9, bad: 1, blanco: 0 },
          hab: { ok: 25, bad: 5, blanco: 0 },
          conoc: { ok: 50, bad: 10, blanco: 10 },
        },
        porCurso: {
          hv: { ok: 13, bad: 2, blanco: 0 },
          bio: { ok: 8, bad: 2, blanco: 0 },
        },
        total: 252,
        revisado: true,
      },
      {
        id: 'sim-2',
        ts: new Date('2026-05-08T15:15:00-05:00').getTime(),
        fecha: '2026-05-08',
        tipo: 'cepre2',
        secciones: {
          act: { ok: 10, bad: 0, blanco: 0 },
          hab: { ok: 26, bad: 4, blanco: 0 },
          conoc: { ok: 55, bad: 10, blanco: 5 },
        },
        porCurso: {
          hv: { ok: 14, bad: 1, blanco: 0 },
          bio: { ok: 9, bad: 1, blanco: 0 },
        },
        total: 318.5,
        revisado: true,
      },
    ];

    const csvSim = generarCSVSimulacros(simulacros);
    expect(csvSim.startsWith(UTF8_BOM)).toBe(true);

    const lineas = csvSim.slice(UTF8_BOM.length).split('\r\n');
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toContain(
      'Fecha y hora,Tipo,Puntaje Actitud,Puntaje Habilidades,Puntaje Conocimientos,Puntaje por curso',
    );
    expect(lineas[0]).toContain(',Total,Acumulado');

    // Fila 1: 1.ª Evaluación CEPRE -> Total 252.000, Acumulado 252.000
    expect(lineas[1]).toContain('2026-04-10 14:30,1.ª Evaluación CEPRE,');
    expect(lineas[1]).toContain('Habilidad Verbal:');
    expect(lineas[1]).toContain(',252.000,252.000');

    // Fila 2: 2.ª Evaluación CEPRE -> Total 318.500, Acumulado 570.500 (252 + 318.5 suma directa)
    expect(lineas[2]).toContain('2026-05-08 15:15,2.ª Evaluación CEPRE,');
    expect(lineas[2]).toContain(',318.500,570.500');
  });

  it('3. PDF imprimible "Temas a reforzar" y Respaldo .json en Ajustes: agrupa por curso y tema con cantidad y categoría dominante, y sale limpio en A4 con tema oscuro activo', async () => {
    const temaBioS1 = temasDeCurso('bio')[0]?.id ?? 'bio-s01';
    await repositorios.mistakes.guardarLote([
      {
        id: 'm1',
        origen: 'tanda',
        simulacroId: null,
        cursoId: 'bio',
        temaId: temaBioS1,
        categoria: 'lectura',
        nota: 'No leí EXCEPTO',
        fotoId: null,
        creadoEn: 1713100000000,
        fecha: '2026-04-14',
        estado: 'abierto',
        caja: 1,
        proximoRepaso: '2026-04-15',
        historial: [],
      },
      {
        id: 'm2',
        origen: 'tanda',
        simulacroId: null,
        cursoId: 'bio',
        temaId: temaBioS1,
        categoria: 'lectura',
        nota: 'Omití condición',
        fotoId: null,
        creadoEn: 1713100500000,
        fecha: '2026-04-14',
        estado: 'repaso',
        caja: 2,
        proximoRepaso: '2026-04-16',
        historial: [],
      },
      {
        id: 'm3',
        origen: 'tanda',
        simulacroId: null,
        cursoId: 'bio',
        temaId: temaBioS1,
        categoria: 'teoria',
        nota: 'Falta repasar organelos',
        fotoId: null,
        creadoEn: 1713100900000,
        fecha: '2026-04-14',
        estado: 'abierto',
        caja: 1,
        proximoRepaso: '2026-04-15',
        historial: [],
      },
    ]);

    // Verificar selector puro
    const listaMistakes = await repositorios.mistakes.listar();
    const reporte = construirReporteTemasAReforzar(listaMistakes);
    expect(reporte.totalErroresIncluidos).toBe(3);
    expect(reporte.cursos).toHaveLength(1);
    expect(reporte.cursos[0]?.cursoNombre).toBe('Biología');
    expect(reporte.cursos[0]?.temas[0]?.cantidadErrores).toBe(3);
    expect(reporte.cursos[0]?.temas[0]?.categoriaDominante).toBe('Mala lectura de la premisa');

    const printSpy = vi.fn();
    window.print = printSpy;

    render(<App fechaHoyOverride="2026-04-15" />);

    // Verificar que el tema oscuro está activo por defecto
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark-modern');

    // Navegar a Ajustes
    fireEvent.click(await screen.findByTestId('nav-ajustes'));

    // Verificar hoja de estilos de impresión A4 en blanco y negro aun con tema oscuro activo
    const printStyles = (await screen.findByTestId('print-stylesheet-a4')).textContent ?? '';
    expect(printStyles).toContain('size: A4 portrait');
    expect(printStyles).toContain('@media print');
    expect(printStyles).toContain("html[data-theme='dark-modern']");
    expect(printStyles).toContain('--bg: #ffffff !important');
    expect(printStyles).toContain('--text: #000000 !important');

    // Verificar que la hoja imprimible "Temas a reforzar" agrupa por curso y tema con cantidad y categoría dominante
    const hojaA4 = await screen.findByTestId('hoja-imprimible-temas-reforzar');
    expect(hojaA4.className).toContain('print-temas-reforzar');
    expect(hojaA4.className).toContain('bg-white');
    expect(hojaA4.className).toContain('text-black');
    // Asegurar que no usa 'text-text' dentro de la hoja blanca (evita texto blanco sobre fondo blanco en temas oscuros)
    expect(hojaA4.innerHTML).not.toContain('text-text');
    expect(hojaA4.innerHTML).toContain('text-black');

    await waitFor(() => {
      expect(screen.getByTestId('print-curso-bio').textContent).toContain('Biología');
      expect(screen.getByTestId('print-curso-bio').textContent).toContain('3 error(es)');
      expect(screen.getByTestId('print-curso-bio').textContent).toContain(
        'Mala lectura de la premisa',
      );
    });

    // Pulsar botón de impresión invoca window.print()
    fireEvent.click(screen.getByTestId('btn-imprimir-temas-reforzar'));
    expect(printSpy).toHaveBeenCalledTimes(1);

    // Verificar que el respaldo completo .json y los botones CSV están accesibles en Ajustes
    expect(screen.getByTestId('btn-exportar-json-aureon')).toBeTruthy();
    expect(screen.getByTestId('btn-exportar-csv-errores')).toBeTruthy();
    expect(screen.getByTestId('btn-exportar-csv-simulacros')).toBeTruthy();
  });
});
