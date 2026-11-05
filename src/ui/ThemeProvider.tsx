/**
 * Proveedor de tema de AUREON, selector completo para Ajustes y atajo rápido de barra superior.
 * Sincroniza `data-theme` en `<html>` sin recargar la página y persiste en `Settings` (Dexie).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { crearRepositorios, db as defaultDb, type AureonDB } from '../data';
import {
  aplicarFuenteEnDom,
  aplicarTemaEnDom,
  aplicarTransparenciaEnDom,
  esFuenteUI,
  guardarConfigPersonalizadaStorage,
  guardarFuenteStorage,
  guardarTemaEnStorage,
  guardarTransparenciaStorage,
  leerConfigPersonalizadaStorage,
  leerFuenteStorage,
  leerTemaDeStorage,
  leerTransparenciaStorage,
  MAPA_FUENTES,
  PERFILES_TEMA,
  siguienteTema,
  TEMA_UI_POR_DEFECTO,
  TEMAS_UI,
  FUENTES_UI,
  type FuenteUI,
  type TemaPersonalizadoConfig,
  type TemaUI,
} from './theme';

export interface ContextoTemaValor {
  tema: TemaUI;
  cambiarTema: (nuevo: TemaUI) => Promise<void>;
  alternarSiguienteTema: () => Promise<void>;
  fuente: FuenteUI;
  cambiarFuente: (nueva: FuenteUI) => Promise<void>;
  transparenciaTarjetas: number;
  cambiarTransparenciaTarjetas: (nueva: number) => Promise<void>;
  prefersReducedMotion: boolean;
  configPersonalizada: TemaPersonalizadoConfig;
  actualizarConfigPersonalizada: (parcial: Partial<TemaPersonalizadoConfig>) => Promise<void>;
}

const ContextoTema = createContext<ContextoTemaValor | null>(null);

export function usePrefersReducedMotion(): boolean {
  const [reducido, setReducido] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const oyente = (e: MediaQueryListEvent) => setReducido(e.matches);
    mql.addEventListener('change', oyente);
    return () => mql.removeEventListener('change', oyente);
  }, []);

  return reducido;
}

export interface ThemeProviderProps {
  children: ReactNode;
  temaInicial?: TemaUI;
  temaControlado?: TemaUI;
  onTemaCambiado?: (nuevo: TemaUI) => Promise<void> | void;
  database?: AureonDB;
}

export function ThemeProvider({
  children,
  temaInicial = TEMA_UI_POR_DEFECTO,
  temaControlado,
  onTemaCambiado,
  database = defaultDb,
}: ThemeProviderProps) {
  const [temaInterno, setTemaInterno] = useState<TemaUI>(
    () => temaControlado ?? leerTemaDeStorage() ?? temaInicial,
  );
  const tema = temaControlado ?? temaInterno;
  const [configPersonalizada, setConfigPersonalizada] = useState<TemaPersonalizadoConfig>(() =>
    leerConfigPersonalizadaStorage(),
  );
  const [fuente, setFuente] = useState<FuenteUI>(() => leerFuenteStorage());
  const [transparenciaTarjetas, setTransparenciaTarjetas] = useState<number>(() =>
    leerTransparenciaStorage(),
  );

  const cambioManualRef = useRef<boolean>(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const repos = useMemo(() => crearRepositorios(database), [database]);

  // Aplicar inmediatamente al DOM y localStorage cuando cambia el estado
  useEffect(() => {
    aplicarTemaEnDom(tema, configPersonalizada);
    guardarTemaEnStorage(tema);
    aplicarFuenteEnDom(fuente);
    guardarFuenteStorage(fuente);
    aplicarTransparenciaEnDom(transparenciaTarjetas, tema);
  }, [tema, configPersonalizada, fuente, transparenciaTarjetas]);

  // Cargar tema y fuente persistidos en Settings (IndexedDB) al montar
  useEffect(() => {
    if (temaControlado !== undefined) return;
    let activo = true;
    void repos.settings
      .obtener()
      .then((s) => {
        if (activo && !cambioManualRef.current) {
          if (s.tema) {
            setTemaInterno(s.tema);
            aplicarTemaEnDom(s.tema, s.temaPersonalizado ?? configPersonalizada);
            guardarTemaEnStorage(s.tema);
          }
          if (s.temaPersonalizado) {
            setConfigPersonalizada(s.temaPersonalizado);
            guardarConfigPersonalizadaStorage(s.temaPersonalizado);
          }
          if (s.fuente && esFuenteUI(s.fuente)) {
            setFuente(s.fuente);
            aplicarFuenteEnDom(s.fuente);
            guardarFuenteStorage(s.fuente);
          }
          if (s.transparenciaTarjetas !== undefined) {
            setTransparenciaTarjetas(s.transparenciaTarjetas);
            guardarTransparenciaStorage(s.transparenciaTarjetas);
            aplicarTransparenciaEnDom(s.transparenciaTarjetas, s.tema ?? tema);
          }
        }
      })
      .catch(() => {
        // En entornos sin DB disponible conserva el tema en memoria
      });
    return () => {
      activo = false;
    };
  }, [repos, temaControlado, configPersonalizada, tema]);

  const cambiarTema = useCallback(
    async (nuevo: TemaUI) => {
      cambioManualRef.current = true;
      setTemaInterno(nuevo);
      aplicarTemaEnDom(nuevo, configPersonalizada);
      guardarTemaEnStorage(nuevo);
      if (onTemaCambiado) {
        await onTemaCambiado(nuevo);
      }
      try {
        await repos.settings.actualizar({ tema: nuevo });
      } catch {
        // Fallo silencioso si IndexedDB está cerrado en un test aislado
      }
    },
    [onTemaCambiado, repos, configPersonalizada],
  );

  const cambiarFuente = useCallback(
    async (nueva: FuenteUI) => {
      setFuente(nueva);
      aplicarFuenteEnDom(nueva);
      guardarFuenteStorage(nueva);
      try {
        await repos.settings.actualizar({ fuente: nueva });
      } catch {
        // Silencioso
      }
    },
    [repos],
  );

  const cambiarTransparenciaTarjetas = useCallback(
    async (nueva: number) => {
      const val = Math.max(0, Math.min(100, Math.round(nueva)));
      setTransparenciaTarjetas(val);
      aplicarTransparenciaEnDom(val, tema);
      guardarTransparenciaStorage(val);
      try {
        await repos.settings.actualizar({ transparenciaTarjetas: val });
      } catch {
        // Silencioso
      }
    },
    [tema, repos],
  );

  const actualizarConfigPersonalizada = useCallback(
    async (parcial: Partial<TemaPersonalizadoConfig>) => {
      const nueva: TemaPersonalizadoConfig = { ...configPersonalizada, ...parcial };
      setConfigPersonalizada(nueva);
      guardarConfigPersonalizadaStorage(nueva);
      try {
        await repos.settings.actualizar({ temaPersonalizado: nueva });
      } catch {
        // Silencioso
      }
    },
    [configPersonalizada, repos],
  );

  const alternarSiguienteTema = useCallback(async () => {
    const proximo = siguienteTema(tema);
    await cambiarTema(proximo);
  }, [tema, cambiarTema]);

  const valor = useMemo<ContextoTemaValor>(
    () => ({
      tema,
      cambiarTema,
      alternarSiguienteTema,
      fuente,
      cambiarFuente,
      transparenciaTarjetas,
      cambiarTransparenciaTarjetas,
      prefersReducedMotion,
      configPersonalizada,
      actualizarConfigPersonalizada,
    }),
    [
      tema,
      cambiarTema,
      alternarSiguienteTema,
      fuente,
      cambiarFuente,
      transparenciaTarjetas,
      cambiarTransparenciaTarjetas,
      prefersReducedMotion,
      configPersonalizada,
      actualizarConfigPersonalizada,
    ],
  );

  return <ContextoTema.Provider value={valor}>{children}</ContextoTema.Provider>;
}

export function useTheme(): ContextoTemaValor {
  const ctx = useContext(ContextoTema);
  if (!ctx) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  }
  return ctx;
}

/**
 * Atajo rápido para la barra superior: cicla o selecciona el tema en vivo sin recarga.
 */
export function ThemeQuickSwitch() {
  const { tema, cambiarTema } = useTheme();

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1"
      role="group"
      aria-label="Atajo de tema"
    >
      {TEMAS_UI.map((id) => {
        const info = PERFILES_TEMA[id];
        const activo = tema === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => void cambiarTema(id)}
            aria-pressed={activo}
            className={`min-h-11 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              activo
                ? 'bg-surface-2 text-accent border border-accent'
                : 'text-text-muted hover:text-text border border-transparent'
            }`}
          >
            {info.nombre}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Selector detallado de los perfiles de tema para la vista de Ajustes con personalización en vivo.
 */
export function ThemeSettingsSelector() {
  const { tema, cambiarTema, transparenciaTarjetas, cambiarTransparenciaTarjetas } = useTheme();

  return (
    <div className="space-y-4">
      {/* 1. Selector de perfil visual de tema (4 perfiles limpios y probados) */}
      <div
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4"
        role="radiogroup"
        aria-label="Perfil visual del tema"
      >
        {TEMAS_UI.map((id) => {
          const info = PERFILES_TEMA[id];
          const seleccionado = tema === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              data-testid={`card-tema-${id}`}
              aria-checked={seleccionado}
              onClick={() => void cambiarTema(id)}
              className={`flex min-h-12 flex-col items-start justify-between rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                seleccionado
                  ? 'border-accent bg-surface-2 text-text shadow-sm ring-1 ring-accent'
                  : 'border-border bg-surface text-text hover:bg-surface-2'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="font-semibold text-text">{info.nombre}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    seleccionado
                      ? 'bg-accent text-bg'
                      : 'border border-border bg-surface-2 text-text-muted'
                  }`}
                >
                  {id}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-text-muted line-clamp-2">{info.resumen}</p>
            </button>
          );
        })}
      </div>

      {/* 2. Control de Transparencia de Tarjetas (Rescatado afuera, del 0 al 100%) */}
      <section
        data-testid="panel-transparencia-tarjetas"
        className="rounded-2xl border border-border bg-surface p-4 shadow-sm space-y-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-text">
              Transparencia de Tarjetas (Efecto Cristal)
            </h3>
            <p className="text-xs text-text-muted">
              Regula el nivel de traslúcido para ver el fondo animado con desenfoque de cristal
              (glassmorphism) en cualquier tema.
            </p>
          </div>
          <span
            data-testid="badge-transparencia-valor"
            className="rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-xs font-bold text-accent"
          >
            {transparenciaTarjetas} %
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-text-muted">0% (Sólido)</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            data-testid="slider-transparencia"
            value={transparenciaTarjetas}
            onChange={(e) => void cambiarTransparenciaTarjetas(Number(e.target.value))}
            className="w-full cursor-pointer accent-accent h-2 rounded-lg bg-surface-2"
          />
          <span className="text-xs font-semibold text-text-muted">100% (Cristal)</span>
        </div>
      </section>

      {/* 3. Selector de Fuente Global */}
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <FontFamilySelector />
      </section>
    </div>
  );
}

/**
 * Selector global e independiente de tipografías para AUREON.
 * Compatible con cualquier perfil de tema sin requerir tema personalizado.
 */
export function FontFamilySelector() {
  const { fuente, cambiarFuente } = useTheme();

  return (
    <div data-testid="selector-fuentes-global" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div>
          <h3 className="text-sm font-bold text-text">
            Estilo de Fuente de las Palabras (Tipografía)
          </h3>
          <p className="text-xs text-text-muted">
            Cambia la tipografía en toda la interfaz sin necesidad de tema personalizado. Aplica a
            Dark Modern, Gamificado, OLED o Clínico.
          </p>
        </div>
        <span className="rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-xs font-semibold text-accent">
          {MAPA_FUENTES[fuente]?.nombre ?? fuente}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {FUENTES_UI.map((fid) => {
          const infoF = MAPA_FUENTES[fid];
          const seleccionada = fuente === fid;
          return (
            <button
              key={fid}
              type="button"
              role="radio"
              aria-checked={seleccionada}
              data-testid={`btn-fuente-${fid}`}
              onClick={() => void cambiarFuente(fid)}
              className={`flex min-h-[72px] flex-col justify-between rounded-xl border p-3 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                seleccionada
                  ? 'border-accent bg-surface-2 text-accent shadow-sm ring-1 ring-accent'
                  : 'border-border bg-surface text-text hover:bg-surface-2 hover:border-text-muted'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-xs font-bold text-text" style={{ fontFamily: infoF.css }}>
                  {infoF.nombre}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                    seleccionada
                      ? 'bg-accent/20 text-accent font-bold'
                      : 'border border-border/50 bg-surface-2 text-text-muted'
                  }`}
                >
                  {infoF.categoria}
                </span>
              </div>
              <p className="text-[11px] text-text-muted truncate">{infoF.subtitulo}</p>
              <span
                className="w-full text-xs text-text/80 truncate font-normal pt-1 border-t border-border/40"
                style={{ fontFamily: infoF.css }}
              >
                {infoF.muestra}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
