/**
 * Vista de Errores y Repaso Espaciado Leitner (`ErroresView.tsx`):
 * - Flashcards de repaso diario con intervalos Leitner 1/2/5/10/20/60 días ("Lo recordé" / "Fallé").
 * - Tope diario configurable (por defecto 15) con reparto del excedente en los días siguientes.
 * - Captura directa de error con nota corta y foto opcional (cámara/galería, Blob en IndexedDB con miniatura).
 * - Clasificación de 1 toque para errores "por clasificar".
 */
import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  CATALOGO_CATEGORIAS_ERROR,
  CATEGORIAS_ERROR,
  generarIdEstable,
  type CategoriaError,
  type CursoOMixId,
  type Mistake,
  type MistakePhoto,
} from '../../data';
import {
  activarRepasoError,
  CURSOS,
  evaluarRespuestaLeitner,
  INTERVALOS_LEITNER,
  planificarColaLeitner,
  TEMARIO,
  temasDeCurso,
  TOPE_REPASOS_DIARIO_POR_DEFECTO,
  type CursoId,
  type FechaISO,
} from '../../domain';
import { Button, Chip } from '../../ui';
import { nombreCursoOMix, obtenerChipsCursosRapidos } from '../practica/QuickRegisterSheet';

export interface ErroresViewProps {
  mistakes: readonly Mistake[];
  fotosPorId: Readonly<Record<string, MistakePhoto>>;
  fechaHoy: FechaISO;
  topeDiario?: number;
  ultimoCursoId?: CursoOMixId | null;
  cursosRecientes?: readonly CursoOMixId[];
  onGuardarMistake: (error: Mistake, fotoNueva?: MistakePhoto) => Promise<void> | void;
  onEliminarMistake: (id: string) => Promise<void> | void;
}

function leerArchivoComoDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

function tituloTema(temaId: string | null): string {
  if (!temaId) return 'General';
  const t = TEMARIO.find((x) => x.id === temaId);
  return t ? `S${t.semana} · ${t.titulo}` : temaId;
}

export function ErroresView({
  mistakes,
  fotosPorId,
  fechaHoy,
  topeDiario = TOPE_REPASOS_DIARIO_POR_DEFECTO,
  ultimoCursoId = null,
  cursosRecientes = [],
  onGuardarMistake,
  onEliminarMistake,
}: ErroresViewProps) {
  const [cursoNuevo, setCursoNuevo] = useState<CursoOMixId>(() => ultimoCursoId ?? 'quim');
  const [temaNuevo, setTemaNuevo] = useState<string>('');
  const [categoriaNueva, setCategoriaNueva] = useState<CategoriaError | null>('teoria');
  const [notaNueva, setNotaNueva] = useState<string>('');
  const [fotoPendiente, setFotoPendiente] = useState<{
    blob: Blob;
    mimeType: string;
    miniaturaDataUrl: string;
  } | null>(null);
  // Omitir Habilidad Verbal / comprensión lectora de flashcards por defecto
  const [omitirLecturaHV, setOmitirLecturaHV] = useState<boolean>(true);
  const [excluirDeLeitnerNuevo, setExcluirDeLeitnerNuevo] = useState<boolean>(false);

  const chipsCursosRapidos = obtenerChipsCursosRapidos(cursoNuevo, cursosRecientes);

  const mistakesElegiblesLeitner = useMemo(() => {
    return mistakes.filter((m) => {
      if (m.excluirDeLeitner) return false;
      if (omitirLecturaHV && m.cursoId === 'hv') return false;
      return true;
    });
  }, [mistakes, omitirLecturaHV]);

  const colaLeitner = planificarColaLeitner(mistakesElegiblesLeitner, fechaHoy, topeDiario);
  const flashcardActual = colaLeitner.paraHoy[0] ?? null;

  const conteoPorCaja: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  for (const m of mistakesElegiblesLeitner) {
    if (m.caja >= 1 && m.caja <= 7) {
      conteoPorCaja[m.caja] = (conteoPorCaja[m.caja] ?? 0) + 1;
    }
  }

  const abiertos = mistakes.filter((m) => m.estado === 'abierto');
  const porClasificar = mistakes.filter((m) => m.categoria === null);

  const manejarSeleccionFoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const miniaturaDataUrl = await leerArchivoComoDataUrl(file);
    setFotoPendiente({
      blob: file,
      mimeType: file.type || 'image/jpeg',
      miniaturaDataUrl,
    });
  };

  const excluirErrorDeLeitner = async (error: Mistake) => {
    await onGuardarMistake({
      ...error,
      excluirDeLeitner: true,
      estado: 'abierto',
      caja: 0,
      proximoRepaso: null,
    });
  };

  const guardarNuevoError = async (directoALeitner: boolean) => {
    const ahora = Date.now();
    const fotoId = fotoPendiente ? generarIdEstable('foto', ahora) : null;
    const fotoObj: MistakePhoto | undefined =
      fotoPendiente && fotoId
        ? {
            id: fotoId,
            blob: fotoPendiente.blob,
            mimeType: fotoPendiente.mimeType,
            miniaturaDataUrl: fotoPendiente.miniaturaDataUrl,
            creadoEn: ahora,
          }
        : undefined;

    const quiereLeitner = directoALeitner && !excluirDeLeitnerNuevo;
    const transicionInicial = quiereLeitner ? activarRepasoError(fechaHoy) : null;

    const nuevoMistake: Mistake = {
      id: generarIdEstable('err', ahora),
      origen: 'tanda',
      simulacroId: null,
      cursoId: cursoNuevo,
      temaId: temaNuevo || null,
      categoria: categoriaNueva,
      nota: notaNueva.trim() || 'Error registrado para repaso',
      fotoId,
      creadoEn: ahora,
      fecha: fechaHoy,
      estado: transicionInicial ? transicionInicial.estado : 'abierto',
      caja: transicionInicial ? transicionInicial.cajaNueva : 0,
      proximoRepaso: transicionInicial ? transicionInicial.proximoRepaso : null,
      historial: [],
      excluirDeLeitner: excluirDeLeitnerNuevo,
    };

    await onGuardarMistake(nuevoMistake, fotoObj);
    setNotaNueva('');
    setFotoPendiente(null);
    setExcluirDeLeitnerNuevo(false);
  };

  const manejarCrearError = async (e: FormEvent) => {
    e.preventDefault();
    await guardarNuevoError(false);
  };

  const responderFlashcard = async (error: Mistake, resultado: 'ok' | 'fail') => {
    const ahora = Date.now();
    const transicion = evaluarRespuestaLeitner(error.caja, resultado, fechaHoy);
    await onGuardarMistake({
      ...error,
      estado: transicion.estado,
      caja: transicion.cajaNueva,
      proximoRepaso: transicion.proximoRepaso,
      historial: [
        ...error.historial,
        {
          fecha: fechaHoy,
          ts: ahora,
          resultado,
          cajaAnterior: transicion.cajaAnterior,
          cajaNueva: transicion.cajaNueva,
        },
      ],
    });
  };

  const enviarACircuitoLeitner = async (error: Mistake) => {
    const transicion = activarRepasoError(fechaHoy);
    await onGuardarMistake({
      ...error,
      estado: transicion.estado,
      caja: transicion.cajaNueva,
      proximoRepaso: transicion.proximoRepaso,
    });
  };

  const clasificarErrorRapido = async (error: Mistake, cat: CategoriaError) => {
    await onGuardarMistake({
      ...error,
      categoria: cat,
    });
  };

  const temasCursoSeleccionado = cursoNuevo === 'mix' ? [] : temasDeCurso(cursoNuevo as CursoId);

  return (
    <div className="space-y-6">
      {/* 1. Circuito Leitner (Flashcards 1/2/5/10/20/60 días con tope diario) */}
      <section
        aria-labelledby="sec-leitner"
        className="space-y-4 rounded-2xl border border-border bg-surface p-4"
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 id="sec-leitner" className="text-base font-bold text-text">
              Repaso de Errores (Leitner · Tope {topeDiario}/día)
            </h1>
            <p className="text-xs text-text-muted">
              Intervalos: 1, 2, 5, 10, 20 y 60 días. El excedente se reparte en días siguientes.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone={colaLeitner.paraHoy.length > 0 ? 'warn' : 'success'}>
              Hoy: {colaLeitner.paraHoy.length}
            </Chip>
            {colaLeitner.excedenteRepartido.length > 0 && (
              <Chip tone="accent">
                +{colaLeitner.excedenteRepartido.length} repartidos a días siguientes
              </Chip>
            )}
            <Chip tone="success">Dominados (C7): {conteoPorCaja[7]}</Chip>
          </div>
        </header>

        {/* Filtro inteligente: Omitir HV / comprensión lectora de flashcards (enfocar en conocimientos, letras y mates) */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs">
          <label className="flex items-center gap-2 cursor-pointer font-medium text-text">
            <input
              type="checkbox"
              data-testid="toggle-omitir-hv-leitner"
              checked={omitirLecturaHV}
              onChange={(e) => setOmitirLecturaHV(e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent"
            />
            <span>
              Omitir Habilidad Verbal / comprensión lectora (enfocar mazo en conocimientos, letras y
              mates)
            </span>
          </label>
          <span className="text-[11px] text-text-muted font-mono">
            {omitirLecturaHV ? '✓ Omitiendo HV en flashcards' : 'Incluyendo todos'}
          </span>
        </div>

        {/* Cajas 1 a 6 */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {([1, 2, 3, 4, 5, 6] as const).map((caja) => (
            <div
              key={caja}
              className="rounded-xl border border-border bg-surface-2 p-2.5 text-center"
            >
              <div className="font-mono text-base font-bold text-accent">
                {conteoPorCaja[caja] ?? 0}
              </div>
              <div className="text-[11px] text-text-muted">
                Caja {caja} ({INTERVALOS_LEITNER[caja]}d)
              </div>
            </div>
          ))}
        </div>

        {/* Flashcard activa */}
        {flashcardActual ? (
          <article
            data-testid="leitner-flashcard"
            className="space-y-3 rounded-xl border border-accent bg-surface-2 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-text">
                  {nombreCursoOMix(flashcardActual.cursoId)}
                </span>
                <span className="text-xs text-text-muted">
                  {tituloTema(flashcardActual.temaId)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Chip tone="accent">Caja {flashcardActual.caja}</Chip>
                {flashcardActual.categoria ? (
                  <Chip tone="neutral">
                    {CATALOGO_CATEGORIAS_ERROR[flashcardActual.categoria].etiqueta}
                  </Chip>
                ) : (
                  <Chip tone="warn">Por clasificar</Chip>
                )}
              </div>
            </div>

            <p className="text-sm font-medium text-text">{flashcardActual.nota}</p>

            {flashcardActual.fotoId && fotosPorId[flashcardActual.fotoId] && (
              <img
                src={fotosPorId[flashcardActual.fotoId]?.miniaturaDataUrl}
                alt="Captura del error"
                className="max-h-40 rounded-lg border border-border object-contain"
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2">
              <button
                type="button"
                data-testid="btn-excluir-de-leitner"
                onClick={() => void excluirErrorDeLeitner(flashcardActual)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-surface px-2.5 py-1 text-xs text-text-muted hover:border-danger hover:text-danger transition-colors"
                title="Sacar de flashcards (se conserva en el cuaderno de errores)"
              >
                <span>🚫 Sacar de Leitner</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  data-testid="btn-flashcard-falle"
                  onClick={() => void responderFlashcard(flashcardActual, 'fail')}
                >
                  ✗ Fallé (vuelve a Caja 1)
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  data-testid="btn-flashcard-recorde"
                  onClick={() => void responderFlashcard(flashcardActual, 'ok')}
                >
                  ✓ Lo recordé (sube a Caja {Math.min(7, flashcardActual.caja + 1)})
                </Button>
              </div>
            </div>
          </article>
        ) : (
          <div className="rounded-xl border border-border bg-surface-2 p-4 text-center text-xs text-text-muted">
            Sin repasos Leitner vencidos para hoy.
          </div>
        )}
      </section>

      {/* 2. Captura rápida de error con nota y foto opcional */}
      <section
        aria-labelledby="sec-captura-error"
        className="rounded-2xl border border-border bg-surface p-4"
      >
        <h2 id="sec-captura-error" className="mb-3 text-base font-bold text-text">
          Capturar Error (Nota + Foto opcional)
        </h2>
        <form onSubmit={(e) => void manejarCrearError(e)} className="space-y-3">
          {/* Chips de cursos recientes para elegir en 1 toque */}
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Cursos recientes para error"
          >
            {chipsCursosRapidos.map((cid) => {
              const activo = cursoNuevo === cid;
              return (
                <button
                  key={cid}
                  type="button"
                  data-testid={`chip-error-curso-${cid}`}
                  aria-pressed={activo}
                  onClick={() => {
                    setCursoNuevo(cid);
                    setTemaNuevo('');
                  }}
                  className={`min-h-11 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activo
                      ? 'border-accent bg-surface-2 text-accent'
                      : 'border-border bg-surface text-text-muted hover:text-text'
                  }`}
                >
                  {nombreCursoOMix(cid)}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-text-muted">
              Curso
              <select
                aria-label="Curso del error"
                value={cursoNuevo}
                onChange={(e) => {
                  setCursoNuevo(e.target.value as CursoOMixId);
                  setTemaNuevo('');
                }}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text"
              >
                {CURSOS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
                <option value="mix">MIX (Varios)</option>
              </select>
            </label>

            <label className="text-xs text-text-muted">
              Tema
              <select
                aria-label="Tema del error"
                value={temaNuevo}
                onChange={(e) => setTemaNuevo(e.target.value)}
                disabled={cursoNuevo === 'mix'}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text"
              >
                <option value="">— General —</option>
                {temasCursoSeleccionado.map((t) => (
                  <option key={t.id} value={t.id}>
                    S{t.semana} · {t.titulo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categoría del error">
            {CATEGORIAS_ERROR.map((cat) => {
              const activa = categoriaNueva === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoriaNueva(cat)}
                  className={`min-h-11 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    activa
                      ? 'border-accent bg-surface-2 text-accent'
                      : 'border-border bg-surface text-text-muted'
                  }`}
                >
                  {CATALOGO_CATEGORIAS_ERROR[cat].etiqueta}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCategoriaNueva(null)}
              className={`min-h-11 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                categoriaNueva === null
                  ? 'border-warn bg-surface-2 text-warn'
                  : 'border-border bg-surface text-text-muted'
              }`}
            >
              Dejar por clasificar
            </button>
          </div>

          <div>
            <label className="text-xs text-text-muted">
              Nota corta
              <input
                type="text"
                aria-label="Nota del error"
                value={notaNueva}
                onChange={(e) => setNotaNueva(e.target.value)}
                placeholder="Qué trampa o concepto falló..."
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text"
              />
            </label>
          </div>

          {/* Cuadro destacado para incorporar imagen (cámara / galería / archivo) */}
          <div className="flex flex-col gap-1 text-xs text-text-muted">
            <span className="font-semibold text-text">
              Foto de la pregunta o solución (opcional)
            </span>
            {!fotoPendiente ? (
              <label
                data-testid="dropzone-foto-error"
                className="group relative flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-2/60 p-4 text-center transition-all hover:border-accent hover:bg-surface-2"
              >
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Adjuntar foto del error"
                  onChange={(e) => void manejarSeleccionFoto(e)}
                  className="sr-only"
                />
                <span
                  className="text-2xl transition-transform group-hover:scale-110"
                  aria-hidden="true"
                >
                  📸
                </span>
                <span className="mt-1 font-semibold text-text group-hover:text-accent">
                  Toca o arrastra aquí para seleccionar imagen
                </span>
                <span className="text-[11px] text-text-muted">
                  JPG, PNG o WebP · Captura de cámara o archivo
                </span>
              </label>
            ) : (
              <div
                data-testid="contenedor-foto-cargada"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-accent bg-surface-2 p-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={fotoPendiente.miniaturaDataUrl}
                    alt="Vista previa de captura"
                    data-testid="preview-foto-error"
                    className="h-16 w-16 rounded-lg border-2 border-accent object-cover shadow-sm"
                  />
                  <div className="flex flex-col">
                    <span className="font-bold text-text">✓ Imagen seleccionada</span>
                    <span className="text-[11px] text-text-muted">
                      Se guardará vinculada a este error
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text hover:border-accent hover:text-accent transition-colors">
                    Cambiar
                    <input
                      type="file"
                      accept="image/*"
                      aria-label="Cambiar foto del error"
                      onChange={(e) => void manejarSeleccionFoto(e)}
                      className="sr-only"
                    />
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => setFotoPendiente(null)}>
                    Quitar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Opción para excluir de Leitner */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 p-2.5 text-xs">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-text">
              <input
                type="checkbox"
                data-testid="chk-excluir-leitner-nuevo"
                checked={excluirDeLeitnerNuevo}
                onChange={(e) => setExcluirDeLeitnerNuevo(e.target.checked)}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span>Excluir de repaso Leitner (solo registrar en cuaderno para estadísticas)</span>
            </label>
            {cursoNuevo === 'hv' && (
              <span className="text-[11px] text-accent font-medium">
                💡 Habilidad Verbal: recomendado si el fallo fue por lectura o inferencia
              </span>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              data-testid="btn-crear-error-leitner"
              onClick={() => void guardarNuevoError(true)}
            >
              Guardar y enviar a Caja 1
            </Button>
            <Button type="submit" variant="primary" data-testid="btn-crear-error">
              Guardar error en cuaderno
            </Button>
          </div>
        </form>
      </section>

      {/* 3. Lista de errores abiertos y por clasificar */}
      <section
        aria-labelledby="sec-abiertos"
        className="space-y-3 rounded-2xl border border-border bg-surface p-4"
      >
        <header className="flex items-center justify-between">
          <h2 id="sec-abiertos" className="text-base font-bold text-text">
            Errores Abiertos ({abiertos.length}) · Por clasificar ({porClasificar.length})
          </h2>
        </header>

        {abiertos.length === 0 ? (
          <p className="text-xs text-text-muted">No tienes errores abiertos pendientes.</p>
        ) : (
          <div className="space-y-2.5">
            {abiertos.map((err) => {
              const foto = err.fotoId ? fotosPorId[err.fotoId] : undefined;
              return (
                <article
                  key={err.id}
                  data-testid={`error-abierto-${err.id}`}
                  className="space-y-2 rounded-xl border border-border bg-surface-2 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-text">{nombreCursoOMix(err.cursoId)}</span>
                      <span className="text-text-muted">{tituloTema(err.temaId)}</span>
                      {err.categoria ? (
                        <Chip tone="accent">
                          {CATALOGO_CATEGORIAS_ERROR[err.categoria].etiqueta}
                        </Chip>
                      ) : (
                        <Chip tone="warn">Por clasificar</Chip>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        data-testid={`enviar-leitner-${err.id}`}
                        onClick={() => void enviarACircuitoLeitner(err)}
                      >
                        ✓ Enviar a Caja 1
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void onEliminarMistake(err.id)}
                      >
                        Borrar
                      </Button>
                    </div>
                  </div>

                  <p className="text-text">{err.nota}</p>

                  {foto && (
                    <img
                      src={foto.miniaturaDataUrl}
                      alt="Miniatura del error"
                      data-testid={`miniatura-error-${err.id}`}
                      className="h-16 w-16 rounded-lg border border-border object-cover"
                    />
                  )}

                  {err.categoria === null && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-text-muted">Clasificar con 1 toque:</span>
                      {CATEGORIAS_ERROR.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          data-testid={`clasificar-${err.id}-${cat}`}
                          onClick={() => void clasificarErrorRapido(err, cat)}
                          className="min-h-9 rounded border border-border bg-surface px-2 py-1 text-xs font-medium text-text hover:border-accent"
                        >
                          {CATALOGO_CATEGORIAS_ERROR[cat].etiqueta}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
