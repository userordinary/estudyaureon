import {
  CATALOGO_FONDOS_ANIMADOS,
  FONDOS_ANIMADOS,
  guardarFondoStorage,
  type FondoAnimadoId,
} from './types';

export interface BackgroundSelectorProps {
  fondoSeleccionado: FondoAnimadoId;
  onSeleccionarFondo: (nuevoFondo: FondoAnimadoId) => void | Promise<void>;
  /** Si es true muestra un diseño compacto para barra o tarjetas pequeñas */
  compacto?: boolean;
}

export function BackgroundSelector({
  fondoSeleccionado,
  onSeleccionarFondo,
  compacto = false,
}: BackgroundSelectorProps) {
  const manejarSeleccion = (id: FondoAnimadoId) => {
    guardarFondoStorage(id);
    void onSeleccionarFondo(id);
  };

  if (compacto) {
    return (
      <div
        className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface p-1.5"
        role="group"
        aria-label="Selector rápido de fondo animado"
      >
        {FONDOS_ANIMADOS.map((id) => {
          const info = CATALOGO_FONDOS_ANIMADOS[id];
          const activo = fondoSeleccionado === id;
          return (
            <button
              key={id}
              type="button"
              data-testid={`btn-quick-fondo-${id}`}
              onClick={() => manejarSeleccion(id)}
              aria-pressed={activo}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                activo
                  ? 'border border-accent bg-accent/15 text-accent shadow-sm'
                  : 'border border-transparent text-text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              <span>{info.icono}</span>
              <span>{info.nombre}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      role="radiogroup"
      aria-label="Seleccionar fondo animado interactivo"
      data-testid="selector-fondos-animados"
    >
      {FONDOS_ANIMADOS.map((id) => {
        const info = CATALOGO_FONDOS_ANIMADOS[id];
        const seleccionado = fondoSeleccionado === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={seleccionado}
            data-testid={`card-fondo-${id}`}
            onClick={() => manejarSeleccion(id)}
            className={`group relative flex min-h-[92px] flex-col justify-between rounded-xl border p-3.5 text-left transition-all focus-visible:outline-2 focus-visible:outline-accent ${
              seleccionado
                ? 'border-accent bg-surface-2 text-text shadow-md ring-1 ring-accent/40'
                : 'border-border bg-surface text-text hover:border-accent/40 hover:bg-surface-2'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-bold text-text">
                  <span className="text-base">{info.icono}</span>
                  <span>{info.nombre}</span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    seleccionado
                      ? 'bg-accent text-bg'
                      : 'border border-border bg-surface-2 text-text-muted'
                  }`}
                >
                  {info.etiqueta}
                </span>
              </div>
              <div className="mt-1 text-[11px] font-medium text-accent">{info.subtitulo}</div>
            </div>
            <p className="mt-2 text-xs text-text-muted leading-relaxed">{info.descripcion}</p>
          </button>
        );
      })}
    </div>
  );
}
