import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CATALOGO_CATEGORIAS_ERROR,
  CATEGORIAS_ERROR,
  CATEGORIAS_RECURSO,
  construirReporteTemasAReforzar,
  descargarArchivoTexto,
  ESTADOS_MISTAKE,
  exportarAureonJSON,
  filtrarErroresParaExportacion,
  generarCSVMistakes,
  generarCSVSimulacros,
  importarAureonJSON,
  importarRespaldoV4EnDB,
  listarCopiasAutorrespaldo,
  RECURSOS_ENLACES_POR_DEFECTO,
  restaurarDesdeCopiaAutorrespaldo,
  verificarRecordatorioDescargaManual,
  type AutoBackupEntry,
  type CategoriaError,
  type CategoriaRecurso,
  type CursoOMixId,
  type EstadoIndicadorSync,
  type EstadoMistake,
  type Mistake,
  type RecursoEnlace,
  type ReporteImportacionV4,
  type SesionUsuarioSync,
  type Settings,
  type Simulacro,
} from '../../data';
import { buscarCarrera, CARRERAS, CICLO_POR_DEFECTO, CURSOS, type FechaISO } from '../../domain';
import { Button } from '../../ui';

const ETIQUETAS_CATEGORIA_RECURSO: Readonly<Record<CategoriaRecurso, string>> = {
  boletines: 'Boletines Drive',
  solucionarios: 'Solucionarios',
  simulacros: 'Simulacros',
  otro: 'Otro recurso',
};

export interface AjustesViewProps {
  fechaHoy: FechaISO;
  settings: Settings;
  mistakes: readonly Mistake[];
  simulacros: readonly Simulacro[];
  repasosPendientesHoy?: number;
  sesionSync?: SesionUsuarioSync | null;
  estadoSync?: EstadoIndicadorSync;
  onCambiarSesionSync?: (
    nuevaSesion: SesionUsuarioSync | null,
    nuevoEstado: EstadoIndicadorSync,
  ) => void;
  onActualizarSettings: (parcial: Partial<Settings>) => Promise<void>;
  onDatosImportados: (mensaje: string) => Promise<void>;
}

export const ESTILOS_IMPRESION_A4 = `
@page {
  size: A4 portrait;
  margin: 12mm;
}
@media print {
  :root,
  html,
  html[data-theme='dark-modern'],
  html[data-theme='gamificado'],
  html[data-theme='oled'],
  html[data-theme='clinico'],
  html[data-theme='personalizado'],
  body {
    --bg: #ffffff !important;
    --surface: #ffffff !important;
    --surface-2: #ffffff !important;
    --border: #000000 !important;
    --text: #000000 !important;
    --text-muted: #1f2937 !important;
    --accent: #000000 !important;
    background: #ffffff !important;
    color: #000000 !important;
    color-scheme: light !important;
  }
  header, nav, button, [data-testid='app-header'], [data-testid='fab-registro-rapido'], .no-print {
    display: none !important;
  }
  .print-temas-reforzar {
    display: block !important;
    background-color: #ffffff !important;
    color: #000000 !important;
    border-color: #000000 !important;
    box-shadow: none !important;
  }
}
`;

export function AjustesView({
  fechaHoy,
  settings,
  mistakes,
  simulacros,
  onActualizarSettings,
  onDatosImportados,
}: AjustesViewProps) {
  // Filtros para exportación CSV de matriz de errores
  const [filtroCursoErrores, setFiltroCursoErrores] = useState<CursoOMixId | 'todos'>('todos');
  const [filtroCategoriaErrores, setFiltroCategoriaErrores] = useState<
    CategoriaError | 'todas' | 'sin_clasificar'
  >('todas');
  const [filtroEstadoErrores, setFiltroEstadoErrores] = useState<EstadoMistake | 'todos'>('todos');

  // Estado local para reporte de importación y avisos
  const [mensajeEstado, setMensajeEstado] = useState<string | null>(null);
  const [errorImportacion, setErrorImportacion] = useState<string | null>(null);
  const [reporteV4, setReporteV4] = useState<ReporteImportacionV4 | null>(null);
  const [copiasAutorrespaldo, setCopiasAutorrespaldo] = useState<AutoBackupEntry[]>([]);
  const [recordatorioDescarga, setRecordatorioDescarga] = useState<{
    debeRecordar: boolean;
    diasSinDescargar: number | null;
  }>({ debeRecordar: false, diasSinDescargar: null });

  useEffect(() => {
    let cancelado = false;
    void Promise.all([listarCopiasAutorrespaldo(), verificarRecordatorioDescargaManual()]).then(
      ([copias, recordatorio]) => {
        if (!cancelado) {
          setCopiasAutorrespaldo(copias);
          setRecordatorioDescarga(recordatorio);
        }
      },
    );
    return () => {
      cancelado = true;
    };
  }, []);

  const carreraActual = useMemo(() => {
    try {
      return buscarCarrera(settings.carreraId);
    } catch {
      return buscarCarrera('medicina-humana');
    }
  }, [settings.carreraId]);

  const erroresFiltradosCSV = useMemo(
    () =>
      filtrarErroresParaExportacion(mistakes, {
        curso: filtroCursoErrores,
        categoria: filtroCategoriaErrores,
        estado: filtroEstadoErrores,
      }),
    [mistakes, filtroCursoErrores, filtroCategoriaErrores, filtroEstadoErrores],
  );

  const reporteTemasReforzar = useMemo(() => construirReporteTemasAReforzar(mistakes), [mistakes]);

  // Gestión de Recursos y Enlaces Editables (Drive de boletines, solucionarios, simulacros)
  const [nuevoTituloRecurso, setNuevoTituloRecurso] = useState<string>('');
  const [nuevaCatRecurso, setNuevaCatRecurso] = useState<CategoriaRecurso>('boletines');
  const [nuevaUrlRecurso, setNuevaUrlRecurso] = useState<string>('');

  const recursosActuales: RecursoEnlace[] = settings.recursosEnlaces ?? [
    ...RECURSOS_ENLACES_POR_DEFECTO,
  ];

  const manejarEditarEnlaceExistente = async (
    id: string,
    parcial: Partial<Omit<RecursoEnlace, 'id'>>,
  ) => {
    const actualizados = recursosActuales.map((r) => (r.id === id ? { ...r, ...parcial } : r));
    await onActualizarSettings({ recursosEnlaces: actualizados });
  };

  const manejarEliminarRecurso = async (id: string) => {
    const actualizados = recursosActuales.filter((r) => r.id !== id);
    await onActualizarSettings({ recursosEnlaces: actualizados });
  };

  const manejarAgregarRecurso = async (e: FormEvent) => {
    e.preventDefault();
    if (!nuevoTituloRecurso.trim() || !nuevaUrlRecurso.trim()) return;
    const nuevo: RecursoEnlace = {
      id: 'rec-' + Date.now().toString(36),
      titulo: nuevoTituloRecurso.trim(),
      categoria: nuevaCatRecurso,
      url: nuevaUrlRecurso.trim(),
    };
    await onActualizarSettings({ recursosEnlaces: [...recursosActuales, nuevo] });
    setNuevoTituloRecurso('');
    setNuevaUrlRecurso('');
    setMensajeEstado(`Enlace «${nuevo.titulo}» añadido con éxito.`);
  };

  const manejarDescargarCSVErrores = () => {
    const csv = generarCSVMistakes(mistakes, {
      curso: filtroCursoErrores,
      categoria: filtroCategoriaErrores,
      estado: filtroEstadoErrores,
    });
    descargarArchivoTexto(`aureon-errores-${fechaHoy}.csv`, csv, 'text/csv;charset=utf-8;');
    setMensajeEstado(
      `CSV de errores exportado (${erroresFiltradosCSV.length} registros con UTF-8 BOM para Excel).`,
    );
  };

  const manejarDescargarCSVSimulacros = () => {
    const csv = generarCSVSimulacros(simulacros);
    descargarArchivoTexto(`aureon-simulacros-${fechaHoy}.csv`, csv, 'text/csv;charset=utf-8;');
    setMensajeEstado(`CSV de simulacros exportado (${simulacros.length} evaluaciones).`);
  };

  const manejarImprimirTemasReforzar = () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  const manejarDescargarRespaldoJSON = async () => {
    setErrorImportacion(null);
    const json = await exportarAureonJSON(undefined, { marcarDescargaManual: true });
    descargarArchivoTexto(
      `aureon-respaldo-${fechaHoy}.json`,
      json,
      'application/json;charset=utf-8;',
    );
    const recordatorio = await verificarRecordatorioDescargaManual();
    setRecordatorioDescarga(recordatorio);
    setMensajeEstado('Respaldo completo .json de AUREON descargado correctamente.');
  };

  const manejarRestaurarAutorrespaldo = async (idCopia: string) => {
    setErrorImportacion(null);
    try {
      await restaurarDesdeCopiaAutorrespaldo(idCopia);
      setMensajeEstado(`Copia automática (${idCopia}) restaurada con éxito.`);
      await onDatosImportados('Autorrespaldo semanal restaurado');
    } catch (err) {
      setErrorImportacion(
        err instanceof Error ? err.message : 'No se pudo restaurar la copia automática.',
      );
    }
  };

  const procesarArchivoJSONGenerico = async (texto: string) => {
    setErrorImportacion(null);
    setReporteV4(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(texto);
    } catch {
      throw new Error('El archivo no contiene un formato JSON válido.');
    }

    // Detección inteligente: Si es formato nativo de AUREON (aureon-backup o contiene objeto datos con practices)
    const esRespaldoNativo =
      parsed !== null &&
      typeof parsed === 'object' &&
      (('app' in parsed && (parsed as { app: unknown }).app === 'aureon-backup') ||
        ('datos' in parsed &&
          typeof (parsed as { datos: unknown }).datos === 'object' &&
          (parsed as { datos: Record<string, unknown> }).datos !== null &&
          'practices' in (parsed as { datos: Record<string, unknown> }).datos));

    if (esRespaldoNativo) {
      await importarAureonJSON(parsed);
      setMensajeEstado('Respaldo .json de AUREON restaurado con éxito.');
      await onDatosImportados('Respaldo AUREON restaurado');
      return;
    }

    // En caso contrario, intentar como respaldo de migración V4 (o envoltorio v4)
    try {
      const { reporte } = await importarRespaldoV4EnDB(parsed);
      setReporteV4(reporte);
      setMensajeEstado('Migración desde el respaldo v4 completada.');
      await onDatosImportados('Respaldo v4 importado con éxito');
    } catch (errV4) {
      // Si falló como V4, intentar importar como AUREON por si faltaba alguna cabecera
      try {
        await importarAureonJSON(parsed);
        setMensajeEstado('Respaldo .json de AUREON restaurado con éxito.');
        await onDatosImportados('Respaldo AUREON restaurado');
      } catch {
        throw errV4 instanceof Error
          ? errV4
          : new Error('No se reconoció el archivo como respaldo de AUREON ni como respaldo del v4.');
      }
    }
  };

  const manejarArchivoAureonJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const texto = await file.text();
      await procesarArchivoJSONGenerico(texto);
    } catch (err) {
      setErrorImportacion(err instanceof Error ? err.message : 'Archivo .json de AUREON inválido.');
    } finally {
      e.target.value = '';
    }
  };

  const manejarArchivoV4JSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const texto = await file.text();
      await procesarArchivoJSONGenerico(texto);
    } catch (err) {
      setErrorImportacion(
        err instanceof Error ? err.message : 'No se pudo importar el archivo de respaldo.',
      );
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div data-testid="ajustes-view" className="space-y-6">
      <style data-testid="print-stylesheet-a4">{ESTILOS_IMPRESION_A4}</style>
      {/* Controles y tarjetas de pantalla (se ocultan al imprimir el PDF A4) */}
      <div className="no-print space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-text">Ajustes, Exportación y Respaldos</h1>
            <p className="text-xs text-text-muted">
              Exporta CSV compatibles con Excel (UTF-8 con BOM), imprime la hoja A4 de temas a
              reforzar o gestiona tu respaldo completo <code className="font-mono">.json</code>.
            </p>
          </div>
        </div>

        {mensajeEstado && (
          <div
            data-testid="ajustes-mensaje-estado"
            role="status"
            className="rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-xs font-semibold text-success"
          >
            {mensajeEstado}
          </div>
        )}

        {errorImportacion && (
          <div
            data-testid="ajustes-error-importacion"
            role="alert"
            className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-xs font-semibold text-danger"
          >
            {errorImportacion}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 1. CSV de Matriz de Errores */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-bold text-text">
              1. Exportar Matriz de Errores (CSV para Excel)
            </h2>
            <p className="mb-3 text-xs text-text-muted">
              Incluye marca UTF-8 con BOM para abrir directamente en Microsoft Excel conservando
              tildes y eñes. Columnas: fecha, curso, tema, categoría, grupo, nota, estado, caja de
              repaso y origen.
            </p>

            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                <span>Curso</span>
                <select
                  aria-label="Filtrar CSV de errores por curso"
                  data-testid="csv-errores-filtro-curso"
                  value={filtroCursoErrores}
                  onChange={(e) => setFiltroCursoErrores(e.target.value as CursoOMixId | 'todos')}
                  className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text"
                >
                  <option value="todos">Todos los cursos</option>
                  {CURSOS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                  <option value="mix">Mixto / General</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-text-muted">
                <span>Categoría</span>
                <select
                  aria-label="Filtrar CSV de errores por categoría"
                  data-testid="csv-errores-filtro-categoria"
                  value={filtroCategoriaErrores}
                  onChange={(e) =>
                    setFiltroCategoriaErrores(
                      e.target.value as CategoriaError | 'todas' | 'sin_clasificar',
                    )
                  }
                  className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text"
                >
                  <option value="todas">Todas las categorías</option>
                  <option value="sin_clasificar">Por clasificar</option>
                  {CATEGORIAS_ERROR.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATALOGO_CATEGORIAS_ERROR[cat].etiqueta}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-text-muted">
                <span>Estado</span>
                <select
                  aria-label="Filtrar CSV de errores por estado"
                  data-testid="csv-errores-filtro-estado"
                  value={filtroEstadoErrores}
                  onChange={(e) =>
                    setFiltroEstadoErrores(e.target.value as EstadoMistake | 'todos')
                  }
                  className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text"
                >
                  <option value="todos">Todos los estados</option>
                  {ESTADOS_MISTAKE.map((est) => (
                    <option key={est} value={est}>
                      {est}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                data-testid="csv-errores-contador"
                className="font-mono text-xs font-semibold text-text-muted"
              >
                {erroresFiltradosCSV.length} error(es) coinciden con el filtro
              </span>
              <Button
                variant="primary"
                size="sm"
                data-testid="btn-exportar-csv-errores"
                onClick={manejarDescargarCSVErrores}
              >
                Descargar CSV de Errores
              </Button>
            </div>
          </section>

          {/* 2. CSV de Simulacros */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-bold text-text">
              2. Exportar Historial de Simulacros (CSV para Excel)
            </h2>
            <p className="mb-3 text-xs text-text-muted">
              Exporta fecha y hora, tipo de evaluación, puntaje por sección (Actitud, Habilidades,
              Conocimientos), desglose por cada uno de los 19 cursos, puntaje total y acumulado
              CEPRE progresivo (suma directa).
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                data-testid="csv-simulacros-contador"
                className="font-mono text-xs font-semibold text-text-muted"
              >
                {simulacros.length} simulacro(s) registrado(s)
              </span>
              <Button
                variant="primary"
                size="sm"
                data-testid="btn-exportar-csv-simulacros"
                onClick={manejarDescargarCSVSimulacros}
              >
                Descargar CSV de Simulacros
              </Button>
            </div>
          </section>

          {/* 3. Respaldo Completo .json y Migración v4 */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-bold text-text">
              3. Respaldo Completo .json (AUREON y Migración v4)
            </h2>
            <p className="mb-3 text-xs text-text-muted">
              Descarga una copia completa y versionada de tu base de datos local en formato{' '}
              <code className="font-mono">.json</code> o restaura desde un archivo previo.
            </p>
            {recordatorioDescarga.debeRecordar && (
              <div
                data-testid="banner-recordatorio-respaldo"
                role="status"
                className="mb-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs font-semibold text-warn"
              >
                {recordatorioDescarga.diasSinDescargar === null
                  ? 'Aún no has descargado una copia manual .json en este dispositivo. Descárgala para proteger tus datos ante pérdida del teléfono.'
                  : `Han pasado ${recordatorioDescarga.diasSinDescargar} días desde tu última copia manual .json. Recomendamos descargar un respaldo hoy.`}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                data-testid="btn-exportar-json-aureon"
                onClick={() => void manejarDescargarRespaldoJSON()}
              >
                Descargar Respaldo .json
              </Button>

              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface">
                <span>Restaurar .json AUREON</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  data-testid="input-importar-json-aureon"
                  onChange={(e) => void manejarArchivoAureonJSON(e)}
                  className="sr-only"
                />
              </label>

              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text">
                <span>Importar legado v4 (.json)</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  data-testid="input-importar-json-v4"
                  onChange={(e) => void manejarArchivoV4JSON(e)}
                  className="sr-only"
                />
              </label>
            </div>

            {copiasAutorrespaldo.length > 0 && (
              <div
                data-testid="lista-copias-autorrespaldo"
                className="mt-3 rounded-lg border border-border bg-surface-2/60 p-2.5 text-xs"
              >
                <p className="font-semibold text-text">
                  Copias automáticas semanales en dispositivo ({copiasAutorrespaldo.length}/8):
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {copiasAutorrespaldo.map((copia) => (
                    <button
                      key={copia.id}
                      type="button"
                      data-testid={`btn-restaurar-autorrespaldo-${copia.id}`}
                      onClick={() => void manejarRestaurarAutorrespaldo(copia.id)}
                      className="min-h-8 rounded border border-border bg-surface px-2 py-1 font-mono text-[11px] font-semibold text-text-muted hover:border-accent hover:text-text"
                    >
                      Restaurar {copia.semanaClave}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {reporteV4 && (
              <div
                data-testid="reporte-migracion-v4"
                className="mt-3 rounded-lg border border-border bg-surface-2 p-2.5 text-xs text-text"
              >
                <p className="font-bold">Reporte de importación v4:</p>
                <p className="mt-1 text-text-muted">
                  Prácticas de sesiones: {reporteV4.importados.practicesDeSesiones} (sin detalle de
                  log: {reporteV4.importados.practicesSinDetalleDeLog}) · Errores:{' '}
                  {reporteV4.importados.mistakes} · Simulacros: {reporteV4.importados.simulacros} ·
                  Temas: {reporteV4.importados.topicProgress} · Sesiones de enfoque:{' '}
                  {reporteV4.importados.focusSessionsManuales}
                </p>
              </div>
            )}

            {/* Ajustes de Accesibilidad: Tamaño de Texto y Alto Contraste */}
            <div className="mt-4 border-t border-border pt-3.5 space-y-3">
              <div>
                <h3 className="text-xs font-bold text-text uppercase tracking-wider">
                  Accesibilidad y Legibilidad
                </h3>
                <p className="text-[11px] text-text-muted">
                  Aumenta el tamaño del texto o activa alto contraste para sesiones de estudio
                  prolongadas.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  <span>Tamaño del texto</span>
                  <select
                    data-testid="select-ajustes-tamano-texto"
                    value={settings.tamanoTexto ?? 'normal'}
                    onChange={(e) => {
                      const nuevo = e.target.value as 'normal' | 'grande' | 'extra';
                      document.documentElement.setAttribute('data-text-size', nuevo);
                      void onActualizarSettings({ tamanoTexto: nuevo });
                    }}
                    className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text"
                  >
                    <option value="normal">Normal (Estándar 100%)</option>
                    <option value="grande">Grande (+15%)</option>
                    <option value="extra">Extra Grande (+30%)</option>
                  </select>
                </label>

                <div className="flex flex-col justify-between gap-1 rounded-lg border border-border bg-surface-2 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text">Alto contraste</span>
                    <input
                      type="checkbox"
                      data-testid="toggle-ajustes-alto-contraste"
                      checked={settings.altoContraste ?? false}
                      onChange={(e) => {
                        const val = e.target.checked;
                        document.documentElement.setAttribute(
                          'data-high-contrast',
                          val ? 'true' : 'false',
                        );
                        void onActualizarSettings({ altoContraste: val });
                      }}
                      className="h-4 w-4 cursor-pointer rounded border-border text-accent focus:ring-accent"
                    />
                  </div>
                  <p className="text-[10px] text-text-muted">
                    Bordes reforzados para luz solar o fatiga visual.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 4. Carrera y Objetivos de Ingreso */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-bold text-text">4. Carrera y Objetivos de Ingreso</h2>
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                <span>Carrera objetivo</span>
                <select
                  aria-label="Seleccionar carrera objetivo"
                  data-testid="select-ajustes-carrera"
                  value={carreraActual.id}
                  onChange={(e) => void onActualizarSettings({ carreraId: e.target.value })}
                  className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text"
                >
                  {CARRERAS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} (Área {c.area}
                      {c.cepreLast === null ? ' · Corte estimado' : ''})
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-text-muted">
                <span>Umbral de seguridad (%)</span>
                <input
                  type="number"
                  min={50}
                  max={95}
                  aria-label="Umbral de seguridad"
                  data-testid="input-ajustes-umbral"
                  value={settings.umbralSeguridad}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val >= 50 && val <= 95) {
                      void onActualizarSettings({ umbralSeguridad: val });
                    }
                  }}
                  className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-text-muted">
                <span>Meta horas semanales</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  aria-label="Meta de horas semanales"
                  data-testid="input-ajustes-meta-horas"
                  value={settings.metaHorasSemana}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val >= 1 && val <= 120) {
                      void onActualizarSettings({ metaHorasSemana: val });
                    }
                  }}
                  className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-text-muted">
                <span>Meta preguntas semanales</span>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  aria-label="Meta de preguntas semanales"
                  data-testid="input-ajustes-meta-preguntas"
                  value={settings.metaPreguntasSemana ?? 85}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val >= 1 && val <= 5000) {
                      void onActualizarSettings({ metaPreguntasSemana: val });
                    }
                  }}
                  className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-text-muted">
                <span>Puntaje mínimo (último proceso)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ej. 1250.50"
                  aria-label="Puntaje mínimo del último proceso"
                  data-testid="input-ajustes-puntaje-min"
                  value={settings.puntajeMinimoUltimoProceso ?? ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : Number(e.target.value);
                    void onActualizarSettings({ puntajeMinimoUltimoProceso: val });
                  }}
                  className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-text-muted">
                <span>Puntaje máximo (último proceso)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ej. 1650.00"
                  aria-label="Puntaje máximo del último proceso"
                  data-testid="input-ajustes-puntaje-max"
                  value={settings.puntajeMaximoUltimoProceso ?? ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : Number(e.target.value);
                    void onActualizarSettings({ puntajeMaximoUltimoProceso: val });
                  }}
                  className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-text-muted">
                <span>Fecha Examen Ordinario UNMSM</span>
                <input
                  type="date"
                  aria-label="Fecha del Examen Ordinario"
                  data-testid="input-ajustes-fecha-ordinario"
                  value={settings.fechaExamenOrdinario ?? ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : e.target.value;
                    void onActualizarSettings({ fechaExamenOrdinario: val });
                  }}
                  className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text"
                />
              </label>
            </div>

            {/* Fechas de Evaluaciones CEPRE San Marcos */}
            <div className="mt-4 border-t border-border pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-text">
                  Fechas del Ciclo y Evaluaciones CEPRE
                </span>
                <button
                  type="button"
                  data-testid="btn-restablecer-fechas-cepre"
                  onClick={() =>
                    void onActualizarSettings({
                      inicioCiclo: CICLO_POR_DEFECTO.inicio,
                      fechasEval: { ...CICLO_POR_DEFECTO.fechasEval },
                    })
                  }
                  className="text-[11px] text-accent hover:underline"
                >
                  Restablecer fechas
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  <span>Inicio del ciclo (Semana 1)</span>
                  <input
                    type="date"
                    data-testid="input-ajustes-inicio-ciclo"
                    value={settings.inicioCiclo}
                    onChange={(e) => void onActualizarSettings({ inicioCiclo: e.target.value })}
                    className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  <span>1er Examen (CEPRE 1)</span>
                  <input
                    type="date"
                    data-testid="input-ajustes-cepre1"
                    value={settings.fechasEval.cepre1}
                    onChange={(e) =>
                      void onActualizarSettings({
                        fechasEval: { ...settings.fechasEval, cepre1: e.target.value },
                      })
                    }
                    className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  <span>2do Examen (CEPRE 2)</span>
                  <input
                    type="date"
                    data-testid="input-ajustes-cepre2"
                    value={settings.fechasEval.cepre2}
                    onChange={(e) =>
                      void onActualizarSettings({
                        fechasEval: { ...settings.fechasEval, cepre2: e.target.value },
                      })
                    }
                    className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  <span>3er Examen (CEPRE 3)</span>
                  <input
                    type="date"
                    data-testid="input-ajustes-cepre3"
                    value={settings.fechasEval.cepre3}
                    onChange={(e) =>
                      void onActualizarSettings({
                        fechasEval: { ...settings.fechasEval, cepre3: e.target.value },
                      })
                    }
                    className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-text-muted sm:col-span-2">
                  <span>4to Examen Final (CEPRE 4)</span>
                  <input
                    type="date"
                    data-testid="input-ajustes-cepre4"
                    value={settings.fechasEval.cepre4}
                    onChange={(e) =>
                      void onActualizarSettings({
                        fechasEval: { ...settings.fechasEval, cepre4: e.target.value },
                      })
                    }
                    className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text"
                  />
                </label>
              </div>
            </div>
          </section>

          {/* 5. Recursos y Enlaces Editables (Boletines, Solucionarios, Simulacros) */}
          <section
            aria-labelledby="sec-recursos-editables"
            data-testid="panel-recursos-editables"
            className="rounded-xl border border-border bg-surface p-4 space-y-4 lg:col-span-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="sec-recursos-editables" className="text-sm font-bold text-text">
                  5. Recursos y Enlaces Editables (Boletines, Solucionarios, Simulacros)
                </h2>
                <p className="text-xs text-text-muted">
                  Agrega tus carpetas de Drive o enlaces web. Aparecerán directamente en tu pantalla{' '}
                  <strong>HOY</strong> para abrirlos con un solo clic.
                </p>
              </div>
              <span className="font-mono text-xs text-text-muted font-semibold">
                {recursosActuales.length} enlace(s) activos
              </span>
            </div>

            {/* Formulario para añadir un nuevo recurso */}
            <form
              onSubmit={(e) => void manejarAgregarRecurso(e)}
              className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-surface-2 p-3 text-xs sm:grid-cols-12 sm:items-end"
            >
              <label className="sm:col-span-4">
                Nuevo recurso (título)
                <input
                  type="text"
                  data-testid="input-nuevo-recurso-titulo"
                  value={nuevoTituloRecurso}
                  onChange={(e) => setNuevoTituloRecurso(e.target.value)}
                  placeholder="Ej. Drive Solucionarios S6"
                  className="mt-1 min-h-10 w-full rounded-lg border border-border bg-surface px-2.5 py-1 text-text"
                />
              </label>
              <label className="sm:col-span-3">
                Categoría
                <select
                  value={nuevaCatRecurso}
                  onChange={(e) => setNuevaCatRecurso(e.target.value as CategoriaRecurso)}
                  className="mt-1 min-h-10 w-full rounded-lg border border-border bg-surface px-2 py-1 text-text"
                >
                  {CATEGORIAS_RECURSO.map((cat) => (
                    <option key={cat} value={cat}>
                      {ETIQUETAS_CATEGORIA_RECURSO[cat]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-3">
                Enlace (URL)
                <input
                  type="url"
                  data-testid="input-nuevo-recurso-url"
                  value={nuevaUrlRecurso}
                  onChange={(e) => setNuevaUrlRecurso(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="mt-1 min-h-10 w-full rounded-lg border border-border bg-surface px-2.5 py-1 font-mono text-text"
                />
              </label>
              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  data-testid="btn-agregar-recurso"
                  className="w-full"
                >
                  + Añadir enlace
                </Button>
              </div>
            </form>

            {/* Lista de enlaces existentes */}
            <div className="space-y-2.5">
              {recursosActuales.map((rec) => (
                <div
                  key={rec.id}
                  data-testid={`item-recurso-${rec.id}`}
                  className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-surface-2 p-3 text-xs sm:grid-cols-12 sm:items-center"
                >
                  <div className="sm:col-span-3">
                    <input
                      type="text"
                      aria-label={`Título de ${rec.titulo}`}
                      data-testid={`input-titulo-recurso-${rec.id}`}
                      value={rec.titulo}
                      onChange={(e) =>
                        void manejarEditarEnlaceExistente(rec.id, { titulo: e.target.value })
                      }
                      className="min-h-10 w-full rounded-lg border border-border bg-surface px-2.5 py-1 font-semibold text-text"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <select
                      aria-label={`Categoría de ${rec.titulo}`}
                      value={rec.categoria}
                      onChange={(e) =>
                        void manejarEditarEnlaceExistente(rec.id, {
                          categoria: e.target.value as CategoriaRecurso,
                        })
                      }
                      className="min-h-10 w-full rounded-lg border border-border bg-surface px-2 py-1 text-text"
                    >
                      {CATEGORIAS_RECURSO.map((cat) => (
                        <option key={cat} value={cat}>
                          {ETIQUETAS_CATEGORIA_RECURSO[cat]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-5">
                    <input
                      type="url"
                      aria-label={`URL de ${rec.titulo}`}
                      data-testid={`input-url-recurso-${rec.id}`}
                      value={rec.url}
                      onChange={(e) =>
                        void manejarEditarEnlaceExistente(rec.id, { url: e.target.value })
                      }
                      className="min-h-10 w-full rounded-lg border border-border bg-surface px-2.5 py-1 font-mono text-text"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-1.5 sm:col-span-2">
                    <a
                      href={rec.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center rounded-lg border border-accent px-2.5 py-1 font-semibold text-accent hover:bg-surface"
                    >
                      Abrir ↗
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`btn-borrar-recurso-${rec.id}`}
                      onClick={() => void manejarEliminarRecurso(rec.id)}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* 6. Barra de acción para Imprimir PDF "Temas a reforzar" */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-4">
          <div>
            <h2 className="text-sm font-bold text-text">
              6. Hoja Imprimible A4: «Temas a reforzar» (PDF sin librerías externas)
            </h2>
            <p className="text-xs text-text-muted">
              Agrupado por curso y tema con cantidad de errores activos y categoría dominante. Al
              imprimir (<code className="font-mono">window.print()</code>) se aplica automáticamente
              tema claro en blanco y negro en una página limpia sin menús, incluso si usas un tema
              oscuro.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            data-testid="btn-imprimir-temas-reforzar"
            onClick={manejarImprimirTemasReforzar}
          >
            Imprimir / Guardar PDF (A4)
          </Button>
        </div>
      </div>

      {/* HOJA IMPRIMIBLE A4: "Temas a reforzar" (visible como vista previa y única zona impresa en @media print) */}
      <section
        data-testid="hoja-imprimible-temas-reforzar"
        aria-label="Hoja imprimible Temas a reforzar"
        className="print-temas-reforzar rounded-xl border border-neutral-300 bg-white p-6 text-black shadow-sm"
      >
        <div className="border-b-2 border-neutral-300 pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-extrabold uppercase tracking-tight text-black">
              AUREON · Temas a reforzar
            </h2>
            <span className="font-mono text-xs font-semibold text-neutral-700">
              Fecha: {fechaHoy} · Carrera: {carreraActual.nombre} (Área {carreraActual.area})
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-800">
            Errores activos considerados:{' '}
            <strong className="text-black">{reporteTemasReforzar.totalErroresIncluidos}</strong> ·
            Agrupados por curso y tema con su causa dominante.
          </p>
        </div>

        {reporteTemasReforzar.cursos.length === 0 ? (
          <p
            data-testid="temas-reforzar-vacio"
            className="py-6 text-center text-xs font-medium text-neutral-700"
          >
            No hay errores abiertos o en repaso pendientes de reforzar.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {reporteTemasReforzar.cursos.map((grupoCurso) => (
              <div
                key={grupoCurso.cursoId}
                data-testid={`print-curso-${grupoCurso.cursoId}`}
                className="break-inside-avoid border border-neutral-300 p-3"
              >
                <div className="mb-2 flex items-center justify-between border-b border-neutral-300 pb-1">
                  <h3 className="text-sm font-bold uppercase text-black">
                    {grupoCurso.cursoNombre}
                  </h3>
                  <span className="font-mono text-xs font-bold text-neutral-900">
                    {grupoCurso.totalErroresCurso} error(es)
                  </span>
                </div>

                <table className="w-full border-collapse text-left text-xs text-neutral-900">
                  <thead>
                    <tr className="border-b border-neutral-300">
                      <th className="py-1 pr-2 font-bold text-black">Tema</th>
                      <th className="w-28 py-1 px-2 text-right font-bold text-black">
                        Cant. errores
                      </th>
                      <th className="w-56 py-1 pl-2 font-bold text-black">Categoría dominante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupoCurso.temas.map((t) => (
                      <tr
                        key={t.temaId ?? `general-${grupoCurso.cursoId}`}
                        className="border-b border-neutral-200 last:border-b-0"
                      >
                        <td className="py-1 pr-2 text-neutral-900">{t.temaEtiqueta}</td>
                        <td className="py-1 px-2 text-right font-mono font-bold text-black">
                          {t.cantidadErrores}
                        </td>
                        <td className="py-1 pl-2 text-neutral-800">
                          {t.categoriaDominante}{' '}
                          <span className="font-mono text-[10px] uppercase text-neutral-600">
                            ({t.grupoDominante})
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
