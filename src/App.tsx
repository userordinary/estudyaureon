import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  actualizarBadgeRepasosPendientes,
  CoordinadorSyncDispositivo,
  db,
  ejecutarAutorrespaldoSemanalSiCorresponde,
  extraerTokensDeUrl,
  generarIdEstable,
  guardarSesionSyncStorage,
  leerSesionSyncStorage,
  obtenerUsuarioSupabase,
  ProveedorSupabaseSync,
  repositorios,
  resolverAtajoTecladoGlobal,
  resolverShortcutUrl,
  HORARIO_SEMANAL_DEFAULT,
  SETTINGS_POR_DEFECTO,
  solicitarPersistenciaAlmacenamiento,
  SUPABASE_CONFIG_DEFAULT,
  type CategoriaError,
  type EstadoIndicadorSync,
  type FocusSession,
  type Mistake,
  type MistakePhoto,
  type OperacionConDeshacer,
  type Practice,
  type RecursoEnlace,
  type SesionUsuarioSync,
  type Settings,
  type Simulacro,
  type TipoTareaEnfoque,
  type TopicProgress,
} from './data';
import {
  activarRepasoError,
  CURSO_IDS,
  estadoTemaAlRegistrarPractica,
  evaluacionActiva,
  generarPlanDelDia,
  nombreDiaSemana,
  planificarColaLeitner,
  semanaDelCiclo,
  sumarDias,
  type ConfigCiclo,
  type CursoId,
  type EstadoTemaDominio,
  type FechaISO,
} from './domain';
import { AjustesView } from './features/ajustes/AjustesView';
import { ComandoView } from './features/comando/ComandoView';
import { CursosView } from './features/cursos/CursosView';
import {
  crearSesionEnfoqueActiva,
  EnfoqueView,
  guardarSesionEnfoquePersistida,
  leerSesionEnfoquePersistida,
  type SesionEnfoqueActiva,
} from './features/enfoque/EnfoqueView';
import { ErroresView } from './features/errores/ErroresView';
import { HoyView } from './features/hoy/HoyView';
import { PracticeView } from './features/practica/PracticeView';
import {
  QuickRegisterSheet,
  type BorradorTanda,
  type ResultadoGuardarTanda,
} from './features/practica/QuickRegisterSheet';
import { SimulacrosView } from './features/simulacros/SimulacrosView';
import {
  AnimatedBackground,
  aplicarTemaEnDom,
  guardarFondoStorage,
  guardarTemaEnStorage,
  leerFondoStorage,
  leerTemaDeStorage,
  ThemeProvider,
  Toast,
  UiShowcase,
  type FondoAnimadoId,
  type TemaUI,
} from './ui';

export type VistaActiva =
  | 'hoy'
  | 'enfoque'
  | 'practica'
  | 'errores'
  | 'cursos'
  | 'simulacros'
  | 'comando'
  | 'ajustes'
  | 'ui';

export interface AppProps {
  fechaHoyOverride?: FechaISO;
  vistaInicial?: VistaActiva;
  ahoraMsOverride?: number;
}

function obtenerFechaLocalISO(): FechaISO {
  const ahora = new Date();
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function App({ fechaHoyOverride, vistaInicial, ahoraMsOverride }: AppProps = {}) {
  const fechaHoy = fechaHoyOverride ?? obtenerFechaLocalISO();

  const [sesionEnfoqueActiva, setSesionEnfoqueActiva] = useState<SesionEnfoqueActiva | null>(() =>
    leerSesionEnfoquePersistida(),
  );

  const detectarVistaInicial = (): VistaActiva => {
    if (vistaInicial) return vistaInicial;
    if (typeof window !== 'undefined') {
      const shortcut = resolverShortcutUrl(window.location.search);
      if (shortcut === 'errores') return 'errores';
      if (shortcut === 'enfoque') return 'enfoque';
      if (shortcut === 'hoy') return 'hoy';
      if (window.location.pathname === '/ui') {
        return 'ui';
      }
    }
    if (leerSesionEnfoquePersistida() !== null) {
      return 'enfoque';
    }
    return 'hoy';
  };

  const [vista, setVista] = useState<VistaActiva>(detectarVistaInicial);
  const [settings, setSettings] = useState<Settings>(() => {
    const temaPersistido = leerTemaDeStorage();
    if (temaPersistido) {
      aplicarTemaEnDom(temaPersistido);
      return { ...SETTINGS_POR_DEFECTO, tema: temaPersistido };
    }
    return { ...SETTINGS_POR_DEFECTO };
  });
  const [practices, setPractices] = useState<Practice[]>([]);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [fotosPorId, setFotosPorId] = useState<Record<string, MistakePhoto>>({});
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [topicProgress, setTopicProgress] = useState<TopicProgress[]>([]);
  const [simulacros, setSimulacros] = useState<Simulacro[]>([]);
  const [sesionSync, setSesionSync] = useState<SesionUsuarioSync | null>(() =>
    leerSesionSyncStorage(),
  );
  const [estadoSync, setEstadoSync] = useState<EstadoIndicadorSync>(() =>
    leerSesionSyncStorage() ? 'sincronizado' : 'local',
  );

  const manejarCambiarSesionEnfoque = useCallback((nueva: SesionEnfoqueActiva | null) => {
    setSesionEnfoqueActiva(nueva);
    guardarSesionEnfoquePersistida(nueva);
  }, []);

  // Estado del modal de Registro Rápido (persiste entre re-renders para no perder nunca datos)
  const [registroAbierto, setRegistroAbierto] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return resolverShortcutUrl(window.location.search) === 'registrar';
    }
    return false;
  });
  const [borradorTanda, setBorradorTanda] = useState<BorradorTanda>(() => ({
    cursoId: 'quim',
    temaId: null,
    ok: 10,
    bad: 0,
    fecha: fechaHoy,
  }));
  const usuarioEditoBorradorRef = useRef<boolean>(false);

  // Toast global con Deshacer (6 s)
  const [toastState, setToastState] = useState<{
    open: boolean;
    message: string;
    deshacer?: () => Promise<void>;
  }>({ open: false, message: '' });

  const mostrarToastConDeshacer = useCallback((message: string, deshacer?: () => Promise<void>) => {
    setToastState({ open: true, message, deshacer });
  }, []);

  const cargarInstantanea = useCallback(async () => {
    const [cfg, prac, err, foc, top, sims] = await Promise.all([
      repositorios.settings.obtener(),
      repositorios.practices.listar(),
      repositorios.mistakes.listar(),
      repositorios.focusSessions.listar(),
      repositorios.topicProgress.listar(),
      repositorios.simulacros.listar(),
    ]);

    const mapaFotos: Record<string, MistakePhoto> = {};
    for (const m of err) {
      if (m.fotoId) {
        const foto = await repositorios.mistakePhotos.obtener(m.fotoId);
        if (foto) mapaFotos[m.fotoId] = foto;
      }
    }

    return { cfg, prac, err, mapaFotos, foc, top, sims };
  }, []);

  const aplicarInstantanea = useCallback((snap: Awaited<ReturnType<typeof cargarInstantanea>>) => {
    const temaStorage = leerTemaDeStorage();
    const temaFinal = temaStorage ?? snap.cfg.tema ?? 'dark-modern';
    aplicarTemaEnDom(temaFinal);
    guardarTemaEnStorage(temaFinal);

    setSettings({
      ...snap.cfg,
      tema: temaFinal,
    });
    setPractices(snap.prac);
    setMistakes(snap.err);
    setFotosPorId(snap.mapaFotos);
    setFocusSessions(snap.foc);
    setTopicProgress(snap.top);
    setSimulacros(snap.sims);

    if (!usuarioEditoBorradorRef.current && snap.cfg.ultimoCursoId) {
      setBorradorTanda((prev) => ({
        ...prev,
        cursoId: snap.cfg.ultimoCursoId ?? prev.cursoId,
      }));
    }
  }, []);

  const recargarDatos = useCallback(async () => {
    const snap = await cargarInstantanea();
    aplicarInstantanea(snap);
  }, [aplicarInstantanea, cargarInstantanea]);

  useEffect(() => {
    let cancelado = false;
    void solicitarPersistenciaAlmacenamiento();
    void cargarInstantanea()
      .then((snap) => {
        if (!cancelado) {
          aplicarInstantanea(snap);
          void ejecutarAutorrespaldoSemanalSiCorresponde();
        }
      })
      .catch(() => {
        // Fallback resiliente si IndexedDB falla o está bloqueada
      });

    // Procesar retorno de enlace mágico de Supabase Auth (#access_token=...)
    if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
      const tokens = extraerTokensDeUrl(window.location.hash);
      if (tokens?.accessToken) {
        void (async () => {
          try {
            setEstadoSync('sincronizando');
            const user = await obtenerUsuarioSupabase(SUPABASE_CONFIG_DEFAULT, tokens.accessToken);
            const sesion: SesionUsuarioSync = {
              userId: user.id,
              email: user.email,
              accessToken: tokens.accessToken,
            };
            guardarSesionSyncStorage(sesion);
            setSesionSync(sesion);
            window.history.replaceState(null, '', window.location.pathname);
            const coord = new CoordinadorSyncDispositivo({
              database: db,
              proveedor: new ProveedorSupabaseSync(SUPABASE_CONFIG_DEFAULT),
              sesion,
              enLinea: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
            });
            const res = await coord.sincronizarAhora();
            setEstadoSync(res.estado);
            await recargarDatos();
          } catch {
            setEstadoSync('error');
          }
        })();
      }
    } else {
      // Sincronizar en segundo plano si ya hay sesión activa
      const sesionActiva = leerSesionSyncStorage();
      if (sesionActiva && SUPABASE_CONFIG_DEFAULT.supabaseUrl) {
        const coord = new CoordinadorSyncDispositivo({
          database: db,
          proveedor: new ProveedorSupabaseSync(SUPABASE_CONFIG_DEFAULT),
          sesion: sesionActiva,
          enLinea: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
        });
        void coord.sincronizarAhora().then(async (res) => {
          setEstadoSync(res.estado);
          if (res.recibidos > 0) {
            await recargarDatos();
          }
        });
      }
    }

    return () => {
      cancelado = true;
    };
  }, [aplicarInstantanea, cargarInstantanea, recargarDatos]);

  // Atajos globales de teclado en PC: n (registrar), r (repasar errores), h (hoy), f (enfoque)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const accion = resolverAtajoTecladoGlobal({
        key: e.key,
        tagName: target?.tagName,
        isContentEditable: target?.isContentEditable ?? false,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
      });
      if (!accion) return;

      e.preventDefault();
      if (accion === 'registrar') {
        setRegistroAbierto(true);
      } else if (accion === 'errores') {
        setVista('errores');
      } else if (accion === 'hoy') {
        setVista('hoy');
      } else if (accion === 'enfoque') {
        setVista('enfoque');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const actualizarBorrador = useCallback((actualizado: BorradorTanda) => {
    usuarioEditoBorradorRef.current = true;
    setBorradorTanda(actualizado);
  }, []);

  // Derivación pura del Plan del Día (hoy y vista previa de mañana)
  const { planHoy, planManana, repasosVencidosHoy } = useMemo(() => {
    const cfgCiclo: ConfigCiclo = {
      inicio: settings.inicioCiclo,
      semanas: 15,
      fechasEval: settings.fechasEval,
    };
    const semana = semanaDelCiclo(fechaHoy, cfgCiclo);
    const evaluacion = evaluacionActiva(fechaHoy, cfgCiclo);

    const dominioPorTema: Record<string, number> = {};
    for (const tp of topicProgress) {
      dominioPorTema[tp.temaId] =
        tp.estado === 'dominado'
          ? 90
          : tp.estado === 'progreso'
            ? 65
            : tp.estado === 'trabajado'
              ? 45
              : 20;
    }

    const erroresPorCurso: Partial<Record<CursoId, number>> = {};
    for (const m of mistakes) {
      if (m.estado !== 'dominado' && m.cursoId !== 'mix') {
        erroresPorCurso[m.cursoId] = (erroresPorCurso[m.cursoId] ?? 0) + 1;
      }
    }

    const ultimaPracticaPorCurso: Partial<Record<CursoId, FechaISO | null>> = {};
    for (const cid of CURSO_IDS) {
      ultimaPracticaPorCurso[cid] = null;
    }
    for (const p of practices) {
      if (p.cursoId !== 'mix') {
        const prev = ultimaPracticaPorCurso[p.cursoId];
        if (!prev || p.fecha > prev) {
          ultimaPracticaPorCurso[p.cursoId] = p.fecha;
        }
      }
    }

    // Cursos bajo el umbral (< 70 % de precisión histórica)
    const statsCurso = new Map<CursoId, { ok: number; total: number }>();
    for (const p of practices) {
      if (p.cursoId !== 'mix' && !p.sinDetalle) {
        const actual = statsCurso.get(p.cursoId) ?? { ok: 0, total: 0 };
        actual.ok += p.ok;
        actual.total += p.ok + p.bad;
        statsCurso.set(p.cursoId, actual);
      }
    }
    const cursosBajoUmbral: CursoId[] = [];
    for (const [cid, st] of statsCurso.entries()) {
      if (st.total >= 5 && st.ok / st.total < 0.7) {
        cursosBajoUmbral.push(cid);
      }
    }

    const minutosDiarios = Math.max(45, Math.round((settings.metaHorasSemana * 60) / 7));

    const horario = settings.horarioSemanal ?? HORARIO_SEMANAL_DEFAULT;
    const diaHoy = nombreDiaSemana(fechaHoy);
    const cursosHoy = horario[diaHoy] ?? [];

    const hoy = generarPlanDelDia({
      fecha: fechaHoy,
      minutosDisponibles: minutosDiarios,
      semana,
      evaluacion,
      dominioPorTema,
      erroresPorCurso,
      ultimaPracticaPorCurso,
      cursosBajoUmbral,
      cursosDelDia: cursosHoy,
    });

    // Para mañana, simulamos que hoy se practicaron los cursos del plan de hoy
    const ultimaManana: Partial<Record<CursoId, FechaISO | null>> = {
      ...ultimaPracticaPorCurso,
    };
    for (const b of hoy.bloques) {
      ultimaManana[b.cursoId] = fechaHoy;
    }
    const fechaManana = sumarDias(fechaHoy, 1);
    const diaManana = nombreDiaSemana(fechaManana);
    const cursosManana = horario[diaManana] ?? [];

    const manana = generarPlanDelDia({
      fecha: fechaManana,
      minutosDisponibles: minutosDiarios,
      semana: semanaDelCiclo(fechaManana, cfgCiclo),
      evaluacion: evaluacionActiva(fechaManana, cfgCiclo),
      dominioPorTema,
      erroresPorCurso,
      ultimaPracticaPorCurso: ultimaManana,
      cursosBajoUmbral,
      cursosDelDia: cursosManana,
    });

    const colaLeitner = planificarColaLeitner(mistakes, fechaHoy, settings.topeRepasosDia ?? 15);

    return {
      planHoy: hoy,
      planManana: manana,
      repasosVencidosHoy: colaLeitner.paraHoy.length,
    };
  }, [fechaHoy, mistakes, practices, settings, topicProgress]);

  // Sincronizar Badging API con repasos pendientes de hoy
  useEffect(() => {
    void actualizarBadgeRepasosPendientes(repasosVencidosHoy);
  }, [repasosVencidosHoy]);

  // Guardar tanda desde QuickRegisterSheet
  const manejarGuardarTanda = async ({
    borrador,
    categoriaErrores,
    notaError,
  }: ResultadoGuardarTanda) => {
    const ahora = Date.now();
    const idPractica = generarIdEstable('prac', ahora);
    const nuevaPractica: Practice = {
      id: idPractica,
      ts: ahora,
      fecha: borrador.fecha,
      cursoId: borrador.cursoId,
      temaId: borrador.temaId,
      ok: borrador.ok,
      bad: borrador.bad,
      origen: 'tanda',
    };

    let progresoTemaAutomatico: TopicProgress | undefined;
    if (borrador.temaId && borrador.cursoId !== 'mix') {
      const previo = topicProgress.find(
        (tp) => tp.cursoId === borrador.cursoId && tp.temaId === borrador.temaId,
      );
      const nuevoEstado = estadoTemaAlRegistrarPractica(previo?.estado);
      progresoTemaAutomatico = {
        cursoId: borrador.cursoId,
        temaId: borrador.temaId,
        estado: nuevoEstado,
        actualizadoEn: ahora,
      };
    }

    const opPractica = await repositorios.practices.registrar(
      nuevaPractica,
      progresoTemaAutomatico,
    );
    let deshacerError: (() => Promise<void>) | null = null;

    if (borrador.bad > 0) {
      const idError = generarIdEstable('err', ahora);
      const transicionInicial = activarRepasoError(borrador.fecha);
      const nuevoError: Mistake = {
        id: idError,
        origen: 'tanda',
        simulacroId: null,
        cursoId: borrador.cursoId,
        temaId: borrador.temaId,
        categoria: categoriaErrores,
        nota:
          notaError ||
          `Fallo registrado en tanda (${borrador.bad} incorrecta${borrador.bad > 1 ? 's' : ''})`,
        fotoId: null,
        creadoEn: ahora,
        fecha: borrador.fecha,
        estado: transicionInicial.estado,
        caja: transicionInicial.cajaNueva,
        proximoRepaso: transicionInicial.proximoRepaso,
        historial: [],
      };
      const opErr = await repositorios.mistakes.guardar(nuevoError);
      deshacerError = opErr.deshacer;
    }

    await recargarDatos();
    setRegistroAbierto(false);
    // Mantiene el último curso elegido y deja listo el contador para la siguiente tanda
    setBorradorTanda((prev) => ({
      ...prev,
      ok: 10,
      bad: 0,
      fecha: fechaHoy,
    }));

    mostrarToastConDeshacer(
      `Tanda guardada: +${borrador.ok + borrador.bad} preguntas`,
      async () => {
        if (deshacerError) await deshacerError();
        await opPractica.deshacer();
        await recargarDatos();
      },
    );
  };

  // Completar sesión de enfoque desde la acción principal de HOY -> abrir tanda prellenada
  const manejarCompletarEnfoqueYPrellenarTanda = async (params: {
    cursoId: CursoId;
    temaId: string | null;
    minutos: number;
    preguntasSugeridas: number;
    tipoTarea: TipoTareaEnfoque;
  }) => {
    const fin = Date.now();
    const inicio = fin - params.minutos * 60_000;
    const sesion: FocusSession = {
      id: generarIdEstable('foc', fin),
      inicio,
      fin,
      fecha: fechaHoy,
      modo: 'sprint',
      tipoTarea: params.tipoTarea,
      cursoId: params.cursoId,
      minutosEnfoque: params.minutos,
      fatiga: 2,
      distracciones: 0,
      completa: true,
    };
    const op = await repositorios.focusSessions.guardar(sesion);
    await recargarDatos();

    usuarioEditoBorradorRef.current = true;
    setBorradorTanda({
      cursoId: params.cursoId,
      temaId: params.temaId,
      ok: params.preguntasSugeridas,
      bad: 0,
      fecha: fechaHoy,
    });
    setRegistroAbierto(true);

    mostrarToastConDeshacer(
      `Bloque de enfoque guardado (+${sesion.minutosEnfoque} min)`,
      async () => {
        await op.deshacer();
        await recargarDatos();
      },
    );
  };

  // Iniciar bloque de enfoque en 1 solo toque desde "Hoy" con curso, tema y tipo prellenados
  const manejarIniciarEnfoqueDirectoDesdeHoy = (params: {
    cursoId: CursoId;
    temaId: string | null;
    minutos: number;
    preguntasSugeridas: number;
    tipoTarea: TipoTareaEnfoque;
  }) => {
    const modoSugerido =
      params.minutos >= 60 ? 'simulacro' : params.minutos >= 40 ? 'inmersion' : 'sprint';
    const descansoBase = modoSugerido === 'simulacro' ? 15 : modoSugerido === 'inmersion' ? 10 : 5;
    const nueva = crearSesionEnfoqueActiva({
      fechaHoy,
      modo: modoSugerido,
      cursoId: params.cursoId,
      temaId: params.temaId,
      tipoTarea: params.tipoTarea,
      minutosEnfoque: params.minutos,
      minutosDescanso: descansoBase,
      preguntasSugeridas: params.preguntasSugeridas,
      ahoraMs: ahoraMsOverride ?? Date.now(),
    });
    manejarCambiarSesionEnfoque(nueva);
    setVista('enfoque');
  };

  const manejarGuardarFocusSession = async (sesion: FocusSession) => {
    const op = await repositorios.focusSessions.guardar(sesion);
    await recargarDatos();
    mostrarToastConDeshacer(
      sesion.completa
        ? `Bloque de enfoque guardado (+${sesion.minutosEnfoque} min)`
        : `Enfoque parcial guardado (+${sesion.minutosEnfoque} min)`,
      async () => {
        await op.deshacer();
        await recargarDatos();
      },
    );
  };

  const manejarSugerirRegistrarTandaDeco = (params: {
    cursoId: Settings['ultimoCursoId'] & string;
    temaId: string | null;
    preguntasSugeridas: number;
  }) => {
    usuarioEditoBorradorRef.current = true;
    setBorradorTanda({
      cursoId: params.cursoId,
      temaId: params.temaId,
      ok: params.preguntasSugeridas,
      bad: 0,
      fecha: fechaHoy,
    });
    setRegistroAbierto(true);
  };

  const manejarEditarPractica = async (actualizada: Practice) => {
    const op = await repositorios.practices.registrar(actualizada);
    await recargarDatos();
    mostrarToastConDeshacer('Tanda actualizada', async () => {
      await op.deshacer();
      await recargarDatos();
    });
  };

  const manejarEliminarPractica = async (id: string) => {
    const op = await repositorios.practices.eliminar(id);
    await recargarDatos();
    mostrarToastConDeshacer('Tanda eliminada', async () => {
      await op.deshacer();
      await recargarDatos();
    });
  };

  const manejarActualizarSettings = async (parcial: Partial<Settings>) => {
    const op = await repositorios.settings.actualizar(parcial);
    await recargarDatos();
    mostrarToastConDeshacer('Ajustes actualizados', async () => {
      await op.deshacer();
      await recargarDatos();
    });
  };

  const manejarGuardarError = async (error: Mistake, fotoNueva?: MistakePhoto) => {
    const esNuevo = !mistakes.some((m) => m.id === error.id);
    const opErr = await repositorios.mistakes.guardar(error);
    let opFoto: OperacionConDeshacer<MistakePhoto> | null = null;
    if (fotoNueva) {
      opFoto = await repositorios.mistakePhotos.guardar(fotoNueva);
    }
    let opPrac: OperacionConDeshacer<Practice> | null = null;
    if (esNuevo) {
      const ahora = Date.now();
      const idPractica = generarIdEstable('prac', ahora);
      const nuevaPractica: Practice = {
        id: idPractica,
        ts: ahora,
        fecha: error.fecha ?? fechaHoy,
        cursoId: error.cursoId,
        temaId: error.temaId,
        ok: 0,
        bad: 1,
        origen: 'tanda',
      };
      opPrac = await repositorios.practices.registrar(nuevaPractica);
    }
    await recargarDatos();
    mostrarToastConDeshacer('Error guardado', async () => {
      if (opPrac) await opPrac.deshacer();
      if (opFoto) await opFoto.deshacer();
      await opErr.deshacer();
      await recargarDatos();
    });
  };

  const manejarEliminarError = async (id: string) => {
    const previo = mistakes.find((m) => m.id === id);
    let opFoto: OperacionConDeshacer<MistakePhoto | null> | null = null;
    if (previo?.fotoId) {
      opFoto = await repositorios.mistakePhotos.eliminar(previo.fotoId);
    }
    const op = await repositorios.mistakes.eliminar(id);
    await recargarDatos();
    mostrarToastConDeshacer('Error eliminado', async () => {
      await op.deshacer();
      if (opFoto) await opFoto.deshacer();
      await recargarDatos();
    });
  };

  const manejarClasificarError = async (error: Mistake, categoria: CategoriaError) => {
    const actualizado: Mistake = {
      ...error,
      categoria,
    };
    const op = await repositorios.mistakes.guardar(actualizado);
    await recargarDatos();
    mostrarToastConDeshacer('Error clasificado', async () => {
      await op.deshacer();
      await recargarDatos();
    });
  };

  const manejarConfirmarCierreDia = async () => {
    const op = await repositorios.settings.actualizar({
      ultimoCierreDia: fechaHoy,
    });
    await recargarDatos();
    mostrarToastConDeshacer('Cierre del día completado', async () => {
      await op.deshacer();
      await recargarDatos();
    });
  };

  // Handlers de Cursos (PROMPT 6)
  const manejarCambiarEstadoTema = async (
    cursoId: CursoId,
    temaId: string,
    estado: EstadoTemaDominio,
  ) => {
    const op = await repositorios.topicProgress.guardar({
      cursoId,
      temaId,
      estado,
      actualizadoEn: Date.now(),
    });
    await recargarDatos();
    mostrarToastConDeshacer(`Tema marcado como ${estado}`, async () => {
      await op.deshacer();
      await recargarDatos();
    });
  };

  const manejarActualizarMetaCurso = async (cursoId: CursoId, nuevaMeta: number) => {
    const op = await repositorios.settings.actualizar({
      metasCursoSemana: {
        ...settings.metasCursoSemana,
        [cursoId]: nuevaMeta,
      },
    });
    await recargarDatos();
    mostrarToastConDeshacer('Meta semanal actualizada', async () => {
      await op.deshacer();
      await recargarDatos();
    });
  };

  const manejarActualizarRecursos = async (enlaces: RecursoEnlace[]) => {
    const op = await repositorios.settings.actualizar({
      recursosEnlaces: enlaces,
    });
    await recargarDatos();
    mostrarToastConDeshacer('Recursos actualizados', async () => {
      await op.deshacer();
      await recargarDatos();
    });
  };

  // Handlers de Simulacros (PROMPT 7)
  const manejarGuardarSimulacro = async (simulacro: Simulacro) => {
    const op = await repositorios.simulacros.guardar(simulacro);
    await recargarDatos();
    mostrarToastConDeshacer('Simulacro guardado', async () => {
      await op.deshacer();
      await recargarDatos();
    });
  };

  const manejarEliminarSimulacro = async (id: string) => {
    const op = await repositorios.simulacros.eliminar(id);
    await recargarDatos();
    mostrarToastConDeshacer('Simulacro eliminado', async () => {
      await op.deshacer();
      await recargarDatos();
    });
  };

  const manejarGuardarMistakeSimulacro = async (
    error: Mistake,
    fotoNueva?: MistakePhoto,
    simulacroActualizado?: Simulacro,
  ) => {
    const opErr = await repositorios.mistakes.guardar(error);
    let opFoto: OperacionConDeshacer<MistakePhoto> | null = null;
    if (fotoNueva) {
      opFoto = await repositorios.mistakePhotos.guardar(fotoNueva);
    }
    let opSim: { deshacer: () => Promise<void> } | null = null;
    if (simulacroActualizado) {
      opSim = await repositorios.simulacros.guardar(simulacroActualizado);
    }
    await recargarDatos();
    mostrarToastConDeshacer(
      simulacroActualizado
        ? 'Error clasificado · ¡Simulacro marcado como Revisado!'
        : 'Error clasificado en simulacro',
      async () => {
        if (opSim) await opSim.deshacer();
        if (opFoto) await opFoto.deshacer();
        await opErr.deshacer();
        await recargarDatos();
      },
    );
  };

  const zenDominaPantalla =
    vista === 'enfoque' && sesionEnfoqueActiva !== null && sesionEnfoqueActiva.zenActivo;

  const manejarCambiarTema = useCallback(async (nuevoTema: TemaUI) => {
    aplicarTemaEnDom(nuevoTema);
    guardarTemaEnStorage(nuevoTema);
    setSettings((prev) => ({ ...prev, tema: nuevoTema }));
    try {
      await repositorios.settings.actualizar({ tema: nuevoTema });
    } catch {
      // Silencioso si la DB está cerrada
    }
  }, []);

  const fondoAnimado: FondoAnimadoId = settings.fondoAnimado ?? leerFondoStorage();

  const manejarCambiarFondoAnimado = useCallback(async (nuevoFondo: FondoAnimadoId) => {
    guardarFondoStorage(nuevoFondo);
    setSettings((prev) => ({ ...prev, fondoAnimado: nuevoFondo }));
    try {
      await repositorios.settings.actualizar({ fondoAnimado: nuevoFondo });
    } catch {
      // Silencioso si la DB está cerrada
    }
  }, []);

  return (
    <ThemeProvider temaControlado={settings.tema} onTemaCambiado={manejarCambiarTema}>
      {/* Fondo de pantalla animado interactivo */}
      <AnimatedBackground fondo={fondoAnimado} />

      <div
        data-zen-active={zenDominaPantalla ? 'true' : 'false'}
        className={`relative z-10 min-h-screen text-text transition-colors ${
          fondoAnimado !== 'ninguno' ? 'bg-transparent' : 'bg-bg'
        } ${vista === 'comando' ? 'pb-20 xl:h-screen xl:overflow-hidden xl:pb-0' : 'pb-24'}`}
      >
        {/* Barra superior de navegación (se atenúa en Modo Zen) */}
        <header
          data-testid="app-header"
          className={`sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur transition-opacity ${
            zenDominaPantalla ? 'opacity-25 hover:opacity-100' : 'opacity-100'
          }`}
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="font-mono text-base font-extrabold tracking-tight text-accent">
                AUREON
              </span>
              <nav aria-label="Navegación principal" className="flex items-center gap-1">
                {(
                  [
                    { id: 'hoy', label: 'Hoy' },
                    { id: 'enfoque', label: 'Enfoque' },
                    { id: 'practica', label: 'Práctica' },
                    { id: 'errores', label: 'Errores' },
                    { id: 'cursos', label: 'Cursos' },
                    { id: 'simulacros', label: 'Simulacros' },
                    { id: 'comando', label: 'Progreso' },
                    { id: 'ajustes', label: 'Ajustes' },
                    { id: 'ui', label: 'UI' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`nav-${tab.id}`}
                    aria-current={vista === tab.id ? 'page' : undefined}
                    onClick={() => setVista(tab.id)}
                    className={`min-h-11 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      vista === tab.id
                        ? 'bg-accent text-bg'
                        : 'text-text-muted hover:bg-surface-2 hover:text-text'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.id === 'errores' && repasosVencidosHoy > 0 && (
                      <span
                        data-testid="badge-repasos-nav"
                        className="ml-1 inline-flex items-center justify-center rounded-full bg-danger px-1.5 py-0.5 font-mono text-[10px] font-bold text-bg"
                      >
                        {repasosVencidosHoy}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="sync-status-pill"
                data-sync-state={estadoSync}
                onClick={() => setVista('ajustes')}
                title="Estado de sincronización (Dexie local primario)"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 font-mono text-[11px] font-semibold text-text-muted transition-colors hover:text-text"
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    estadoSync === 'sincronizado'
                      ? 'bg-success'
                      : estadoSync === 'sincronizando'
                        ? 'bg-accent'
                        : estadoSync === 'pendiente_offline'
                          ? 'bg-warn'
                          : estadoSync === 'error'
                            ? 'bg-danger'
                            : 'bg-text-muted'
                  }`}
                />
                <span>
                  {estadoSync === 'sincronizado'
                    ? 'Sincronizado'
                    : estadoSync === 'sincronizando'
                      ? 'Sincronizando…'
                      : estadoSync === 'pendiente_offline'
                        ? 'Cola offline'
                        : estadoSync === 'error'
                          ? 'Sync diferido'
                          : 'Local'}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* Contenido principal */}
        <main
          className={
            vista === 'comando'
              ? 'mx-auto max-w-7xl px-4 py-2 xl:h-[calc(100vh-3.75rem)] xl:overflow-hidden'
              : 'mx-auto max-w-6xl px-4 py-5'
          }
        >
          {vista === 'hoy' && (
            <HoyView
              fechaHoy={fechaHoy}
              settings={settings}
              practices={practices}
              mistakes={mistakes}
              simulacros={simulacros}
              focusSessions={focusSessions}
              planHoy={planHoy}
              planManana={planManana}
              repasosVencidosHoy={repasosVencidosHoy}
              onCompletarEnfoqueYPrellenarTanda={manejarCompletarEnfoqueYPrellenarTanda}
              onIniciarEnfoqueDirecto={manejarIniciarEnfoqueDirectoDesdeHoy}
              onClasificarError={manejarClasificarError}
              onIrAErrores={() => setVista('errores')}
              onConfirmarCierreDia={manejarConfirmarCierreDia}
              onActualizarSettings={manejarActualizarSettings}
            />
          )}

          {vista === 'enfoque' && (
            <EnfoqueView
              fechaHoy={fechaHoy}
              focusSessions={focusSessions}
              ultimoCursoId={settings.ultimoCursoId}
              sesionActiva={sesionEnfoqueActiva}
              onCambiarSesionActiva={manejarCambiarSesionEnfoque}
              onGuardarFocusSession={manejarGuardarFocusSession}
              onSugerirRegistrarTandaDeco={manejarSugerirRegistrarTandaDeco}
              ahoraMsOverride={ahoraMsOverride}
            />
          )}

          {vista === 'practica' && (
            <PracticeView
              practices={practices}
              onAbrirRegistroRapido={() => setRegistroAbierto(true)}
              onEditarPractice={manejarEditarPractica}
              onEliminarPractice={manejarEliminarPractica}
            />
          )}

          {vista === 'errores' && (
            <ErroresView
              fechaHoy={fechaHoy}
              mistakes={mistakes}
              fotosPorId={fotosPorId}
              topeDiario={settings.topeRepasosDia ?? 15}
              ultimoCursoId={settings.ultimoCursoId}
              cursosRecientes={settings.cursosRecientes}
              onGuardarMistake={manejarGuardarError}
              onEliminarMistake={manejarEliminarError}
            />
          )}

          {vista === 'cursos' && (
            <CursosView
              fechaHoy={fechaHoy}
              settings={settings}
              practices={practices}
              mistakes={mistakes}
              topicProgress={topicProgress}
              onCambiarEstadoTema={manejarCambiarEstadoTema}
              onActualizarMetaCurso={manejarActualizarMetaCurso}
              onActualizarRecursos={manejarActualizarRecursos}
            />
          )}

          {vista === 'simulacros' && (
            <SimulacrosView
              fechaHoy={fechaHoy}
              settings={settings}
              simulacros={simulacros}
              mistakes={mistakes}
              onGuardarSimulacro={manejarGuardarSimulacro}
              onEliminarSimulacro={manejarEliminarSimulacro}
              onGuardarMistakeSimulacro={manejarGuardarMistakeSimulacro}
            />
          )}

          {vista === 'comando' && (
            <ComandoView
              fechaHoy={fechaHoy}
              settings={settings}
              practices={practices}
              mistakes={mistakes}
              focusSessions={focusSessions}
              simulacros={simulacros}
              planHoy={planHoy}
              onIniciarEnfoqueCurso={(cursoId, temaId) => {
                const ahora = ahoraMsOverride ?? Date.now();
                const nuevaSesion = crearSesionEnfoqueActiva({
                  fechaHoy,
                  modo: 'inmersion',
                  cursoId,
                  temaId,
                  tipoTarea: 'practica_deco',
                  minutosEnfoque: 50,
                  minutosDescanso: 10,
                  preguntasSugeridas: 20,
                  ahoraMs: ahora,
                });
                manejarCambiarSesionEnfoque(nuevaSesion);
                setVista('enfoque');
              }}
              onIrAClasificarErrores={() => setVista('errores')}
            />
          )}

          {vista === 'ajustes' && (
            <AjustesView
              fechaHoy={fechaHoy}
              settings={settings}
              mistakes={mistakes}
              simulacros={simulacros}
              repasosPendientesHoy={repasosVencidosHoy}
              sesionSync={sesionSync}
              estadoSync={estadoSync}
              onCambiarSesionSync={(nueva, nuevoEstado) => {
                setSesionSync(nueva);
                setEstadoSync(nuevoEstado);
                guardarSesionSyncStorage(nueva);
              }}
              onActualizarSettings={manejarActualizarSettings}
              onDatosImportados={async (mensaje) => {
                await recargarDatos();
                mostrarToastConDeshacer(mensaje);
              }}
            />
          )}

          {vista === 'ui' && (
            <UiShowcase
              fondoAnimado={fondoAnimado}
              onCambiarFondoAnimado={manejarCambiarFondoAnimado}
            />
          )}
        </main>

        {/* Hoja de Registro Rápido (no pierde estado al re-renderizar, se abre con atajo 'n' o desde Práctica) */}
        <QuickRegisterSheet
          open={registroAbierto}
          onClose={() => setRegistroAbierto(false)}
          borrador={borradorTanda}
          onChangeBorrador={actualizarBorrador}
          cursosRecientes={settings.cursosRecientes ?? []}
          onGuardar={manejarGuardarTanda}
        />

        {/* Toast global con Deshacer (6 s) */}
        <Toast
          open={toastState.open}
          message={toastState.message}
          onClose={() => setToastState((prev) => ({ ...prev, open: false }))}
          onUndo={
            toastState.deshacer
              ? () => {
                  void toastState.deshacer?.();
                }
              : undefined
          }
        />
      </div>
    </ThemeProvider>
  );
}
