/**
 * Registro Rápido de Tanda (`QuickRegisterSheet.tsx`):
 * - Fricción mínima: guardar una tanda en <= 3 toques y <= 10 s.
 * - No pierde estado al re-renderizar (persiste el borrador en memoria/padre) y recuerda el último curso usado.
 * - Muestra el último curso usado + 4 recientes como chips de 1 toque.
 * - Botones grandes −/+ (>= 44 px) para correctas e incorrectas.
 * - Si `bad > 0`, ofrece un paso opcional de 1 toque con las 5 categorías de error y sus micro-consejos.
 *   "Omitir" siempre disponible: guarda los errores con `categoria: null` ("por clasificar") para el cierre del día.
 */
import { useState } from 'react';
import {
  CATALOGO_CATEGORIAS_ERROR,
  CATEGORIAS_ERROR,
  type CategoriaError,
  type CursoOMixId,
} from '../../data';
import { CURSOS, temasDeCurso, type CursoId, type FechaISO } from '../../domain';
import { Button, Chip, Sheet } from '../../ui';

export interface BorradorTanda {
  cursoId: CursoOMixId;
  temaId: string | null;
  ok: number;
  bad: number;
  fecha: FechaISO;
}

export interface ResultadoGuardarTanda {
  borrador: BorradorTanda;
  categoriaErrores: CategoriaError | null;
  notaError: string;
}

export interface QuickRegisterSheetProps {
  open: boolean;
  onClose: () => void;
  borrador: BorradorTanda;
  onChangeBorrador: (actualizado: BorradorTanda) => void;
  cursosRecientes: readonly CursoOMixId[];
  onGuardar: (resultado: ResultadoGuardarTanda) => Promise<void> | void;
}

const CHIPS_POR_DEFECTO: readonly CursoOMixId[] = ['hv', 'hm', 'quim', 'fis', 'bio'];

export function obtenerChipsCursosRapidos(
  ultimoCursoId: CursoOMixId | null,
  recientes: readonly CursoOMixId[],
): CursoOMixId[] {
  const resultado: CursoOMixId[] = [];
  const agregar = (id: CursoOMixId | null | undefined) => {
    if (id && !resultado.includes(id) && resultado.length < 5) {
      resultado.push(id);
    }
  };
  agregar(ultimoCursoId);
  for (const r of recientes) agregar(r);
  for (const d of CHIPS_POR_DEFECTO) agregar(d);
  return resultado;
}

export function nombreCursoOMix(id: CursoOMixId): string {
  if (id === 'mix') return 'MIX (Varios)';
  return CURSOS.find((c) => c.id === id)?.nombre ?? id;
}

export function QuickRegisterSheet({
  open,
  onClose,
  borrador,
  onChangeBorrador,
  cursosRecientes,
  onGuardar,
}: QuickRegisterSheetProps) {
  const [pasoCausas, setPasoCausas] = useState<boolean>(false);
  const [categoriaElegida, setCategoriaElegida] = useState<CategoriaError | null>(null);
  const [notaError, setNotaError] = useState<string>('');

  const chipsCursos = obtenerChipsCursosRapidos(borrador.cursoId, cursosRecientes);
  const temasDisponibles =
    borrador.cursoId === 'mix' ? [] : temasDeCurso(borrador.cursoId as CursoId);
  const totalPreguntas = borrador.ok + borrador.bad;

  const ajustarCantidad = (campo: 'ok' | 'bad', delta: number) => {
    const actual = borrador[campo];
    const nuevo = Math.max(0, Math.min(300, actual + delta));
    onChangeBorrador({ ...borrador, [campo]: nuevo });
  };

  const establecerPasoRapido = (campo: 'ok' | 'bad', valor: number) => {
    onChangeBorrador({ ...borrador, [campo]: Math.max(0, Math.min(300, valor)) });
  };

  const confirmarGuardadoFinal = async (cat: CategoriaError | null) => {
    await onGuardar({
      borrador,
      categoriaErrores: cat,
      notaError: notaError.trim(),
    });
    setPasoCausas(false);
    setCategoriaElegida(null);
    setNotaError('');
  };

  const manejarClickGuardarPrincipal = async () => {
    if (totalPreguntas <= 0) return;
    if (borrador.bad > 0) {
      setPasoCausas(true);
      return;
    }
    await confirmarGuardadoFinal(null);
  };

  const cerrarHoja = () => {
    setPasoCausas(false);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={cerrarHoja}
      title={pasoCausas ? `¿Por qué fallaste (${borrador.bad})?` : 'Registrar tanda rápida'}
      description={
        pasoCausas
          ? '1 toque para clasificar o pulsa Omitir (quedarán por clasificar para el cierre del día).'
          : 'Último curso listo. Ajusta aciertos/errores y guarda con 1 toque.'
      }
    >
      {!pasoCausas ? (
        <div className="space-y-4">
          {/* 1. Chips de último curso + 4 recientes */}
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Curso (último + recientes)
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cursos recientes">
              {chipsCursos.map((cid) => {
                const activo = borrador.cursoId === cid;
                return (
                  <button
                    key={cid}
                    type="button"
                    data-testid={`chip-curso-${cid}`}
                    aria-pressed={activo}
                    onClick={() =>
                      onChangeBorrador({
                        ...borrador,
                        cursoId: cid,
                        temaId: null,
                      })
                    }
                    className={`min-h-11 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activo
                        ? 'border-accent bg-surface-2 text-accent'
                        : 'border-border bg-surface text-text hover:bg-surface-2'
                    }`}
                  >
                    {nombreCursoOMix(cid)}
                  </button>
                );
              })}
            </div>

            {/* Selector completo de los 19 cursos + MIX */}
            <label className="mt-2 block text-xs text-text-muted">
              Todos los cursos
              <select
                aria-label="Seleccionar curso"
                value={borrador.cursoId}
                onChange={(e) =>
                  onChangeBorrador({
                    ...borrador,
                    cursoId: e.target.value as CursoOMixId,
                    temaId: null,
                  })
                }
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
          </div>

          {/* 2. Tema opcional */}
          {borrador.cursoId !== 'mix' && (
            <label className="block text-xs text-text-muted">
              Tema (opcional)
              <select
                aria-label="Tema opcional"
                value={borrador.temaId ?? ''}
                onChange={(e) =>
                  onChangeBorrador({
                    ...borrador,
                    temaId: e.target.value ? e.target.value : null,
                  })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text"
              >
                <option value="">— Práctica general del curso —</option>
                {temasDisponibles.map((t) => (
                  <option key={t.id} value={t.id}>
                    S{t.semana} · {t.titulo}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* 3. Contadores grandes de Correctas e Incorrectas */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Correctas */}
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-success">Correctas (ok)</span>
                <div className="flex gap-1">
                  {[5, 10, 15, 20].map((n) => (
                    <button
                      key={n}
                      type="button"
                      data-testid={`preset-ok-${n}`}
                      onClick={() => establecerPasoRapido('ok', n)}
                      className="min-h-8 rounded border border-border bg-surface px-2 text-xs font-mono text-text hover:border-accent"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  aria-label="Restar correcta"
                  data-testid="btn-ok-minus"
                  onClick={() => ajustarCantidad('ok', -1)}
                >
                  −
                </Button>
                <input
                  type="number"
                  min={0}
                  max={300}
                  aria-label="Cantidad de correctas"
                  value={borrador.ok}
                  onChange={(e) => establecerPasoRapido('ok', Number(e.target.value) || 0)}
                  className="min-h-11 w-20 rounded-lg border border-border bg-surface text-center font-mono text-xl font-bold tabular-nums text-text"
                />
                <Button
                  variant="secondary"
                  aria-label="Sumar correcta"
                  data-testid="btn-ok-plus"
                  onClick={() => ajustarCantidad('ok', 1)}
                >
                  +
                </Button>
              </div>
            </div>

            {/* Incorrectas */}
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-danger">Incorrectas (bad)</span>
                <div className="flex gap-1">
                  {[0, 1, 2, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      data-testid={`preset-bad-${n}`}
                      onClick={() => establecerPasoRapido('bad', n)}
                      className="min-h-8 rounded border border-border bg-surface px-2 text-xs font-mono text-text hover:border-accent"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  aria-label="Restar incorrecta"
                  data-testid="btn-bad-minus"
                  onClick={() => ajustarCantidad('bad', -1)}
                >
                  −
                </Button>
                <input
                  type="number"
                  min={0}
                  max={300}
                  aria-label="Cantidad de incorrectas"
                  value={borrador.bad}
                  onChange={(e) => establecerPasoRapido('bad', Number(e.target.value) || 0)}
                  className="min-h-11 w-20 rounded-lg border border-border bg-surface text-center font-mono text-xl font-bold tabular-nums text-text"
                />
                <Button
                  variant="secondary"
                  aria-label="Sumar incorrecta"
                  data-testid="btn-bad-plus"
                  onClick={() => ajustarCantidad('bad', 1)}
                >
                  +
                </Button>
              </div>
            </div>
          </div>

          {/* 4. Fecha y botón de guardar en 1 toque */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 text-xs text-text-muted">
              Fecha:
              <input
                type="date"
                aria-label="Fecha de la tanda"
                value={borrador.fecha}
                onChange={(e) => onChangeBorrador({ ...borrador, fecha: e.target.value })}
                className="min-h-11 rounded-lg border border-border bg-surface-2 px-2.5 py-1 font-mono text-xs text-text"
              />
            </label>

            <Button
              variant="primary"
              data-testid="btn-guardar-tanda"
              disabled={totalPreguntas <= 0}
              onClick={() => void manejarClickGuardarPrincipal()}
            >
              Guardar tanda ({totalPreguntas} preg)
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4" data-testid="paso-causas-error">
          <p className="text-xs text-text-muted">
            Toca una categoría para guardar de inmediato o pulsa <b>Omitir</b> para dejarlo por
            clasificar:
          </p>

          <div className="grid grid-cols-1 gap-2">
            {CATEGORIAS_ERROR.map((cat) => {
              const info = CATALOGO_CATEGORIAS_ERROR[cat];
              const activa = categoriaElegida === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  data-testid={`chip-causa-${cat}`}
                  onClick={() => {
                    setCategoriaElegida(cat);
                    void confirmarGuardadoFinal(cat);
                  }}
                  className={`flex min-h-11 flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                    activa
                      ? 'border-accent bg-surface-2 text-text'
                      : 'border-border bg-surface text-text hover:bg-surface-2'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-semibold text-text">{info.etiqueta}</span>
                    <Chip tone="accent">{info.grupo}</Chip>
                  </div>
                  <span className="mt-1 text-xs text-text-muted">{info.consejo}</span>
                </button>
              );
            })}
          </div>

          <label className="block text-xs text-text-muted">
            Nota corta opcional
            <input
              type="text"
              value={notaError}
              onChange={(e) => setNotaError(e.target.value)}
              placeholder="Ej. Confundí enlace dativo con covalente..."
              className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text"
            />
          </label>

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="ghost" onClick={() => setPasoCausas(false)}>
              ← Volver
            </Button>
            <Button
              variant="secondary"
              data-testid="btn-omitir-causa"
              onClick={() => void confirmarGuardadoFinal(null)}
            >
              Omitir (dejar por clasificar)
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
