/**
 * Vista de Historial de Práctica (`PracticeView.tsx`):
 * - Agrupa las tandas por fecha (`YYYY-MM-DD`).
 * - Permite editar en línea las correctas/incorrectas o fecha de cualquier tanda y eliminarla.
 * - Toda mutación dispara el Toast de Deshacer (6 s).
 */
import { useState } from 'react';
import { preguntasDePractice, type Practice } from '../../data';
import { TEMARIO } from '../../domain';
import { Button, Chip } from '../../ui';
import { nombreCursoOMix } from './QuickRegisterSheet';

export interface PracticeViewProps {
  practices: readonly Practice[];
  onAbrirRegistroRapido: () => void;
  onEditarPractice: (actualizada: Practice) => Promise<void> | void;
  onEliminarPractice: (id: string) => Promise<void> | void;
}

function tituloTema(temaId: string | null): string {
  if (!temaId) return 'General';
  const t = TEMARIO.find((x) => x.id === temaId);
  return t ? `S${t.semana} · ${t.titulo}` : temaId;
}

export function PracticeView({
  practices,
  onAbrirRegistroRapido,
  onEditarPractice,
  onEliminarPractice,
}: PracticeViewProps) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [okEdit, setOkEdit] = useState<number>(0);
  const [badEdit, setBadEdit] = useState<number>(0);
  const [fechaEdit, setFechaEdit] = useState<string>('');

  // Agrupar por fecha descendente
  const porFecha = new Map<string, Practice[]>();
  const ordenadas = [...practices].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.ts - a.ts);
  for (const p of ordenadas) {
    const lista = porFecha.get(p.fecha) ?? [];
    lista.push(p);
    porFecha.set(p.fecha, lista);
  }

  const iniciarEdicion = (p: Practice) => {
    setEditandoId(p.id);
    setOkEdit(p.ok);
    setBadEdit(p.bad);
    setFechaEdit(p.fecha);
  };

  const guardarEdicion = async (p: Practice) => {
    const nuevoOk = Math.max(0, Math.min(300, Math.trunc(okEdit)));
    const nuevoBad = Math.max(0, Math.min(300, Math.trunc(badEdit)));
    if (nuevoOk + nuevoBad <= 0) return;
    await onEditarPractice({
      ...p,
      ok: nuevoOk,
      bad: nuevoBad,
      fecha: fechaEdit || p.fecha,
      sinDetalle: undefined,
      totalSinDetalle: undefined,
    });
    setEditandoId(null);
  };

  return (
    <section aria-labelledby="titulo-practica" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-4">
        <div>
          <h1 id="titulo-practica" className="text-base font-bold text-text">
            Historial de Práctica por Día
          </h1>
          <p className="text-xs text-text-muted">
            Edita o elimina cualquier tanda. Todas las acciones tienen Deshacer (6 s).
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={onAbrirRegistroRapido}>
          + Nueva tanda (n)
        </Button>
      </header>

      {porFecha.size === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-text-muted">
          Aún no hay tandas registradas. Pulsa el botón flotante «+» para registrar tu primera
          tanda.
        </div>
      ) : (
        Array.from(porFecha.entries()).map(([fecha, items]) => {
          const totalDia = items.reduce((s, x) => s + preguntasDePractice(x), 0);
          return (
            <article
              key={fecha}
              data-testid={`grupo-practica-${fecha}`}
              className="rounded-2xl border border-border bg-surface p-4"
            >
              <header className="mb-3 flex items-center justify-between border-b border-border pb-2">
                <span className="font-mono text-sm font-bold text-text">{fecha}</span>
                <Chip tone="accent">{totalDia} preguntas</Chip>
              </header>

              <div className="space-y-2.5">
                {items.map((p) => {
                  const enEdicion = editandoId === p.id;
                  return (
                    <div
                      key={p.id}
                      data-testid={`item-practica-${p.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 p-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-text">{nombreCursoOMix(p.cursoId)}</span>
                          <span className="text-text-muted">{tituloTema(p.temaId)}</span>
                          {p.sinDetalle && <Chip tone="warn">sin detalle</Chip>}
                        </div>
                        {!enEdicion && (
                          <div className="font-mono text-text-muted">
                            {p.sinDetalle ? (
                              <span>Total: {p.totalSinDetalle} preg (importado de tabla v4)</span>
                            ) : (
                              <span>
                                ✓ {p.ok} buenas · ✗ {p.bad} malas · Σ {p.ok + p.bad}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {enEdicion ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1">
                            ✓
                            <input
                              type="number"
                              aria-label="Editar correctas"
                              min={0}
                              max={300}
                              value={okEdit}
                              onChange={(e) => setOkEdit(Number(e.target.value) || 0)}
                              className="min-h-11 w-16 rounded border border-border bg-surface px-2 font-mono text-xs text-text"
                            />
                          </label>
                          <label className="flex items-center gap-1">
                            ✗
                            <input
                              type="number"
                              aria-label="Editar incorrectas"
                              min={0}
                              max={300}
                              value={badEdit}
                              onChange={(e) => setBadEdit(Number(e.target.value) || 0)}
                              className="min-h-11 w-16 rounded border border-border bg-surface px-2 font-mono text-xs text-text"
                            />
                          </label>
                          <input
                            type="date"
                            aria-label="Editar fecha"
                            value={fechaEdit}
                            onChange={(e) => setFechaEdit(e.target.value)}
                            className="min-h-11 rounded border border-border bg-surface px-2 font-mono text-xs text-text"
                          />
                          <Button
                            variant="primary"
                            size="sm"
                            data-testid={`guardar-edicion-${p.id}`}
                            onClick={() => void guardarEdicion(p)}
                          >
                            Guardar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditandoId(null)}>
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            data-testid={`editar-practica-${p.id}`}
                            onClick={() => iniciarEdicion(p)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`borrar-practica-${p.id}`}
                            onClick={() => void onEliminarPractice(p.id)}
                          >
                            Borrar
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
