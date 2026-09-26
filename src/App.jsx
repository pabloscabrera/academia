import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Compass, ListChecks, Trophy, Clock, ChevronRight, ChevronDown,
  Plus, Check, X, Loader2, User, LogOut, Flag, Pencil, Trash2,
   Zap, Heart, Swords, Sword, Flame, Sparkles, Star, Award, Target, Settings,
   Medal, Gem, Crown, Search, Layers, Lightbulb, Users, Eye, FolderInput
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { leerPreguntasCache, guardarPreguntasCache, borrarPreguntasCache } from "./cachePreguntas";
import { TEMARIO } from "./temario";

const ADMIN_NAME = "pabloadmin";
const META_DIARIA_RACHA = 10;

// ---- identidad visual: "cuaderno de examen" ----
const TINTA = "#1E1C18";
const TINTA_SUAVE = "#6E6A61";
const TINTA_TENUE = "#9B9689";
const RAYA = "#C9C5B7";
const RAYA_FUERTE = "#1E1C18";
const ACENTO = "#A6362B";
const ACENTO_SUAVE = "#F7E9E6";
const CORRECTO = "#2E7D46";
const CORRECTO_SUAVE = "#E7F1E9";
const ORO = "#93711F";
const AVISO = "#9C5A1F";
const AVISO_SUAVE = "#FBEEE0";
const CAUTELA = "#8A6D1F";
const CAUTELA_SUAVE = "#FBF3DE";

// ---- portada de acceso: "sala de examen", fondo plano + tarjeta oscura ----
const PORTADA_TARJETA = "#1C170F";
const PORTADA_DORADO = "#E9C878";
const PORTADA_TEXTO = "#F0E9D8";
const PORTADA_PLACEHOLDER = "#8A7F68";
const PORTADA_BORDE = "rgba(217,169,77,.22)";

const AJUSTES_DEFECTO = { escala: 1, fondo: "#EEECE4", fuente: "fraunces" };
const ESCALAS = [
  { id: "pequena", label: "A", escala: 0.9, tamPreview: 13 },
  { id: "normal", label: "A", escala: 1, tamPreview: 16 },
  { id: "grande", label: "A", escala: 1.15, tamPreview: 19 },
  { id: "muygrande", label: "A", escala: 1.3, tamPreview: 22 },
];
const COLORES_FONDO = ["#EEECE4", "#E7E6E1", "#F2E7CC", "#E1E6E7", "#FFFFFF", "#F4E3DF"];
const FUENTES = [
  { id: "fraunces", label: "Fraunces", familia: "'Fraunces', Georgia, serif", italica: true },
  { id: "classic", label: "Clásica", familia: "'Source Serif 4', Georgia, serif", italica: true },
  { id: "sans", label: "Solo sans", familia: "'IBM Plex Sans', -apple-system, sans-serif", italica: false },
];
const INSIGNIAS = [
  { id: "bronce", umbral: 50, nombre: "Bronce", titulo: "Aprendiz", icon: Medal, color: "#B08D57" },
  { id: "plata", umbral: 150, nombre: "Plata", titulo: "Estudiante aplicado", icon: Award, color: "#9AA5B1" },
  { id: "oro", umbral: 300, nombre: "Oro", titulo: "Opositor experto", icon: Trophy, color: "#C89B3C" },
  { id: "platino", umbral: 600, nombre: "Platino", titulo: "Sabio PIR", icon: Gem, color: "#5EC9C0" },
  { id: "diamante", umbral: 1000, nombre: "Diamante", titulo: "Leyenda del PIR", icon: Crown, color: "#8A5A9E" },
];
function insigniaActual(totalCorrectas) {
  let actual = null;
  for (const ins of INSIGNIAS) { if (totalCorrectas >= ins.umbral) actual = ins; }
  return actual;
}
function siguienteInsignia(totalCorrectas) {
  return INSIGNIAS.find((ins) => totalCorrectas < ins.umbral) || null;
}
function esExamen(curso) {
  return typeof curso === "string" && /^pir\b/i.test(curso.trim());
}
async function fetchTodasPreguntas() {
  const TAM_PAGINA = 1000;
  let desde = 0;
  let todas = [];
  while (true) {
    const { data, error } = await supabase
      .from("preguntas")
      .select("*")
      .order("created_at", { ascending: true })
      .range(desde, desde + TAM_PAGINA - 1);
    if (error) throw error;
    todas = todas.concat(data || []);
    if (!data || data.length < TAM_PAGINA) break;
    desde += TAM_PAGINA;
  }
  return todas;
}

// Un día antes de volver a fiarse del recuento. Con menos se gana poco (el
// banco cambia cuando se transcribe un examen nuevo, no a diario) y con más
// una corrección de texto tardaría demasiado en llegar a quien ya la tiene
// descargada.
const MAX_EDAD_CACHE_MS = 24 * 60 * 60 * 1000;

// Devuelve el banco entero, bajándolo solo si hace falta.
async function obtenerPreguntas() {
  const cache = await leerPreguntasCache();
  if (cache) {
    // Una consulta de solo recuento (head: true) no trae ni una fila: unos
    // bytes frente a los megas del banco completo.
    const { count, error } = await supabase
      .from("preguntas")
      .select("id", { count: "exact", head: true });
    // Sin red, la copia de ayer vale más que una pantalla vacía.
    if (error) return cache.preguntas;
    const fresca = Date.now() - cache.guardadoEn < MAX_EDAD_CACHE_MS;
    if (fresca && count === cache.preguntas.length) return cache.preguntas;
  }
  try {
    const todas = await fetchTodasPreguntas();
    guardarPreguntasCache(todas);
    return todas;
  } catch (err) {
    if (cache) return cache.preguntas;
    throw err;
  }
}
function lunesDeLaSemana(fecha) {
  const d = new Date(fecha);
  const dia = d.getDay();
  const diff = (dia === 0 ? -6 : 1) - dia;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
const CURSOS_RULETA_COLORES = ["#2E7D6B", "#C89B3C", "#A6362B", "#5EC9C0", "#8A5A9E", "#3B6FA0"];

// Repetición espaciada estilo Anki (algoritmo SM-2). calidad: 0 = Muy difícil
// (fallo, se reinicia), 3 = Difícil, 4 = Fácil, 5 = Muy fácil.
function calcularSM2(progresoPrevio, calidad) {
  let ease = (progresoPrevio && progresoPrevio.ease_factor) || 2.5;
  let repeticiones = (progresoPrevio && progresoPrevio.repeticiones) || 0;
  let intervalo = (progresoPrevio && progresoPrevio.intervalo_dias) || 0;

  if (calidad < 3) {
    repeticiones = 0;
    intervalo = 1;
  } else {
    repeticiones += 1;
    if (repeticiones === 1) intervalo = 1;
    else if (repeticiones === 2) intervalo = 6;
    else intervalo = Math.round(intervalo * ease);
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - calidad) * (0.08 + (5 - calidad) * 0.02)));

  const hoy = new Date();
  const proxima = new Date(hoy.getTime() + intervalo * 86400000);
  return {
    ease_factor: Math.round(ease * 100) / 100,
    intervalo_dias: intervalo,
    repeticiones,
    proxima_revision: proxima.toISOString().slice(0, 10),
    ultima_revision: hoy.toISOString(),
  };
}

async function loadPersonal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
async function savePersonal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const DOMINIO_CUENTAS = "ruta-pir.local";
function emailDeUsuario(username) {
  return `${username.trim().toLowerCase()}@${DOMINIO_CUENTAS}`;
}
function usuarioFromSession(session) {
  if (!session || !session.user) return null;
  const meta = session.user.user_metadata || {};
  const username = meta.username || (session.user.email ? session.user.email.split("@")[0] : "");
  const isAdmin = username.toLowerCase() === ADMIN_NAME.toLowerCase();
  return { name: isAdmin ? "Pablo" : username, isAdmin };
}

export default function AcademiaPIR() {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [user, setUser] = useState(null);
  const [section, setSection] = useState("simulacros");
  const [questions, setQuestions] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [rachas, setRachas] = useState([]);
  const [fallos, setFallos] = useState([]);
  const [preguntasProgreso, setPreguntasProgreso] = useState([]);
  const [favoritos, setFavoritos] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [flashcardsProgreso, setFlashcardsProgreso] = useState([]);
  const [dueloEsperando, setDueloEsperando] = useState(null);
  const [autoUnirseDuelo, setAutoUnirseDuelo] = useState(false);
  const [ajustes, setAjustes] = useState(() => {
    try {
      const raw = localStorage.getItem("pir-ajustes");
      return raw ? { ...AJUSTES_DEFECTO, ...JSON.parse(raw) } : AJUSTES_DEFECTO;
    } catch {
      return AJUSTES_DEFECTO;
    }
  });
  const [mostrarAjustes, setMostrarAjustes] = useState(false);
  const [insigniaDesbloqueada, setInsigniaDesbloqueada] = useState(null);
  const [enLinea, setEnLinea] = useState(0);

  useEffect(() => { savePersonal("pir-ajustes", ajustes); }, [ajustes]);

  useEffect(() => {
    const cargarDatosApp = async () => {
      const qData = await obtenerPreguntas();
      const { data: rData, error: rErr } = await supabase
        .from("ranking")
        .select("*")
        .order("pct", { ascending: false })
        .limit(100);
      if (rErr) throw rErr;
      const { data: rachasData } = await supabase.from("rachas").select("*");
      const { data: flashcardsData } = await supabase.from("flashcards").select("*");
      setQuestions(qData || []);
      setRanking(rData || []);
      setRachas(rachasData || []);
      setFlashcards(flashcardsData || []);
    };

    let sesionAlCargar = false;
    let cargado = false;

    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        sesionAlCargar = !!(sessionData && sessionData.session);
        setUser(usuarioFromSession(sessionData && sessionData.session));
        await cargarDatosApp();
        cargado = true;
        setReady(true);
      } catch (err) {
        setLoadError(err && err.message ? err.message : String(err));
        setReady(true);
      }
    })();

    // Si la carga inicial ocurrió sin sesión (primer acceso en un navegador
    // nuevo), preguntas/ranking/rachas/flashcards se piden como "anon" y
    // vuelven vacíos en cuanto RLS exige autenticación. En cuanto el login o
    // el registro concede una sesión, se recargan ya autenticados.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(usuarioFromSession(session));
      const haySesion = !!session;
      if (cargado && haySesion && !sesionAlCargar) {
        sesionAlCargar = true;
        cargarDatosApp().catch((err) => console.error("No se pudieron recargar los datos tras iniciar sesión:", err));
      }
      if (!haySesion) sesionAlCargar = false;
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    let activo = true;
    const cutoffIso = () => new Date(Date.now() - DUELO_ESPERA_MAX_MS).toISOString();

    const cargarEsperando = async () => {
      const { data } = await supabase
        .from("duelos")
        .select("id, jugador1, created_at")
        .eq("estado", "esperando")
        .is("jugador2", null)
        .neq("jugador1", user.name)
        .gte("created_at", cutoffIso())
        .order("created_at", { ascending: true })
        .limit(1);
      if (activo) setDueloEsperando((data && data[0]) || null);
    };
    cargarEsperando();

    const channel = supabase
      .channel("duelos-lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "duelos" }, (payload) => {
        const fila = payload.eventType === "DELETE" ? payload.old : payload.new;
        if (!fila) return;
        if (payload.eventType === "INSERT" && fila.estado === "esperando" && fila.jugador1 !== user.name) {
          setDueloEsperando(fila);
        } else if (payload.eventType === "UPDATE" && fila.estado !== "esperando") {
          setDueloEsperando((prev) => (prev && prev.id === fila.id ? null : prev));
        } else if (payload.eventType === "DELETE") {
          setDueloEsperando((prev) => (prev && prev.id === fila.id ? null : prev));
        }
      })
      .subscribe();

    return () => { activo = false; supabase.removeChannel(channel); };
  }, [user && user.name]);

  useEffect(() => {
    if (!user) return;
    const canal = supabase.channel("presencia-global", {
      config: { presence: { key: user.name } },
    });
    canal
      .on("presence", { event: "sync" }, () => {
        setEnLinea(Object.keys(canal.presenceState()).length);
      })
      .subscribe(async (estado) => {
        if (estado === "SUBSCRIBED") await canal.track({ desde: new Date().toISOString() });
      });
    return () => { supabase.removeChannel(canal); };
  }, [user && user.name]);

  useEffect(() => {
    if (!user) return;
    let activo = true;
    (async () => {
      const { data: fData } = await supabase.from("fallos").select("*").eq("name", user.name);
      const { data: favData } = await supabase.from("favoritos").select("*").eq("name", user.name);
      const { data: progresoData } = await supabase.from("flashcards_progreso").select("*").eq("name", user.name);
      const { data: preguntasProgresoData, error: preguntasProgresoError } = await supabase.from("preguntas_progreso").select("*").eq("name", user.name);
      if (preguntasProgresoError) console.error("No se pudo cargar preguntas_progreso:", preguntasProgresoError.message);
      if (activo) {
        setFallos(fData || []);
        setFavoritos(favData || []);
        setFlashcardsProgreso(progresoData || []);
        setPreguntasProgreso(preguntasProgresoData || []);
      }
    })();
    return () => { activo = false; };
  }, [user && user.name]);

  const unirseAlDueloEnEspera = () => {
    setSection("duelo");
    setAutoUnirseDuelo(true);
  };

  useEffect(() => {
    const channel = supabase
      .channel("rachas-vivo")
      .on("postgres_changes", { event: "*", schema: "public", table: "rachas" }, (payload) => {
        const fila = payload.eventType === "DELETE" ? payload.old : payload.new;
        if (!fila) return;
        if (payload.eventType === "DELETE") {
          setRachas((prev) => prev.filter((r) => r.name !== fila.name));
        } else {
          setRachas((prev) => [...prev.filter((r) => r.name !== fila.name), fila]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const validarUsuario = (username) => {
    const limpio = (username || "").trim();
    if (!limpio) return "Escribe un nombre de usuario.";
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(limpio)) return "El usuario debe tener entre 3 y 20 letras, números o _ (sin espacios ni acentos).";
    return null;
  };

  const handleLogin = async (username, password) => {
    const errorUsuario = validarUsuario(username);
    if (errorUsuario) return { error: errorUsuario };
    if (!password) return { error: "Escribe tu contraseña." };
    const { error } = await supabase.auth.signInWithPassword({ email: emailDeUsuario(username), password });
    if (error) return { error: "Usuario o contraseña incorrectos." };
    return { error: null };
  };

  // El alta no la hace el navegador: la pide a api/registro.js, que es quien
  // comprueba el código de invitación y crea la cuenta con la service_role
  // key. Validar el código aquí no serviría de nada, porque este fichero se
  // descarga entero en el navegador de quien entre.
  const handleSignup = async (username, password, codigo) => {
    const errorUsuario = validarUsuario(username);
    if (errorUsuario) return { error: errorUsuario };
    if (!password || password.length < 6) return { error: "La contraseña debe tener al menos 6 caracteres." };
    if (!codigo || !codigo.trim()) return { error: "Escribe el código de invitación." };
    const limpio = username.trim();
    let respuesta;
    try {
      respuesta = await fetch("/api/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: limpio, password, codigo: codigo.trim() }),
      });
    } catch {
      return { error: "No se pudo conectar con el servidor. Inténtalo de nuevo." };
    }
    let datos = null;
    try { datos = await respuesta.json(); } catch {}
    if (!respuesta.ok) return { error: (datos && datos.error) || "No se pudo crear la cuenta." };
    // La cuenta ya existe pero sin sesión (la creó el servidor), así que
    // entramos directamente. Si por lo que sea fallara, AuthScreen enseña el
    // "Cuenta creada, ya puedes entrar" de siempre.
    await supabase.auth.signInWithPassword({ email: emailDeUsuario(limpio), password });
    return { error: null };
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const addQuestion = async (q) => {
    const { data, error } = await supabase
      .from("preguntas")
      .insert([{
        curso: q.curso, tema: q.tema, pregunta: q.pregunta,
        opciones: q.opciones, correcta: q.correcta, explicacion: q.explicacion,
        inventada: !!q.inventada,
      }])
      .select();
    // La copia local del banco deja de ser fiel en cuanto el admin lo toca.
    if (!error && data && data[0]) { setQuestions((prev) => [...prev, data[0]]); borrarPreguntasCache(); }
    return !error;
  };

  const updateQuestion = async (id, q) => {
    const { data, error } = await supabase
      .from("preguntas")
      .update({
        curso: q.curso, tema: q.tema, pregunta: q.pregunta,
        opciones: q.opciones, correcta: q.correcta, explicacion: q.explicacion
      })
      .eq("id", id)
      .select();
    if (!error && data && data[0]) {
      setQuestions((prev) => prev.map((p) => (p.id === id ? data[0] : p)));
      borrarPreguntasCache();
    }
    return !error;
  };

  const deleteQuestion = async (id) => {
    const { error } = await supabase.from("preguntas").delete().eq("id", id);
    if (!error) { setQuestions((prev) => prev.filter((p) => p.id !== id)); borrarPreguntasCache(); }
    return !error;
  };

  const submitScore = async (entry) => {
    const { data, error } = await supabase
      .from("ranking")
      .insert([{
        name: entry.name, score: entry.score, total: entry.total,
        pct: entry.pct, seconds: entry.seconds
      }])
      .select();
    if (!error && data && data[0]) {
      setRanking((prev) => [...prev, data[0]].sort((a, b) => b.pct - a.pct).slice(0, 100));
    }
  };

  const registrarAcierto = async (correcto) => {
    const actual = rachas.find((r) => r.name === user.name);
    const vivoPrevio = actual ? (actual.racha_actual || 0) : 0;
    const recordPrevio = actual ? (actual.racha_record || 0) : 0;
    const nuevoVivo = correcto ? vivoPrevio + 1 : 0;
    const nuevoRecord = Math.max(recordPrevio, nuevoVivo);
    try {
      const { data, error } = await supabase
        .from("rachas")
        .upsert({ name: user.name, racha_actual: nuevoVivo, racha_record: nuevoRecord }, { onConflict: "name" })
        .select();
      if (error) { console.error("No se pudo guardar la racha:", error.message); return; }
      if (data && data[0]) {
        setRachas((prev) => [...prev.filter((r) => r.name !== user.name), data[0]]);
      }
    } catch (err) {
      console.error("No se pudo guardar la racha:", err);
    }
  };

  const registrarResultadoDuelo = async (gano) => {
    const actual = rachas.find((r) => r.name === user.name);
    const vivoPrevio = actual ? (actual.racha_duelo_actual || 0) : 0;
    const recordPrevio = actual ? (actual.racha_duelos_record || 0) : 0;
    const nuevoVivo = gano ? vivoPrevio + 1 : 0;
    const nuevoRecord = Math.max(recordPrevio, nuevoVivo);
    try {
      const { data, error } = await supabase
        .from("rachas")
        .upsert({ name: user.name, racha_duelo_actual: nuevoVivo, racha_duelos_record: nuevoRecord }, { onConflict: "name" })
        .select();
      if (error) { console.error("No se pudo guardar la racha de duelos:", error.message); return; }
      if (data && data[0]) {
        setRachas((prev) => [...prev.filter((r) => r.name !== user.name), data[0]]);
      }
    } catch (err) {
      console.error("No se pudo guardar la racha de duelos:", err);
    }
  };

  const registrarProgresoDiario = async (correcto) => {
    const actual = rachas.find((r) => r.name === user.name);
    const hoy = new Date().toISOString().slice(0, 10);
    const lunes = lunesDeLaSemana(new Date());
    const totalRespondidasPrevio = actual ? (actual.total_respondidas || 0) : 0;
    const totalCorrectasPrevio = actual ? (actual.total_correctas || 0) : 0;
    const fechaCorrectasHoy = actual ? actual.fecha_correctas_hoy : null;
    const correctasHoyPrevias = fechaCorrectasHoy === hoy ? (actual ? (actual.correctas_hoy || 0) : 0) : 0;
    const semanaGuardada = actual ? actual.semana_actual : null;
    const correctasSemanaPrevias = semanaGuardada === lunes ? (actual ? (actual.correctas_semana || 0) : 0) : 0;

    const payload = { name: user.name, total_respondidas: totalRespondidasPrevio + 1 };

    if (correcto) {
      const nuevasCorrectasHoy = correctasHoyPrevias + 1;
      const nuevoTotalCorrectas = totalCorrectasPrevio + 1;
      payload.total_correctas = nuevoTotalCorrectas;
      payload.correctas_hoy = nuevasCorrectasHoy;
      payload.fecha_correctas_hoy = hoy;
      payload.correctas_semana = correctasSemanaPrevias + 1;
      payload.semana_actual = lunes;

      let nuevaRachaDias = actual ? (actual.racha_dias_actual || 0) : 0;
      let nuevoRecordDias = actual ? (actual.racha_dias_record || 0) : 0;
      const ultimoDia = actual ? actual.ultimo_dia_racha : null;
      if (nuevasCorrectasHoy >= META_DIARIA_RACHA && ultimoDia !== hoy) {
        const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        nuevaRachaDias = ultimoDia === ayer ? nuevaRachaDias + 1 : 1;
        nuevoRecordDias = Math.max(nuevoRecordDias, nuevaRachaDias);
        payload.racha_dias_actual = nuevaRachaDias;
        payload.racha_dias_record = nuevoRecordDias;
        payload.ultimo_dia_racha = hoy;
      }

      const insigniaPrevia = insigniaActual(totalCorrectasPrevio);
      const insigniaNueva = insigniaActual(nuevoTotalCorrectas);
      if (insigniaNueva && (!insigniaPrevia || insigniaPrevia.id !== insigniaNueva.id)) {
        setInsigniaDesbloqueada(insigniaNueva);
      }
    }

    try {
      const { data, error } = await supabase.from("rachas").upsert(payload, { onConflict: "name" }).select();
      if (error) { console.error("No se pudo guardar el progreso:", error.message); return; }
      if (data && data[0]) {
        setRachas((prev) => [...prev.filter((r) => r.name !== user.name), data[0]]);
      }
    } catch (err) {
      console.error("No se pudo guardar el progreso:", err);
    }
  };

  const girarRuleta = async () => {
    const actual = rachas.find((r) => r.name === user.name);
    const hoy = new Date().toISOString().slice(0, 10);
    try {
      const { data, error } = await supabase
        .from("rachas")
        .upsert({ name: user.name, ultimo_giro_ruleta: hoy }, { onConflict: "name" })
        .select();
      if (error) { console.error("No se pudo registrar el giro de la ruleta:", error.message); return; }
      if (data && data[0]) {
        setRachas((prev) => [...prev.filter((r) => r.name !== user.name), data[0]]);
      }
    } catch (err) {
      console.error("No se pudo registrar el giro de la ruleta:", err);
    }
  };

  const registrarFallo = async (pregunta) => {
    if (!pregunta || !pregunta.id) return;
    const previa = fallos.find((f) => f.pregunta_id === pregunta.id);
    const nuevasVeces = (previa ? previa.veces : 0) + 1;
    try {
      const { data, error } = await supabase
        .from("fallos")
        .upsert({ name: user.name, pregunta_id: pregunta.id, veces: nuevasVeces, updated_at: new Date().toISOString() }, { onConflict: "name,pregunta_id" })
        .select();
      if (!error && data && data[0]) {
        setFallos((prev) => [...prev.filter((f) => f.pregunta_id !== pregunta.id), data[0]]);
      }
    } catch (err) {
      console.error("No se pudo guardar el fallo:", err);
    }
  };

  const registrarProgresoPregunta = async (pregunta, correcta) => {
    if (!pregunta || !pregunta.id) return;
    const previa = preguntasProgreso.find((p) => p.pregunta_id === pregunta.id);
    const nuevasVeces = (previa ? previa.veces : 0) + 1;
    const acertada = (previa && previa.acertada) || !!correcta;
    try {
      const { data, error } = await supabase
        .from("preguntas_progreso")
        .upsert({ name: user.name, pregunta_id: pregunta.id, veces: nuevasVeces, acertada, updated_at: new Date().toISOString() }, { onConflict: "name,pregunta_id" })
        .select();
      if (error) console.error("No se pudo guardar el progreso de la pregunta:", error.message);
      if (!error && data && data[0]) {
        setPreguntasProgreso((prev) => [...prev.filter((p) => p.pregunta_id !== pregunta.id), data[0]]);
      }
    } catch (err) {
      console.error("No se pudo guardar el progreso de la pregunta:", err);
    }
  };

  const toggleFavorito = async (pregunta) => {
    if (!pregunta || !pregunta.id) return;
    const esFavorita = favoritos.some((f) => f.pregunta_id === pregunta.id);
    if (esFavorita) {
      const { error } = await supabase.from("favoritos").delete().eq("name", user.name).eq("pregunta_id", pregunta.id);
      if (!error) setFavoritos((prev) => prev.filter((f) => f.pregunta_id !== pregunta.id));
    } else {
      const { data, error } = await supabase
        .from("favoritos")
        .insert([{ name: user.name, pregunta_id: pregunta.id }])
        .select();
      if (!error && data && data[0]) setFavoritos((prev) => [...prev, data[0]]);
    }
  };

  const registrarRepasoFlashcard = async (flashcardId, calidad) => {
    if (!flashcardId || !user) return;
    const previo = flashcardsProgreso.find((p) => p.flashcard_id === flashcardId);
    const nuevo = calcularSM2(previo, calidad);
    try {
      const { data, error } = await supabase
        .from("flashcards_progreso")
        .upsert({ name: user.name, flashcard_id: flashcardId, ...nuevo }, { onConflict: "name,flashcard_id" })
        .select();
      if (!error && data && data[0]) {
        setFlashcardsProgreso((prev) => [...prev.filter((p) => p.flashcard_id !== flashcardId), data[0]]);
      }
    } catch (err) {
      console.error("No se pudo guardar el repaso de la flashcard:", err);
    }
  };

  // `f` puede traer frontal/posterior (editar el contenido) y/o mazo (mover
  // esta tarjeta a otro mazo) — solo se actualiza lo que venga.
  const updateFlashcard = async (id, f) => {
    const cambios = {};
    if (f.frontal !== undefined) cambios.frontal = f.frontal;
    if (f.posterior !== undefined) cambios.posterior = f.posterior;
    if (f.mazo !== undefined) cambios.mazo = f.mazo;
    if (f.etiquetas !== undefined) cambios.etiquetas = f.etiquetas;
    const { data, error } = await supabase
      .from("flashcards")
      .update(cambios)
      .eq("id", id)
      .select();
    if (!error && data && data[0]) {
      setFlashcards((prev) => prev.map((p) => (p.id === id ? data[0] : p)));
    }
    return !error;
  };

  const addFlashcard = async (f) => {
    const { data, error } = await supabase
      .from("flashcards")
      .insert([{ mazo: f.mazo || "General", frontal: f.frontal, posterior: f.posterior, etiquetas: f.etiquetas || [] }])
      .select();
    if (!error && data && data[0]) {
      setFlashcards((prev) => [...prev, data[0]]);
    }
    return !error;
  };

  const addFlashcardsBulk = async (mazo, tarjetas, etiquetas) => {
    const filas = tarjetas.map((t) => ({ mazo: mazo || "General", frontal: t.frontal, posterior: t.posterior, etiquetas: etiquetas || [] }));
    const { data, error } = await supabase.from("flashcards").insert(filas).select();
    if (!error && data) {
      setFlashcards((prev) => [...prev, ...data]);
    }
    return error ? 0 : data.length;
  };

  const deleteFlashcard = async (id) => {
    const carta = flashcards.find((f) => f.id === id);
    const grupoId = carta ? carta.grupo_id || carta.id : id;
    const { error } = await supabase.from("flashcards").delete().eq("id", id);
    if (!error) {
      const restantes = flashcards.filter((f) => f.id !== id);
      setFlashcards(restantes);
      const quedanCopias = restantes.some((f) => (f.grupo_id || f.id) === grupoId);
      if (!quedanCopias) {
        await supabase.from("flashcards_progreso").delete().eq("flashcard_id", grupoId);
        setFlashcardsProgreso((prev) => prev.filter((p) => p.flashcard_id !== grupoId));
      }
    }
    return !error;
  };

  const renombrarMazo = async (viejo, nuevo) => {
    const destino = (nuevo || "").trim();
    if (!destino || destino === viejo) return false;
    const ids = flashcards.filter((f) => (f.mazo || "General") === viejo).map((f) => f.id);
    if (ids.length === 0) return false;
    try {
      const { error } = await supabase.from("flashcards").update({ mazo: destino }).in("id", ids);
      if (error) throw error;
      setFlashcards((prev) => prev.map((f) => ((f.mazo || "General") === viejo ? { ...f, mazo: destino } : f)));
      return true;
    } catch (err) {
      console.error("No se pudo renombrar el mazo:", err);
      return false;
    }
  };

  const eliminarMazo = async (nombre) => {
    const filas = flashcards.filter((f) => (f.mazo || "General") === nombre);
    const ids = filas.map((f) => f.id);
    if (ids.length === 0) return false;
    const { error } = await supabase.from("flashcards").delete().in("id", ids);
    if (!error) {
      const restantes = flashcards.filter((f) => !ids.includes(f.id));
      setFlashcards(restantes);
      // flashcards_progreso.flashcard_id ya no es una FK a flashcards(id)
      // (no puede serlo: grupo_id se repite entre las copias de una misma
      // tarjeta), así que ya no hay "on delete cascade" automático — solo se
      // borra el progreso de los grupos que se quedan sin ninguna copia viva
      // (si una tarjeta tenía otra copia fuera de este mazo/carpeta, su
      // progreso compartido sigue intacto).
      const gruposEliminados = new Set(filas.map((f) => f.grupo_id || f.id));
      const gruposSupervivientes = new Set(restantes.map((f) => f.grupo_id || f.id));
      const gruposHuerfanos = [...gruposEliminados].filter((g) => !gruposSupervivientes.has(g));
      if (gruposHuerfanos.length > 0) {
        await supabase.from("flashcards_progreso").delete().in("flashcard_id", gruposHuerfanos);
      }
      setFlashcardsProgreso((prev) => prev.filter((p) => !gruposHuerfanos.includes(p.flashcard_id)));
    }
    return !error;
  };

  let contenido;
  if (!ready) {
    contenido = <div style={{ ...styles.center, height: "100%", minHeight: 400 }}><Loader2 className="animate-spin" size={28} color={ACENTO} /></div>;
  } else if (loadError) {
    contenido = (
      <div style={{ padding: 24 }}>
        <h2 style={{ fontFamily: "var(--font-display)", color: "#A6362B" }}>No se pudo conectar</h2>
        <p style={{ color: "#6E6A61", fontSize: 14, lineHeight: 1.5 }}>{loadError}</p>
      </div>
    );
  } else if (!user) {
    contenido = <AuthScreen onLogin={handleLogin} onSignup={handleSignup} />;
  } else {
    contenido = (
      <div>
        <style>{`
          @keyframes dueloPulso {
            0% { transform: scale(1); }
            50% { transform: scale(1.06); }
            100% { transform: scale(1); }
          }
          @keyframes pulsoEnLinea {
            0% { transform: scale(1); opacity: 0.7; }
            70% { transform: scale(2.2); opacity: 0; }
            100% { transform: scale(2.2); opacity: 0; }
          }
        `}</style>
        <Header
          user={user} onLogout={handleLogout} miRacha={rachas.find((r) => r.name === user.name)} onAjustes={() => setMostrarAjustes(true)}
          questions={questions} onAddQuestion={addQuestion} onUpdateQuestion={updateQuestion} onDeleteQuestion={deleteQuestion}
          favoritos={favoritos} onToggleFavorito={toggleFavorito} rachas={rachas} onGirarRuleta={girarRuleta}
          enLinea={enLinea} preguntasProgreso={preguntasProgreso}
        />
        <Nav section={section} setSection={setSection} alerta={!!dueloEsperando} />
        {dueloEsperando && section !== "duelo" && (
          <button
            type="button"
            onClick={unirseAlDueloEnEspera}
            style={styles.dueloAviso}
          >
            <Zap size={16} /> {dueloEsperando.jugador1} está buscando duelo — ¡Únete!
          </button>
        )}
        {(() => {
          const miRachaActual = rachas.find((r) => r.name === user.name);
          const hoy = new Date().toISOString().slice(0, 10);
          const correctasHoyActual = miRachaActual && miRachaActual.fecha_correctas_hoy === hoy ? (miRachaActual.correctas_hoy || 0) : 0;
          const rachaDiasActual = (miRachaActual && miRachaActual.racha_dias_actual) || 0;
          if (rachaDiasActual > 0 && correctasHoyActual < META_DIARIA_RACHA && section !== "simulacros") {
            const faltan = META_DIARIA_RACHA - correctasHoyActual;
            return (
              <button type="button" onClick={() => setSection("simulacros")} style={styles.rachaAviso}>
                <Flame size={16} color="#A6362B" fill="#A6362B" /> Te quedan {faltan} acierto{faltan === 1 ? "" : "s"} para no perder tu racha de {rachaDiasActual} día{rachaDiasActual === 1 ? "" : "s"}
              </button>
            );
          }
          return null;
        })()}
        <main style={styles.main}>
          {section === "flashcards" && (
            <Flashcards
              user={user}
              flashcards={flashcards}
              progreso={flashcardsProgreso}
              onRepaso={registrarRepasoFlashcard}
              onUpdate={updateFlashcard}
              onAdd={addFlashcard}
              onAddBulk={addFlashcardsBulk}
              onDelete={deleteFlashcard}
              onRenombrarMazo={renombrarMazo}
              onEliminarMazo={eliminarMazo}
            />
          )}
          {section === "perfil" && (
            <MiPerfil
              user={user}
              miRacha={rachas.find((r) => r.name === user.name)}
              questions={questions}
              fallos={fallos}
              preguntasProgreso={preguntasProgreso}
              favoritos={favoritos}
              onToggleFavorito={toggleFavorito}
              onGirarRuleta={girarRuleta}
            />
          )}
          {section === "simulacros" && (
            <Simulacros
              questions={questions}
              user={user}
              onFinish={submitScore}
              onStreakAnswer={registrarAcierto}
              onProgresoDiario={registrarProgresoDiario}
              onFallo={registrarFallo}
              onRespuestaPregunta={registrarProgresoPregunta}
              favoritos={favoritos}
              onToggleFavorito={toggleFavorito}
              miRacha={rachas.find((r) => r.name === user.name)}
              preguntasProgreso={preguntasProgreso}
              fallos={fallos}
            />
          )}
          {section === "duelo" && (
            <Duelo
              user={user}
              questions={questions}
              onDueloEnd={registrarResultadoDuelo}
              onProgresoDiario={registrarProgresoDiario}
              onRespuestaPregunta={registrarProgresoPregunta}
              autoUnirse={autoUnirseDuelo}
              onAutoUnirseConsumido={() => setAutoUnirseDuelo(false)}
            />
          )}
        </main>
      </div>
    );
  }

  const fuenteActual = FUENTES.find((f) => f.id === ajustes.fuente) || FUENTES[0];
  return (
    <div style={{ ...styles.app, background: ajustes.fondo, zoom: ajustes.escala, "--font-display": fuenteActual.familia }}>
      {contenido}
      {mostrarAjustes && <AjustesPanel ajustes={ajustes} setAjustes={setAjustes} onClose={() => setMostrarAjustes(false)} />}
      {insigniaDesbloqueada && <InsigniaDesbloqueadaModal insignia={insigniaDesbloqueada} onClose={() => setInsigniaDesbloqueada(null)} />}
    </div>
  );
}

// El enlace de invitación puede llevar el código puesto (…/?c=CODIGO), para
// no tener que dictarlo aparte. Solo rellena el campo: quien valida sigue
// siendo el servidor.
function codigoDelEnlace() {
  try {
    const p = new URLSearchParams(window.location.search);
    return (p.get("c") || p.get("codigo") || "").trim();
  } catch {
    return "";
  }
}

function AuthScreen({ onLogin, onSignup }) {
  const [codigo, setCodigo] = useState(codigoDelEnlace);
  const [modo, setModo] = useState(() => (codigoDelEnlace() ? "signup" : "login"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [cuentaCreada, setCuentaCreada] = useState(false);

  const cambiarModo = (m) => { setModo(m); setError(null); setCuentaCreada(false); };

  const submit = async () => {
    if (cargando) return;
    setError(null);
    if (modo === "signup" && password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setCargando(true);
    const resultado = modo === "login" ? await onLogin(username, password) : await onSignup(username, password, codigo);
    setCargando(false);
    if (resultado.error) {
      setError(resultado.error);
    } else if (modo === "signup") {
      setCuentaCreada(true);
    }
  };

  const tabPortada = { flex: 1, padding: "15px 16px", borderRadius: 14, border: `1.5px solid ${PORTADA_BORDE}`, background: "#241D13", color: "#B8AB8C", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
  const tabPortadaActivo = { background: PORTADA_DORADO, border: `1.5px solid ${PORTADA_DORADO}`, color: PORTADA_TARJETA };
  const inputPortada = { ...styles.input, background: "#241D13", border: `1.5px solid ${PORTADA_BORDE}`, color: PORTADA_TEXTO, padding: "14px 20px", fontSize: 17, borderRadius: 14 };
  const btnPortada = { ...styles.btnPrimary, position: "relative", zIndex: 1, width: "100%", margin: 0, borderRadius: 12.5, padding: "15px 24px", fontSize: 17, background: PORTADA_DORADO, color: PORTADA_TARJETA, justifyContent: "center" };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100dvh", position: "relative", overflow: "hidden", padding: "32px 0", boxSizing: "border-box" }}>
      <FondoPortada />
      <style>{`
        .portada-input::placeholder { color: ${PORTADA_PLACEHOLDER}; }
        /* Un destello que cruza el botón cada pocos segundos, en vez del aro
           de luz que daba vueltas sin parar: dura poco más de un segundo y
           el resto del tiempo no hay nada moviéndose. Va por encima del
           botón (z-index 2), no detrás, para que se vea sobre el dorado. */
        @keyframes portadaDestello {
          0%, 62% { transform: translateX(-170%) skewX(-16deg); opacity: 0; }
          67% { opacity: 1; }
          86% { transform: translateX(320%) skewX(-16deg); opacity: 0; }
          100% { transform: translateX(320%) skewX(-16deg); opacity: 0; }
        }
        .portada-btn-destello {
          position: absolute; top: 0; bottom: 0; left: 0; width: 38%;
          z-index: 2; pointer-events: none; border-radius: 12.5px;
          background: linear-gradient(100deg, transparent 0%, rgba(255,248,226,.92) 50%, transparent 100%);
          animation: portadaDestello 4.5s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .portada-btn-destello { animation: none; opacity: 0; } }
      `}</style>
      <div style={{ maxWidth: 480, width: "100%", padding: "0 24px", textAlign: "center", position: "relative", zIndex: 1 }}>
        <div style={{ marginBottom: 34 }}>
          <WordmarkPortada texto="AUTOPIR" />
        </div>
        <div style={{ ...styles.tabsOrigen, marginBottom: 18 }}>
          <button type="button" onClick={() => cambiarModo("login")} style={{ ...tabPortada, ...(modo === "login" ? tabPortadaActivo : {}) }}>Iniciar sesión</button>
          <button type="button" onClick={() => cambiarModo("signup")} style={{ ...tabPortada, ...(modo === "signup" ? tabPortadaActivo : {}) }}>Crear cuenta</button>
        </div>
        {cuentaCreada ? (
          <Card style={{ ...styles.authCard, background: PORTADA_TARJETA, border: `1.5px solid ${PORTADA_BORDE}`, padding: 34 }}>
            <p style={{ fontSize: 16, color: PORTADA_TEXTO, lineHeight: 1.5, margin: 0 }}>
              Cuenta creada. Ya puedes entrar con tu usuario y contraseña.
            </p>
            <div style={{ position: "relative", borderRadius: 14, padding: 1.5, overflow: "hidden", marginTop: 18, background: "#4a3a1c" }}>
              <button
                type="button"
                onClick={() => { setPassword(""); setPassword2(""); cambiarModo("login"); }}
                style={btnPortada}
              >
                Ir a entrar
              </button>
              <span className="portada-btn-destello" />
            </div>
          </Card>
        ) : (
          <Card style={{ ...styles.authCard, background: PORTADA_TARJETA, border: `1.5px solid ${PORTADA_BORDE}`, padding: 34 }}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Nombre de usuario"
              className="portada-input"
              style={{ ...inputPortada, marginBottom: 14 }}
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Contraseña"
              type="password"
              className="portada-input"
              style={{ ...inputPortada, marginBottom: modo === "signup" ? 14 : 0 }}
            />
            {modo === "signup" && (
              <>
                <input
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="Repite la contraseña"
                  type="password"
                  className="portada-input"
                  style={{ ...inputPortada, marginBottom: 14 }}
                />
                <input
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="Código de invitación"
                  className="portada-input"
                  style={inputPortada}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <p style={{ fontSize: 13, color: PORTADA_PLACEHOLDER, margin: "10px 2px 0", lineHeight: 1.45 }}>
                  {codigoDelEnlace()
                    ? "Código cogido del enlace de invitación."
                    : "Sin código no se puede crear la cuenta. Pídeselo a Pablo."}
                </p>
              </>
            )}
            {error && <p style={{ color: ACENTO, fontSize: 14, marginTop: 12 }}>{error}</p>}
            <div style={{ position: "relative", borderRadius: 14, padding: 1.5, overflow: "hidden", marginTop: 18, background: "#4a3a1c" }}>
              <button type="button" onClick={submit} disabled={cargando} style={{ ...btnPortada, opacity: cargando ? 0.6 : 1 }}>
                {cargando ? <Loader2 className="animate-spin" size={18} /> : modo === "login" ? "Entrar" : "Crear cuenta"}
              </button>
              <span className="portada-btn-destello" />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function WordmarkPortada({ texto }) {
  const rotaciones = useMemo(() => texto.split("").map(() => (Math.random() * 16 - 8).toFixed(1)), [texto]);
  return (
    <div style={{ position: "relative", display: "inline-flex", justifyContent: "center", whiteSpace: "nowrap" }}>
      <style>{`
        @keyframes portadaCaer {
          0% { opacity: 0; transform: translateY(-140px) rotate(var(--rot, 0deg)); }
          55% { opacity: 1; transform: translateY(0) rotate(0deg); }
          68% { opacity: 1; transform: translateY(7px) scaleY(.82) scaleX(1.1); }
          82% { opacity: 1; transform: translateY(-3px) scaleY(1.03); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes portadaGolpe {
          0%, 52% { opacity: 0; transform: translateX(-50%) scaleX(.15); }
          60% { opacity: .6; transform: translateX(-50%) scaleX(1.3); }
          100% { opacity: .16; transform: translateX(-50%) scaleX(.55); }
        }
        .portada-letra { display: inline-block; animation: portadaCaer .85s cubic-bezier(.34,1.4,.64,1) both; }
        .portada-suelo { position: absolute; left: 50%; bottom: -5px; width: 86%; height: 9px; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(ellipse, rgba(20,16,10,.38) 0%, rgba(20,16,10,.24) 45%, rgba(20,16,10,.08) 72%, transparent 88%); }
        .portada-impacto { position: absolute; left: 50%; bottom: -6px; width: 70%; height: 8px; transform: translateX(-50%) scaleX(.2); border-radius: 50%; opacity: 0; animation: portadaGolpe .85s ease-out both; background: radial-gradient(ellipse, rgba(233,200,120,.5), transparent 70%); }
        @media (prefers-reduced-motion: reduce) { .portada-letra { animation-duration: .01s !important; animation-delay: 0s !important; } }
      `}</style>
      <span className="portada-suelo" />
      {texto.split("").map((ch, i) => (
        <span key={i} style={{ position: "relative", display: "inline-block" }}>
          <span
            className="portada-letra"
            style={{
              animationDelay: `${(i * 0.055).toFixed(3)}s`,
              "--rot": `${rotaciones[i]}deg`,
              fontFamily: "'Big Shoulders Display', sans-serif",
              fontWeight: 900,
              fontSize: "clamp(48px, 10vw, 76px)",
              letterSpacing: 0.5,
              color: TINTA,
            }}
          >
            {ch}
          </span>
          <span className="portada-impacto" style={{ animationDelay: `${(i * 0.055).toFixed(3)}s` }} />
        </span>
      ))}
    </div>
  );
}

function FondoPortada() {
  const mancha = (props) => ({
    position: "absolute", borderRadius: "50%", filter: "blur(60px)", ...props,
  });
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden", background: "#FBF9F4" }}>
      <div style={mancha({ width: 560, height: 520, left: "-14%", top: "-16%", background: "radial-gradient(circle, rgba(233,200,120,.55), transparent 70%)", transform: "rotate(-8deg)" })} />
      <div style={mancha({ width: 600, height: 360, right: "-12%", top: "2%", background: "radial-gradient(circle, rgba(166,54,43,.16), transparent 72%)", transform: "rotate(16deg)" })} />
      <div style={mancha({ width: 640, height: 400, left: "-10%", bottom: "-14%", background: "radial-gradient(circle, rgba(46,125,70,.14), transparent 70%)", transform: "rotate(-12deg)" })} />
      <div style={mancha({ width: 520, height: 500, right: "-16%", bottom: "-18%", background: "radial-gradient(circle, rgba(233,200,120,.4), transparent 72%)", transform: "rotate(7deg)" })} />
    </div>
  );
}

function AjustesPanel({ ajustes, setAjustes, onClose }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontSize: 17, fontFamily: "var(--font-display)", color: "#1E1C18" }}>Ajustes</span>
          <button type="button" onClick={onClose} style={styles.iconBtn}><X size={18} color="#6E6A61" /></button>
        </div>

        <FieldLabel>Tamaño de letra</FieldLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          {ESCALAS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setAjustes((prev) => ({ ...prev, escala: e.escala }))}
              style={{ ...styles.escalaBtn, ...(ajustes.escala === e.escala ? styles.escalaBtnActivo : {}), fontSize: e.tamPreview }}
            >
              A
            </button>
          ))}
        </div>

        <FieldLabel>Color de fondo</FieldLabel>
        <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
          {COLORES_FONDO.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAjustes((prev) => ({ ...prev, fondo: c }))}
              title={c}
              style={{ ...styles.colorSwatch, background: c, borderColor: ajustes.fondo === c ? TINTA : RAYA }}
            >
              {ajustes.fondo === c && <Check size={14} color={TINTA} />}
            </button>
          ))}
        </div>

        <FieldLabel>Tipografía</FieldLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          {FUENTES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setAjustes((prev) => ({ ...prev, fuente: f.id }))}
              style={{
                ...styles.escalaBtn,
                ...(ajustes.fuente === f.id ? styles.escalaBtnActivo : {}),
                fontFamily: f.familia, fontSize: 15, fontWeight: 600,
              }}
            >
              Ag
            </button>
          ))}
        </div>

        <button type="button" onClick={() => setAjustes(AJUSTES_DEFECTO)} style={styles.btnSecondary}>
          Restablecer
        </button>
      </div>
    </div>
  );
}

const CONFETI_COLORES = ["#2E7D6B", "#C89B3C", "#A6362B", "#8A5A9E", "#5EC9C0"];

function InsigniaDesbloqueadaModal({ insignia, onClose }) {
  const Icono = insignia.icon;
  const piezas = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    izquierda: Math.random() * 100,
    retraso: Math.random() * 0.5,
    duracion: 1.6 + Math.random() * 1,
    color: CONFETI_COLORES[i % CONFETI_COLORES.length],
    rotacion: Math.random() * 360,
  })), []);
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <style>{`
        @keyframes confetiCae {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(340px) rotate(360deg); opacity: 0; }
        }
        @keyframes insigniaPop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); }
        }
      `}</style>
      <div style={{ ...styles.modalCard, textAlign: "center", position: "relative", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        {piezas.map((p, i) => (
          <span
            key={i}
            style={{
              position: "absolute", top: 0, left: `${p.izquierda}%`, width: 7, height: 10,
              background: p.color, borderRadius: 2,
              animation: `confetiCae ${p.duracion}s ease-in ${p.retraso}s forwards`,
              transform: `rotate(${p.rotacion}deg)`,
            }}
          />
        ))}
        <div style={{ animation: "insigniaPop 0.5s ease-out" }}>
          <Icono size={48} color={insignia.color} strokeWidth={1.5} style={{ margin: "8px 0 14px" }} />
        </div>
        <div style={{ fontSize: 12, color: "#9B9689", textTransform: "uppercase", letterSpacing: 1 }}>Nueva insignia</div>
        <div style={{ fontSize: 20, fontFamily: "var(--font-display)", color: "#1E1C18", marginTop: 4 }}>{insignia.titulo}</div>
        <div style={{ fontSize: 13, color: "#6E6A61", marginTop: 4 }}>Has llegado a {insignia.umbral} preguntas acertadas</div>
        <button type="button" onClick={onClose} style={{ ...styles.btnPrimary, marginTop: 20, justifyContent: "center" }}>
          Genial
        </button>
      </div>
    </div>
  );
}

const FRASES_MOTIVADORAS = [
  "Cada test que haces hoy es un punto menos de nervios el día del examen.",
  "No necesitas sentirte con ganas para estudiar; solo necesitas empezar la primera pregunta.",
  "El PIR no lo aprueba quien más sabe, sino quien no se rinde en enero.",
  "Fallar una pregunta ahora es gratis. Fallarla en el examen, no.",
  "Llevas más estudiado de lo que crees en los días malos.",
  "Una racha se rompe una vez; el hábito de volver a intentarlo, nunca.",
  "Hoy no hace falta un día perfecto. Hace falta un tema menos.",
  "Tu yo de dentro de unos meses te va a agradecer esta tarde.",
  "El cansancio de estudiar duele menos que el de repetir la convocatoria.",
  "No compares tu ritmo con el de otros opositores: compáralo con el tuyo de la semana pasada.",
  "Cada flashcard repasada es una pregunta que ya no te puede sorprender.",
  "Descansar también es parte del plan de estudio, no una interrupción.",
  "Nadie se examina de lo que sabe un día cualquiera; se examina de lo que ha repetido cien veces.",
  "El objetivo de hoy no es dominar el temario, es no dejarlo para mañana.",
  "Los que aprueban el PIR también tienen días en los que no les apetece nada.",
  "Una autoevaluación floja también suma: te dice dónde mirar mañana.",
  "No estás en cero. Estás en el punto exacto donde te tocaba estar hoy.",
  "El duelo de esta noche no importa tanto como el examen de junio. Juega tranquilo.",
  "Estudiar cansado veinte minutos vale más que no estudiar nada por esperar sentirte mejor.",
  "La plaza no la gana quien memoriza más rápido, sino quien no deja de intentarlo.",
  "Vuelve a la pregunta que fallaste. Ahí está el examen, no en la que ya dominas.",
  "Un mal día de estudio no borra los cien buenos que ya llevas.",
  "Levanta la cabeza del cuaderno un momento: llevas más camino recorrido del que ves de cerca.",
  "El PIR se prepara con constancia aburrida, no con motivación bonita. Y hoy toca constancia.",
];

function Header({
  user, onLogout, miRacha, onAjustes,
  questions, onAddQuestion, onUpdateQuestion, onDeleteQuestion, favoritos, onToggleFavorito,
  rachas, onGirarRuleta, enLinea, preguntasProgreso,
}) {
  const [mostrarLogros, setMostrarLogros] = useState(false);
  const [mostrarRanking, setMostrarRanking] = useState(false);
  const [mostrarBanco, setMostrarBanco] = useState(false);
  const [mostrarRuleta, setMostrarRuleta] = useState(false);
  const [mostrarFrase, setMostrarFrase] = useState(false);
  const [frase, setFrase] = useState(null);
  const nuevaFrase = () => {
    setFrase((actual) => {
      const opciones = actual ? FRASES_MOTIVADORAS.filter((f) => f !== actual) : FRASES_MOTIVADORAS;
      return opciones[Math.floor(Math.random() * opciones.length)];
    });
    setMostrarFrase(true);
  };
  return (
    <header style={styles.header}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Compass size={20} color={ACENTO} strokeWidth={1.8} />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 19, color: TINTA, letterSpacing: 0.3 }}>AUTOPIR</span>
        {enLinea > 0 && (
          <span
            title={`${enLinea} ${enLinea === 1 ? "persona conectada" : "personas conectadas"} ahora mismo`}
            style={{
              display: "flex", alignItems: "center", gap: 5, marginLeft: 6,
              padding: "3px 9px", borderRadius: 999, border: `1px solid ${RAYA}`,
              fontSize: 12, color: TINTA_SUAVE,
            }}
          >
            <span style={{ position: "relative", width: 7, height: 7, display: "inline-flex" }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: CORRECTO, animation: "pulsoEnLinea 1.8s ease-out infinite" }} />
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: CORRECTO }} />
            </span>
            <Users size={12} />
            {enLinea}
          </span>
        )}
        <span
          title="Preguntas que has respondido en total"
          style={{
            display: "flex", alignItems: "center", gap: 5, marginLeft: 6,
            padding: "3px 9px", borderRadius: 999, border: `1px solid ${RAYA}`,
            fontSize: 12, color: TINTA_SUAVE,
          }}
        >
          <ListChecks size={12} />
          {(miRacha && miRacha.total_respondidas) || 0}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: TINTA_SUAVE, display: "flex", alignItems: "center", gap: 4 }}>
          <User size={14} /> {user.name}{user.isAdmin ? " · admin" : ""}
        </span>
        <div style={{ position: "relative" }}>
          <button type="button" onClick={() => setMostrarLogros((v) => !v)} style={styles.iconBtn} title="Logros">
            <Award size={15} color={mostrarLogros ? ORO : TINTA_SUAVE} />
          </button>
          {mostrarLogros && (
            <>
              <div style={styles.dropdownCatcher} onClick={() => setMostrarLogros(false)} />
              <div style={styles.logrosDropdown} onClick={(e) => e.stopPropagation()}>
                <Logros user={user} miRacha={miRacha} compact />
              </div>
            </>
          )}
        </div>
        <button type="button" onClick={() => setMostrarRanking(true)} style={styles.iconBtn} title="Ranking">
          <Trophy size={15} color={TINTA_SUAVE} />
        </button>
        <button type="button" onClick={() => setMostrarBanco(true)} style={styles.iconBtn} title="Banco de preguntas">
          <ListChecks size={15} color={TINTA_SUAVE} />
        </button>
        <div style={{ position: "relative" }}>
          <button type="button" onClick={() => setMostrarRuleta((v) => !v)} style={styles.iconBtn} title="Ruleta diaria">
            <Sparkles size={15} color={mostrarRuleta ? ORO : TINTA_SUAVE} />
          </button>
          {mostrarRuleta && (
            <>
              <div style={styles.dropdownCatcher} onClick={() => setMostrarRuleta(false)} />
              <div style={{ ...styles.logrosDropdown, width: 300 }} onClick={(e) => e.stopPropagation()}>
                <RuletaDiaria questions={questions} miRacha={miRacha} onGirarRuleta={onGirarRuleta} />
              </div>
            </>
          )}
        </div>
        <div style={{ position: "relative" }}>
          <button type="button" onClick={nuevaFrase} style={styles.iconBtn} title="Frase motivadora">
            <Lightbulb size={15} color={mostrarFrase ? ORO : TINTA_SUAVE} />
          </button>
          {mostrarFrase && (
            <>
              <div style={styles.dropdownCatcher} onClick={() => setMostrarFrase(false)} />
              <div style={{ ...styles.logrosDropdown, width: 320 }} onClick={(e) => e.stopPropagation()}>
                <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 21, lineHeight: 1.5, color: TINTA, margin: 0 }}>{frase}</p>
                <button type="button" onClick={nuevaFrase} style={{ ...styles.linkBtn, marginTop: 12 }}>
                  Otra frase
                </button>
              </div>
            </>
          )}
        </div>
        <button type="button" onClick={onAjustes} style={styles.iconBtn} title="Ajustes">
          <Settings size={15} color={TINTA_SUAVE} />
        </button>
        <button type="button" onClick={onLogout} style={styles.iconBtn} title="Salir">
          <LogOut size={15} color={TINTA_SUAVE} />
        </button>
      </div>
      {mostrarRanking && (
        <div style={styles.pantallaCompleta}>
          <div style={styles.pantallaCompletaCierre}>
            <button type="button" onClick={() => setMostrarRanking(false)} style={styles.iconBtn} title="Cerrar">
              <X size={20} color="#6E6A61" />
            </button>
          </div>
          <main style={styles.main}>
            <Ranking rachas={rachas} user={user} />
          </main>
        </div>
      )}
      {mostrarBanco && (
        <div style={styles.pantallaCompleta}>
          <div style={styles.pantallaCompletaCierre}>
            <button type="button" onClick={() => setMostrarBanco(false)} style={styles.iconBtn} title="Cerrar">
              <X size={20} color="#6E6A61" />
            </button>
          </div>
          <main style={styles.main}>
            <BancoPreguntas
              questions={questions}
              user={user}
              onAdd={onAddQuestion}
              onUpdate={onUpdateQuestion}
              onDelete={onDeleteQuestion}
              favoritos={favoritos}
              onToggleFavorito={onToggleFavorito}
              preguntasProgreso={preguntasProgreso}
            />
          </main>
        </div>
      )}
    </header>
  );
}

function Nav({ section, setSection, alerta }) {
  const items = [
    { id: "simulacros", label: "Autoevaluaciones", icon: Clock },
    { id: "duelo", label: "Duelo 1v1", icon: Zap },
    { id: "flashcards", label: "Flashcards", icon: Layers },
    { id: "perfil", label: "Mi perfil", icon: User },
  ];
  return (
    <nav style={styles.nav}>
      {items.map((it) => {
        const Icon = it.icon;
        const active = section === it.id;
        return (
          <button
            type="button"
            key={it.id}
            onClick={() => setSection(it.id)}
            style={{ ...styles.navBtn, color: active ? "#1E1C18" : "#9B9689", borderBottom: active ? `2px solid ${ACENTO}` : "2px solid transparent", position: "relative" }}
          >
            <Icon size={15} />
            <span>{it.label}</span>
            {it.id === "duelo" && alerta && (
              <span style={styles.navDot} />
            )}
          </button>
        );
      })}
    </nav>
  );
}

function Simulacros({ questions, user, onFinish, onStreakAnswer, onProgresoDiario, onFallo, onRespuestaPregunta, favoritos, onToggleFavorito, miRacha, preguntasProgreso, fallos }) {
  const [incluirInventadas, setIncluirInventadas] = useState(false);
  const base = useMemo(() => (incluirInventadas ? questions : questions.filter((q) => !q.inventada)), [questions, incluirInventadas]);
  const cursos = useMemo(() => {
    const examenes = [...new Set(base.filter((q) => esExamen(q.curso)).map((q) => q.curso))];
    examenes.sort((a, b) => (parseInt(b.match(/\d+/), 10) || 0) - (parseInt(a.match(/\d+/), 10) || 0));
    return ["Todos", ...examenes];
  }, [base]);
  const [curso, setCurso] = useState("Todos");

  // De dónde salen las preguntas. Hasta ahora solo se podía tirar al azar de
  // un examen, así que saber por "Dónde fallas" que vas flojo en un tema no
  // servía para practicarlo.
  const [origen, setOrigen] = useState("todas");
  const [tema, setTema] = useState("Todos");

  const acertadaPorId = useMemo(() => {
    const m = {};
    (preguntasProgreso || []).forEach((p) => { if (p.acertada) m[p.pregunta_id] = true; });
    return m;
  }, [preguntasProgreso]);
  const falladaPorId = useMemo(() => {
    const m = {};
    (fallos || []).forEach((f) => { if ((f.veces || 0) > 0) m[f.pregunta_id] = true; });
    return m;
  }, [fallos]);

  const temas = useMemo(() => {
    const nombres = [...new Set(
      base.map((q) => (q.tema || "").trim())
          .filter((t) => t && !TEMA_PLACEHOLDER.test(t))
    )].sort((a, b) => a.localeCompare(b, "es"));
    return ["Todos", ...nombres];
  }, [base]);

  // Un tema puede no existir en el examen elegido (y al revés): en cuanto la
  // combinación se queda sin preguntas, el contador lo canta y el botón se
  // desactiva, en vez de empezar una tirada vacía.
  const filtradas = useMemo(() => base.filter((q) => {
    if (curso !== "Todos" && q.curso !== curso) return false;
    if (tema !== "Todos" && (q.tema || "").trim() !== tema) return false;
    if (origen === "sinacertar" && acertadaPorId[q.id]) return false;
    if (origen === "fallos" && !falladaPorId[q.id]) return false;
    return true;
  }), [base, curso, tema, origen, acertadaPorId, falladaPorId]);
  const disponibles = filtradas.length;

  // Si al cambiar de filtro quedan menos preguntas de las pedidas, se ajusta
  // sola en vez de esperar a que el usuario vuelva al campo.
  useEffect(() => {
    setNumPreguntas((v) => (typeof v === "number" && v > disponibles ? Math.max(1, disponibles) : v));
  }, [disponibles]);
  const [numPreguntas, setNumPreguntas] = useState(10);
  const [state, setState] = useState("config");
  const [pool, setPool] = useState([]);
  const [poolOriginal, setPoolOriginal] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [resultados, setResultados] = useState({});
  const [primerIntento, setPrimerIntento] = useState(null);
  const [preguntaAbierta, setPreguntaAbierta] = useState(null);
  const [ronda, setRonda] = useState(1);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [relampago, setRelampago] = useState(false);
  const [rachaViva, setRachaViva] = useState(0);
  // El récord se congela al empezar la tirada: `miRacha.racha_record` se
  // actualiza en vivo (registrarAcierto lo sube en cuanto superas el anterior),
  // así que compararse contra él directamente daba siempre empate y el fueguito
  // no se encendía nunca.
  const [recordPrevio, setRecordPrevio] = useState(0);

  useEffect(() => {
    let timer;
    if (state === "running") {
      timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [state]);

  const start = () => {
    if (filtradas.length === 0) return;
    const cantidad = Math.max(1, Math.min(numPreguntas || 1, filtradas.length));
    const shuffled = [...filtradas].sort(() => Math.random() - 0.5).slice(0, cantidad);
    setPool(shuffled); setPoolOriginal(shuffled);
    setIdx(0); setAnswers([]); setSelected(null); setRevealed(false); setSeconds(0);
    setRonda(1); setResultados({}); setPrimerIntento(null); setPreguntaAbierta(null);
    setRelampago(false); setRachaViva(0);
    setState("running");
  };

  const startRelampago = () => {
    const examenes = questions.filter((q) => !q.inventada && esExamen(q.curso));
    if (examenes.length === 0) return;
    const shuffled = [...examenes].sort(() => Math.random() - 0.5);
    setPool(shuffled); setPoolOriginal(shuffled);
    setIdx(0); setAnswers([]); setSelected(null); setRevealed(false); setSeconds(0);
    setRonda(1); setResultados({}); setPrimerIntento(null); setPreguntaAbierta(null);
    setRelampago(true); setRachaViva(0);
    setRecordPrevio((miRacha && miRacha.racha_record) || 0);
    setState("running");
  };

  const elegir = (i, e) => {
    if (revealed) return;
    if (e && e.currentTarget) e.currentTarget.blur();
    setSelected(i);
    setRevealed(true);
    const q = pool[idx];
    const correcto = i === q.correcta;
    if (ronda === 1) {
      if (relampago) {
        onStreakAnswer(correcto);
        if (correcto) setRachaViva((v) => v + 1);
      }
      if (onProgresoDiario) onProgresoDiario(correcto);
      if (!correcto && onFallo) onFallo(q);
      if (onRespuestaPregunta) onRespuestaPregunta(q, correcto);
    }
  };

  const next = async () => {
    if (submitting) return;
    const current = pool[idx];
    const correct = selected === current.correcta;
    const nextAnswers = [...answers, { qId: current.id, pregunta: current, selected, correct }];
    setAnswers(nextAnswers); setSelected(null); setRevealed(false);

    if (relampago) {
      const completo = correct && idx + 1 === pool.length;
      if (!correct || completo) {
        const nuevosResultados = {};
        nextAnswers.forEach((a) => { nuevosResultados[a.qId] = a; });
        setResultados(nuevosResultados);
        setPoolOriginal(nextAnswers.map((a) => a.pregunta));
        const correctCount = nextAnswers.filter((a) => a.correct).length;
        const total = nextAnswers.length;
        const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
        setPrimerIntento({ correctCount, total, completo });
        setSubmitting(true);
        try {
          await onFinish({ name: user.name, score: correctCount, total, pct, seconds, date: new Date().toISOString() });
        } catch {}
        setSubmitting(false);
        setState("done");
        return;
      }
      setIdx(idx + 1);
      return;
    }

    if (idx + 1 < pool.length) {
      setIdx(idx + 1);
      return;
    }

    const nuevosResultados = { ...resultados };
    nextAnswers.forEach((a) => { nuevosResultados[a.qId] = a; });
    setResultados(nuevosResultados);

    if (ronda === 1) {
      setPrimerIntento({ correctCount: nextAnswers.filter((a) => a.correct).length, total: nextAnswers.length });
    }

    const falladas = nextAnswers.filter((a) => !a.correct).map((a) => a.pregunta);
    if (falladas.length > 0) {
      setPool(falladas);
      setIdx(0);
      setAnswers([]);
      setRonda((r) => r + 1);
      return;
    }

    setState("done");
  };

  if (questions.length === 0) {
    return (
      <div>
        <SectionTitle title="Autoevaluaciones" subtitle="Todavía no hay preguntas en el banco." />
        <Card style={{ textAlign: "center", color: "#9B9689", padding: "28px 16px" }}>
          Añade preguntas desde "Banco de preguntas" para poder hacer una autoevaluación.
        </Card>
      </div>
    );
  }

  if (state === "config") {
    return (
      <div>
        <SectionTitle title="Autoevaluaciones" subtitle="Elige de dónde salen las preguntas y cuántas quieres." />
        <Card>
          <FieldLabel>Qué preguntas</FieldLabel>
          <div style={styles.tabsOrigen}>
            {[
              { id: "todas", texto: "Todas" },
              { id: "sinacertar", texto: "Sin acertar" },
              { id: "fallos", texto: "Falladas" },
            ].map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOrigen(o.id)}
                style={{ ...styles.tabOrigenBtn, ...(origen === o.id ? styles.tabOrigenActivo : {}) }}
              >
                {o.texto}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: TINTA_TENUE, margin: "0 0 16px", lineHeight: 1.5 }}>
            {origen === "sinacertar"
              ? "Las que nunca has llegado a acertar, incluidas las que no has visto todavía."
              : origen === "fallos"
              ? "Solo las que has fallado alguna vez, las hayas acertado después o no."
              : "Todo el banco del examen y el tema que elijas debajo."}
          </p>
          <FieldLabel>Examen</FieldLabel>
          <select value={curso} onChange={(e) => setCurso(e.target.value)} style={styles.select}>
            {cursos.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <FieldLabel style={{ marginTop: 16 }}>Tema</FieldLabel>
          <select value={tema} onChange={(e) => setTema(e.target.value)} style={styles.select}>
            {temas.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
          <FieldLabel style={{ marginTop: 16 }}>Cantidad de preguntas (disponibles: {disponibles})</FieldLabel>
          <input
            type="number"
            min={1}
            max={disponibles}
            value={numPreguntas}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setNumPreguntas(Number.isNaN(v) ? "" : v);
            }}
            onBlur={() => setNumPreguntas((v) => Math.max(1, Math.min(v || 1, disponibles)))}
            style={styles.input}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontSize: 13, color: "#6E6A61", cursor: "pointer" }}>
            <input type="checkbox" checked={incluirInventadas} onChange={(e) => setIncluirInventadas(e.target.checked)} />
            Incluir preguntas inventadas por IA
          </label>
          {disponibles === 0 && (
            <p style={{ fontSize: 13, color: ACENTO, margin: "16px 0 0", lineHeight: 1.5 }}>
              No queda ninguna pregunta con esos filtros. Prueba con otro examen o tema, o vuelve a "Todas".
            </p>
          )}
          <button
            type="button"
            onClick={start}
            disabled={disponibles === 0}
            style={{ ...styles.btnPrimary, width: "100%", marginTop: 22, opacity: disponibles === 0 ? 0.5 : 1 }}
          >
            Empezar autoevaluación
          </button>
          <button
            type="button"
            onClick={startRelampago}
            disabled={questions.filter((q) => !q.inventada && esExamen(q.curso)).length === 0}
            style={{ ...styles.btnSecondary, width: "100%", marginTop: 10, justifyContent: "center", borderColor: "#C89B3C", color: "#9C7A2C" }}
          >
            <Zap size={14} style={{ marginRight: 6 }} /> Modo relámpago (preguntas de todos los exámenes, hasta que falles)
          </button>
        </Card>
      </div>
    );
  }

  if (state === "running") {
    const q = pool[idx];
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    const esCorrecta = selected === q.correcta;
    return (
      <div>
        <style>{`
          @keyframes acertarPulso {
            0% { box-shadow: 0 0 0 0 rgba(76,175,80,0.55); }
            70% { box-shadow: 0 0 0 10px rgba(76,175,80,0); }
            100% { box-shadow: 0 0 0 0 rgba(76,175,80,0); }
          }
          .acierto-anim { animation: acertarPulso 0.6s ease-out; }
        `}</style>
        <div style={styles.runHeader}>
          <span style={{ fontSize: 13, color: relampago ? "#9C7A2C" : "#6E6A61", fontWeight: relampago ? 700 : 400, display: "flex", alignItems: "center", gap: 4 }}>
            {relampago && <Zap size={13} color="#C89B3C" />}
            {relampago ? "Modo relámpago · " : (ronda > 1 ? `Repaso de falladas (ronda ${ronda}) · ` : "")}Pregunta {idx + 1} de {pool.length}
          </span>
          <span style={{ fontSize: 13, color: "#6E6A61", fontWeight: relampago ? 700 : 400, display: "flex", alignItems: "center", gap: 8 }}>
            {relampago && (
              <span style={{ display: "flex", alignItems: "center", gap: 3 }} title={rachaViva > recordPrevio ? "¡Nuevo récord!" : `Récord: ${recordPrevio}`}>
                <Flame
                  size={13}
                  color={rachaViva > recordPrevio ? "#E8672B" : "#C9C5B7"}
                  fill={rachaViva > recordPrevio ? "#E8672B" : "none"}
                  style={rachaViva > recordPrevio ? { filter: "drop-shadow(0 0 3px rgba(232,103,43,.7))" } : undefined}
                />
                <span style={{ color: rachaViva > recordPrevio ? "#E8672B" : "#9B9689", fontWeight: 700 }}>{rachaViva}</span>
              </span>
            )}
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={13} /> {mm}:{ss}</span>
          </span>
        </div>
        <div style={styles.progressTrack}><div style={{ ...styles.progressFill, width: `${(idx / pool.length) * 100}%` }} /></div>
        <Card style={{ marginTop: 16, ...styles.daypoCard }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: TINTA_SUAVE, fontFamily: "Arial, Helvetica, sans-serif" }}>{q.curso} · {q.tema}</div>
            {onToggleFavorito && <FavoritoBtn pregunta={q} favoritos={favoritos} onToggle={onToggleFavorito} />}
          </div>
          <p style={styles.daypoPregunta}>{q.pregunta}</p>
          {q.opciones.map((op, i) => {
            const letra = String.fromCharCode(65 + i);
            let estilo = { ...styles.daypoOpcion };
            let claseExtra = "";
            if (revealed) {
              if (i === q.correcta) { estilo = { ...estilo, ...styles.daypoOpcionCorrecta }; claseExtra = "acierto-anim"; }
              else if (i === selected) estilo = { ...estilo, ...styles.daypoOpcionIncorrecta };
            }
            return (
              <button type="button" key={`${ronda}-${q.id}-${i}`} className={claseExtra} onClick={(e) => elegir(i, e)} disabled={revealed} style={estilo}>
                <span style={styles.daypoLetra}>{letra}</span>
                <span style={{ flex: 1 }}>{op}</span>
                {revealed && i === q.correcta && <Check size={18} color={CORRECTO} />}
                {revealed && i === selected && i !== q.correcta && <X size={18} color="#A6362B" />}
              </button>
            );
          })}
          {revealed && (
            <div style={{ ...styles.daypoFeedback, ...(esCorrecta ? styles.daypoFeedbackOk : styles.daypoFeedbackMal) }}>
              {esCorrecta ? "¡Correcto!" : `Incorrecto. La respuesta correcta es la ${String.fromCharCode(65 + q.correcta)}.`}
              {relampago && !esCorrecta && <div style={{ marginTop: 6, fontWeight: 700 }}>La racha del modo relámpago termina aquí.</div>}
              {q.explicacion && <div style={{ marginTop: 6, fontWeight: 400 }}>{q.explicacion}</div>}
            </div>
          )}
          <button type="button" onClick={next} disabled={!revealed} style={{ ...styles.btnPrimary, width: "100%", marginTop: 18, opacity: !revealed ? 0.4 : 1 }}>
            {(idx + 1 === pool.length || (relampago && revealed && !esCorrecta)) ? "Terminar" : "Siguiente"}
          </button>
        </Card>
      </div>
    );
  }

  const total = poolOriginal.length;
  const aciertosPrimeraVuelta = primerIntento ? primerIntento.correctCount : total;
  const pctPrimeraVuelta = total > 0 ? Math.round((aciertosPrimeraVuelta / total) * 100) : 0;
  const abierta = preguntaAbierta != null ? resultados[preguntaAbierta] : null;
  const relampagoCompleto = relampago && primerIntento && primerIntento.completo;
  return (
    <div>
      <SectionTitle title={relampago ? (relampagoCompleto ? "¡Racha perfecta!" : "Racha terminada") : "Autoevaluación completada"} />
      <Card style={{ textAlign: "center", padding: "28px 20px" }}>
        {relampago
          ? <Zap size={26} color="#C89B3C" style={{ marginBottom: 10 }} />
          : <Flag size={26} color={CORRECTO} style={{ marginBottom: 10 }} />}
        <div style={{ color: "#1E1C18", fontSize: 16 }}>
          {relampago
            ? (relampagoCompleto
                ? `¡Has respondido bien las ${total} preguntas de todos los exámenes sin fallar ninguna!`
                : `Acertaste ${aciertosPrimeraVuelta} de ${total} antes de fallar.`)
            : `Has respondido correctamente las ${total} preguntas.`}
        </div>
        <div style={{ color: "#9B9689", fontSize: 13, marginTop: 6 }}>
          {relampago ? "" : `${aciertosPrimeraVuelta} de ${total} a la primera (${pctPrimeraVuelta}%) · `}{Math.floor(seconds / 60)} min {seconds % 60}s
        </div>
      </Card>
      <div style={{ marginTop: 20 }}>
        <FieldLabel>Toca una pregunta para repasarla</FieldLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {poolOriginal.map((q, i) => {
            const correcta = resultados[q.id] ? resultados[q.id].correct : true;
            const color = correcta ? CORRECTO : ACENTO;
            const colorSuave = correcta ? CORRECTO_SUAVE : ACENTO_SUAVE;
            return (
              <button
                type="button"
                key={q.id}
                onClick={() => setPreguntaAbierta(preguntaAbierta === q.id ? null : q.id)}
                style={{
                  ...styles.cuadroPregunta,
                  borderColor: preguntaAbierta === q.id ? "#1E1C18" : color,
                  background: preguntaAbierta === q.id ? "#1E1C18" : colorSuave,
                  color: preguntaAbierta === q.id ? "#fff" : color,
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        {abierta && (
          <Card style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: TINTA_SUAVE }}>{abierta.pregunta.curso} · {abierta.pregunta.tema}</div>
              {onToggleFavorito && (
                <FavoritoBtn pregunta={abierta.pregunta} favoritos={favoritos} onToggle={onToggleFavorito} />
              )}
            </div>
            <p style={{ fontSize: 15, color: "#1E1C18", lineHeight: 1.5, marginBottom: 14 }}>{abierta.pregunta.pregunta}</p>
            {abierta.pregunta.opciones.map((op, i) => (
              <div key={i} style={{ ...styles.opcion, cursor: "default", ...(i === abierta.pregunta.correcta ? styles.opcionCorrectaLegacy : {}) }}>
                {i === abierta.pregunta.correcta && <Check size={13} color={CORRECTO} />}
                {op}
              </div>
            ))}
            {abierta.pregunta.explicacion && <p style={{ fontSize: 13, color: "#6E6A61", marginTop: 10, lineHeight: 1.5 }}>{abierta.pregunta.explicacion}</p>}
          </Card>
        )}
      </div>
      <button type="button" onClick={() => setState("config")} style={{ ...styles.btnPrimary, width: "100%", marginTop: 20 }}>
        Finalizar
      </button>
    </div>
  );
}

function BancoPreguntas({ questions, user, onAdd, onUpdate, onDelete, favoritos, onToggleFavorito, preguntasProgreso }) {
  const [origen, setOrigen] = useState("reales"); // "reales" | "pendientes"
  const [showForm, setShowForm] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const progresoPorId = useMemo(() => {
    const m = {};
    (preguntasProgreso || []).forEach((p) => { m[p.pregunta_id] = p; });
    return m;
  }, [preguntasProgreso]);

  const preguntasReales = useMemo(() => questions.filter((q) => !q.inventada), [questions]);
  const totalReales = preguntasReales.length;
  const hechasReales = useMemo(
    () => preguntasReales.filter((q) => progresoPorId[q.id] && progresoPorId[q.id].acertada).length,
    [preguntasReales, progresoPorId]
  );
  const pendientes = useMemo(
    () => preguntasReales.filter((q) => !progresoPorId[q.id] || !progresoPorId[q.id].veces),
    [preguntasReales, progresoPorId]
  );

  const porOrigen = origen === "pendientes" ? pendientes : preguntasReales;
  const cursos = useMemo(() => [...new Set(porOrigen.map((q) => q.curso))], [porOrigen]);
  const termino = busqueda.trim().toLowerCase();
  const filtered = termino
    ? porOrigen.filter((q) =>
        q.pregunta.toLowerCase().includes(termino) ||
        (q.opciones || []).some((o) => o.toLowerCase().includes(termino)) ||
        (q.explicacion || "").toLowerCase().includes(termino) ||
        (q.tema || "").toLowerCase().includes(termino)
      )
    : porOrigen;

  const cambiarOrigen = (o) => { setOrigen(o); setBusqueda(""); };

  return (
    <div>
      <SectionTitle
        title="Banco de preguntas"
        subtitle={`${hechasReales}/${totalReales} preguntas reales hechas con éxito`}
        action={origen === "reales" && (
          <button type="button" onClick={() => setShowForm((s) => !s)} style={styles.btnSecondary}>
            <Plus size={14} style={{ marginRight: 4 }} /> Añadir
          </button>
        )}
      />

      <div style={styles.tabsOrigen}>
        <button
          type="button"
          onClick={() => cambiarOrigen("reales")}
          style={{ ...styles.tabOrigenBtn, ...(origen === "reales" ? styles.tabOrigenActivo : {}) }}
        >
          Reales ({totalReales})
        </button>
        <button
          type="button"
          onClick={() => cambiarOrigen("pendientes")}
          style={{ ...styles.tabOrigenBtn, ...(origen === "pendientes" ? styles.tabOrigenActivoIA : {}) }}
        >
          <Eye size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} /> Pendientes ({pendientes.length})
        </button>
      </div>

      {origen === "reales" && showForm && (
        <NuevaPregunta onAdd={(q) => { onAdd(q); setShowForm(false); }} cursos={cursos} />
      )}

      {porOrigen.length > 0 && (
        <div style={{ position: "relative", marginTop: 14, marginBottom: 16 }}>
          <Search size={16} color="#9B9689" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Busca una palabra o frase dentro de las preguntas..."
            style={{ ...styles.input, paddingLeft: 38 }}
          />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <X size={15} color="#9B9689" />
            </button>
          )}
        </div>
      )}
      {termino && filtered.length === 0 && (
        <p style={{ fontSize: 13.5, color: "#9B9689", padding: "8px 0" }}>Ninguna pregunta contiene "{busqueda.trim()}".</p>
      )}
      {filtered.map((q) => (
        <PreguntaCard key={q.id} q={q} isAdmin={user.isAdmin} onUpdate={onUpdate} onDelete={onDelete} favoritos={favoritos} onToggleFavorito={onToggleFavorito} progreso={progresoPorId[q.id]} />
      ))}
    </div>
  );
}

function GenerarPreguntasIA({ user, onGuardar }) {
  const [curso, setCurso] = useState("");
  const [tema, setTema] = useState("");
  const [instruccion, setInstruccion] = useState("");
  const [cantidad, setCantidad] = useState(3);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [generadas, setGeneradas] = useState([]);
  const [guardadas, setGuardadas] = useState({});
  const [restantesHoy, setRestantesHoy] = useState(null);

  const temasDelCurso = TEMARIO.find((c) => c.curso === curso)?.temas || [];

  const generar = async () => {
    const texto = instruccion.trim();
    if ((!texto && !tema) || cargando) return;
    setCargando(true);
    setError(null);
    setGeneradas([]);
    setGuardadas({});
    try {
      const resp = await fetch("/api/generar-preguntas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: user.name, instruccion: texto, cantidad, curso, tema }),
      });
      const datos = await resp.json();
      if (!resp.ok) throw new Error(datos.error || "No se pudieron generar las preguntas.");
      setGeneradas(datos.preguntas.map((p) => ({ ...p, inventada: true })));
      if (typeof datos.restantesHoy === "number") setRestantesHoy(datos.restantesHoy);
    } catch (err) {
      setError(err.message || "No se pudieron generar las preguntas.");
    } finally {
      setCargando(false);
    }
  };

  const guardar = async (i) => {
    if (!onGuardar) return;
    const ok = await onGuardar(generadas[i]);
    if (ok) setGuardadas((prev) => ({ ...prev, [i]: true }));
  };

  const guardarTodas = async () => {
    for (let i = 0; i < generadas.length; i++) {
      if (!guardadas[i]) await guardar(i);
    }
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <Sparkles size={16} color="#8A5A9E" />
        <span style={{ fontSize: 15, color: "#1E1C18", fontFamily: "var(--font-display)" }}>Pídele preguntas a la IA</span>
      </div>
      <p style={{ fontSize: 12.5, color: "#9B9689", marginTop: 0, marginBottom: 12 }}>
        {restantesHoy === null ? `Hasta 10 preguntas personalizadas al día.` : `Te quedan ${restantesHoy} pregunta${restantesHoy === 1 ? "" : "s"} personalizada${restantesHoy === 1 ? "" : "s"} hoy.`}
      </p>
      <FieldLabel>Curso (opcional, para basarse en el temario real)</FieldLabel>
      <select value={curso} onChange={(e) => { setCurso(e.target.value); setTema(""); }} style={styles.select}>
        <option value="">Sin curso concreto</option>
        {TEMARIO.map((c) => (<option key={c.curso} value={c.curso}>{c.curso}</option>))}
      </select>
      {curso && (
        <>
          <FieldLabel style={{ marginTop: 12 }}>Tema</FieldLabel>
          <select value={tema} onChange={(e) => setTema(e.target.value)} style={styles.select}>
            <option value="">Elige un tema</option>
            {temasDelCurso.map((t) => (<option key={t.nombre} value={t.nombre}>{t.nombre}</option>))}
          </select>
        </>
      )}
      <FieldLabel style={{ marginTop: 12 }}>{tema ? "Algo más concreto (opcional)" : "¿Sobre qué quieres las preguntas?"}</FieldLabel>
      <textarea
        value={instruccion}
        onChange={(e) => setInstruccion(e.target.value)}
        placeholder={tema ? 'Ej: "céntrate en el diagnóstico diferencial"' : 'Ej: "3 preguntas sobre autores de psicología clínica"'}
        style={{ ...styles.input, minHeight: 60 }}
      />
      <FieldLabel style={{ marginTop: 12 }}>Cuántas (máx. 10)</FieldLabel>
      <input
        type="number"
        min={1}
        max={10}
        value={cantidad}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          setCantidad(Number.isNaN(v) ? "" : v);
        }}
        onBlur={() => setCantidad((v) => Math.max(1, Math.min(10, v || 1)))}
        style={{ ...styles.input, maxWidth: 100 }}
      />
      <button type="button" onClick={generar} disabled={cargando} style={{ ...styles.btnPrimary, width: "100%", marginTop: 14, opacity: cargando ? 0.6 : 1 }}>
        {cargando ? <Loader2 className="animate-spin" size={15} /> : "Generar"}
      </button>
      {error && <p style={{ color: "#A6362B", fontSize: 13, marginTop: 10 }}>{error}</p>}

      {generadas.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <FieldLabel style={{ margin: 0 }}>{onGuardar ? "Responde y guarda las que quieras" : "Responde para practicar"}</FieldLabel>
            {onGuardar && <button type="button" onClick={guardarTodas} style={styles.btnSecondary}>Guardar todas</button>}
          </div>
          {generadas.map((p, i) => (
            <PreguntaGeneradaCard
              key={i}
              p={p}
              guardada={!!guardadas[i]}
              onGuardar={onGuardar ? () => guardar(i) : null}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function PreguntaGeneradaCard({ p, guardada, onGuardar }) {
  const [selected, setSelected] = useState(null);
  const revealed = selected !== null;
  return (
    <Card style={{ marginBottom: 10, borderLeft: "3px solid #8A5A9E" }}>
      <div style={{ fontSize: 11, color: "#8A5A9E", marginBottom: 4 }}>{p.curso} · {p.tema}</div>
      <div style={{ fontSize: 14, color: "#1E1C18", marginBottom: 8 }}>{p.pregunta}</div>
      {p.opciones.map((op, oi) => {
        let estilo = { ...styles.opcion };
        if (revealed) {
          if (oi === p.correcta) estilo = { ...estilo, ...styles.opcionCorrectaLegacy };
          else if (oi === selected) estilo = { ...estilo, borderColor: "#A6362B", background: "#FBEDEA" };
        }
        return (
          <button type="button" key={oi} onClick={() => !revealed && setSelected(oi)} disabled={revealed} style={{ ...estilo, cursor: revealed ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            {revealed && oi === p.correcta && <Check size={13} color={CORRECTO} />}
            {revealed && oi === selected && oi !== p.correcta && <X size={13} color="#A6362B" />}
            {op}
          </button>
        );
      })}
      {revealed && p.explicacion && <p style={{ fontSize: 13, color: "#6E6A61", marginTop: 8 }}>{p.explicacion}</p>}
      {onGuardar && (
        <button
          type="button"
          onClick={onGuardar}
          disabled={guardada}
          style={{ ...styles.btnSecondary, marginTop: 10, ...(guardada ? { opacity: 0.6 } : {}) }}
        >
          {guardada ? <><Check size={13} style={{ marginRight: 4 }} /> Guardada</> : "Guardar en el banco"}
        </button>
      )}
    </Card>
  );
}

// Ojo + número: cuántas veces se ha respondido esta pregunta concreta (en
// Autoevaluaciones o Duelo), para poder llevar el control de cuáles del
// banco ya se han hecho. Gris si nunca se ha respondido, tinta si se ha
// respondido pero nunca acertado, verde si ya se acertó alguna vez.
function ProgresoPreguntaBadge({ progreso }) {
  const veces = progreso ? progreso.veces : 0;
  const acertada = !!(progreso && progreso.acertada);
  const color = veces === 0 ? "#B7BEC8" : acertada ? CORRECTO : TINTA_SUAVE;
  const titulo = veces === 0
    ? "Todavía no la has respondido"
    : `La has respondido ${veces} ${veces === 1 ? "vez" : "veces"}${acertada ? " · acertada" : ""}`;
  return (
    <span title={titulo} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11.5, fontWeight: 600, color, flexShrink: 0, padding: "4px 2px" }}>
      <Eye size={14} />
      {veces}
    </span>
  );
}

function FavoritoBtn({ pregunta, favoritos, onToggle, size = 16 }) {
  const esFavorita = favoritos && favoritos.some((f) => f.pregunta_id === pregunta.id);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(pregunta); }}
      style={{ ...styles.iconBtn, padding: 4, flexShrink: 0 }}
      title={esFavorita ? "Quitar de favoritas" : "Guardar como favorita"}
    >
      <Star size={size} color={esFavorita ? "#C89B3C" : "#B7BEC8"} fill={esFavorita ? "#C89B3C" : "none"} />
    </button>
  );
}

function PreguntaCard({ q, isAdmin, onUpdate, onDelete, favoritos, onToggleFavorito, progreso }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mostrarCorrecta, setMostrarCorrecta] = useState(false);
  const toggleOpen = () => { setOpen((o) => !o); setMostrarCorrecta(false); };

  if (editing) {
    return (
      <EditarPregunta
        q={q}
        onCancel={() => setEditing(false)}
        onSave={async (updated) => {
          const ok = await onUpdate(q.id, updated);
          if (ok) setEditing(false);
        }}
      />
    );
  }

  return (
    <Card style={{ marginBottom: 10, ...(q.inventada ? { borderLeft: "3px solid #8A5A9E" } : {}) }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <button type="button" onClick={toggleOpen} style={{ ...styles.expandBtn, flex: 1 }}>
          <div style={{ textAlign: "left", flex: 1 }}>
            <div style={{ fontSize: 11, color: q.inventada ? "#8A5A9E" : TINTA_SUAVE, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              {q.inventada && <Sparkles size={11} />}
              {q.curso} · {q.tema}
            </div>
            <div style={{ fontSize: 14, color: "#1E1C18", lineHeight: 1.4 }}>{q.pregunta}</div>
          </div>
          {open ? <ChevronDown size={16} color="#9B9689" /> : <ChevronRight size={16} color="#9B9689" />}
        </button>
        <ProgresoPreguntaBadge progreso={progreso} />
        {onToggleFavorito && <FavoritoBtn pregunta={q} favoritos={favoritos} onToggle={onToggleFavorito} />}
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          {q.opciones.map((op, i) => (
            <div key={i} style={{ ...styles.opcion, cursor: "default", ...(mostrarCorrecta && i === q.correcta ? styles.opcionCorrectaLegacy : {}) }}>
              {mostrarCorrecta && i === q.correcta && <Check size={13} color={CORRECTO} />}
              {op}
            </div>
          ))}
          {!mostrarCorrecta ? (
            <button type="button" onClick={() => setMostrarCorrecta(true)} style={{ ...styles.btnSecondary, width: "100%", justifyContent: "center", marginTop: 10 }}>
              Ver respuesta correcta
            </button>
          ) : (
            q.explicacion && <p style={{ fontSize: 13, color: "#6E6A61", marginTop: 10, lineHeight: 1.5 }}>{q.explicacion}</p>
          )}
          {isAdmin && (
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => setEditing(true)} style={styles.btnSecondary}>
                <Pencil size={13} style={{ marginRight: 4 }} /> Editar
              </button>
              {!deleting ? (
                <button type="button" onClick={() => setDeleting(true)} style={{ ...styles.btnSecondary, color: "#A6362B", borderColor: "#A6362B" }}>
                  <Trash2 size={13} style={{ marginRight: 4 }} /> Borrar
                </button>
              ) : (
                <>
                  <span style={{ fontSize: 12, color: "#A6362B", alignSelf: "center" }}>¿Seguro?</span>
                  <button type="button" onClick={() => onDelete(q.id)} style={{ ...styles.btnSecondary, color: "#fff", background: "#A6362B", borderColor: "#A6362B" }}>Sí, borrar</button>
                  <button type="button" onClick={() => setDeleting(false)} style={styles.btnSecondary}>Cancelar</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function NuevaPregunta({ onAdd, cursos }) {
  const [curso, setCurso] = useState(cursos[0] || "");
  const [tema, setTema] = useState("");
  const [pregunta, setPregunta] = useState("");
  const [opciones, setOpciones] = useState(["", "", "", ""]);
  const [correcta, setCorrecta] = useState(0);
  const [explicacion, setExplicacion] = useState("");

  const submit = () => {
    if (!pregunta.trim() || opciones.some((o) => !o.trim()) || !tema.trim()) return;
    onAdd({ curso, tema, pregunta, opciones, correcta, explicacion: explicacion || null });
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <FieldLabel>Curso</FieldLabel>
      <input value={curso} onChange={(e) => setCurso(e.target.value)} style={styles.input} placeholder="Ej: Psicopatología" />
      <FieldLabel style={{ marginTop: 12 }}>Tema</FieldLabel>
      <input value={tema} onChange={(e) => setTema(e.target.value)} style={styles.input} placeholder="Ej: Trastornos de ansiedad" />
      <FieldLabel style={{ marginTop: 12 }}>Pregunta</FieldLabel>
      <textarea value={pregunta} onChange={(e) => setPregunta(e.target.value)} style={{ ...styles.input, minHeight: 60 }} />
      <FieldLabel style={{ marginTop: 12 }}>Opciones (marca la correcta)</FieldLabel>
      {opciones.map((op, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <input type="radio" checked={correcta === i} onChange={() => setCorrecta(i)} />
          <input value={op} onChange={(e) => { const next = [...opciones]; next[i] = e.target.value; setOpciones(next); }} style={{ ...styles.input, flex: 1 }} placeholder={`Opción ${i + 1}`} />
        </div>
      ))}
      <FieldLabel style={{ marginTop: 8 }}>Explicación (opcional)</FieldLabel>
      <textarea value={explicacion} onChange={(e) => setExplicacion(e.target.value)} style={{ ...styles.input, minHeight: 44 }} />
      <button type="button" onClick={submit} style={{ ...styles.btnPrimary, width: "100%", marginTop: 14 }}>Guardar pregunta</button>
    </Card>
  );
}

function EditarPregunta({ q, onSave, onCancel }) {
  const [curso, setCurso] = useState(q.curso);
  const [tema, setTema] = useState(q.tema);
  const [pregunta, setPregunta] = useState(q.pregunta);
  const [opciones, setOpciones] = useState([...q.opciones]);
  const [correcta, setCorrecta] = useState(q.correcta);
  const [explicacion, setExplicacion] = useState(q.explicacion || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!pregunta.trim() || opciones.some((o) => !o.trim()) || !tema.trim()) return;
    setSaving(true);
    await onSave({ curso, tema, pregunta, opciones, correcta, explicacion: explicacion || null });
    setSaving(false);
  };

  return (
    <Card style={{ marginBottom: 10, borderLeft: "3px solid #C89B3C" }}>
      <FieldLabel>Curso</FieldLabel>
      <input value={curso} onChange={(e) => setCurso(e.target.value)} style={styles.input} />
      <FieldLabel style={{ marginTop: 12 }}>Tema</FieldLabel>
      <input value={tema} onChange={(e) => setTema(e.target.value)} style={styles.input} />
      <FieldLabel style={{ marginTop: 12 }}>Pregunta</FieldLabel>
      <textarea value={pregunta} onChange={(e) => setPregunta(e.target.value)} style={{ ...styles.input, minHeight: 60 }} />
      <FieldLabel style={{ marginTop: 12 }}>Opciones (marca la correcta)</FieldLabel>
      {opciones.map((op, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <input type="radio" checked={correcta === i} onChange={() => setCorrecta(i)} />
          <input value={op} onChange={(e) => { const next = [...opciones]; next[i] = e.target.value; setOpciones(next); }} style={{ ...styles.input, flex: 1 }} />
        </div>
      ))}
      <FieldLabel style={{ marginTop: 8 }}>Explicación (opcional)</FieldLabel>
      <textarea value={explicacion} onChange={(e) => setExplicacion(e.target.value)} style={{ ...styles.input, minHeight: 44 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="button" onClick={submit} disabled={saving} style={{ ...styles.btnPrimary, flex: 1 }}>{saving ? "Guardando..." : "Guardar cambios"}</button>
        <button type="button" onClick={onCancel} style={styles.btnSecondary}>Cancelar</button>
      </div>
    </Card>
  );
}

const DURACION_PREGUNTA = 60;
const PAUSA_REVELACION = 5;
const PREGUNTAS_POR_DUELO = 200;
const DUELO_ESPERA_MAX_MS = 30 * 1000;

function Duelo({ user, questions, onDueloEnd, onProgresoDiario, onRespuestaPregunta, autoUnirse, onAutoUnirseConsumido }) {
  const questionsReales = useMemo(() => questions.filter((q) => !q.inventada), [questions]);
  const [fase, setFase] = useState("lobby");
  const [duelo, setDuelo] = useState(null);
  const [preguntasDuelo, setPreguntasDuelo] = useState([]);
  const [miRespuesta, setMiRespuesta] = useState(null);
  const [respuestasTodas, setRespuestasTodas] = useState({});
  const [tiempoRestante, setTiempoRestante] = useState(DURACION_PREGUNTA);
  const [cuentaRevelacion, setCuentaRevelacion] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [mostrarChoque, setMostrarChoque] = useState(false);
  const [mostrarCelebracion, setMostrarCelebracion] = useState(false);
  const duelRef = useRef(null);
  const avanzadoRef = useRef(null);
  const streakRegistradaRef = useRef(null);
  const choqueMostradoRef = useRef(null);
  const celebracionMostradaRef = useRef(null);

  useEffect(() => { duelRef.current = duelo; }, [duelo]);

  // Choque de espadas al arrancar el duelo: solo la primera vez que este
  // duelo concreto entra en "jugando" con la pregunta 0 (no al reconectar
  // a mitad de partida ni al pasar de pregunta en pregunta).
  useEffect(() => {
    if (fase === "jugando" && duelo && duelo.indice === 0 && choqueMostradoRef.current !== duelo.id) {
      choqueMostradoRef.current = duelo.id;
      setMostrarChoque(true);
      const t = setTimeout(() => setMostrarChoque(false), 1100);
      return () => clearTimeout(t);
    }
  }, [fase, duelo && duelo.id, duelo && duelo.indice]);

  // Confeti (ganas) o lluvia de emoticonos llorando (pierdes) a pantalla
  // completa al terminar, una sola vez por duelo; no se muestra en empate.
  useEffect(() => {
    if (fase === "terminado" && duelo && celebracionMostradaRef.current !== duelo.id) {
      celebracionMostradaRef.current = duelo.id;
      if (duelo.ganador) {
        setMostrarCelebracion(true);
        const t = setTimeout(() => setMostrarCelebracion(false), 2600);
        return () => clearTimeout(t);
      }
    }
  }, [fase, duelo && duelo.id, duelo && duelo.ganador]);

  useEffect(() => {
    return () => {
      const actual = duelRef.current;
      if (actual && actual.estado === "esperando" && actual.jugador1 === user.name) {
        supabase.from("duelos").delete().eq("id", actual.id).eq("estado", "esperando");
      }
    };
  }, [user.name]);

  const soyJugador1 = duelo && user.name === duelo.jugador1;
  const miClave = soyJugador1 ? "jugador1" : "jugador2";
  const oponenteNombre = duelo ? (soyJugador1 ? duelo.jugador2 : duelo.jugador1) : null;
  const respuestas = (duelo && respuestasTodas[duelo.indice]) || {};

  useEffect(() => {
    if (!duelo || !duelo.id) return;
    const channel = supabase
      .channel(`duelo-${duelo.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "duelos", filter: `id=eq.${duelo.id}` }, (payload) => {
        setDuelo(payload.new);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "duelo_respuestas", filter: `duelo_id=eq.${duelo.id}` }, (payload) => {
        const r = payload.new;
        const actual = duelRef.current;
        const key = actual && r.jugador === actual.jugador1 ? "jugador1" : "jugador2";
        setRespuestasTodas((prev) => ({
          ...prev,
          [r.indice]: { ...(prev[r.indice] || {}), [key]: r.opcion },
        }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelo && duelo.id]);

  useEffect(() => {
    if (!duelo) return;
    setMiRespuesta(null);
    setTiempoRestante(DURACION_PREGUNTA);
    avanzadoRef.current = null;
    if (duelo.estado === "jugando") setFase("jugando");
    if (duelo.estado === "terminado") setFase("terminado");
    if (duelo.estado === "esperando") setFase("esperando");
    (async () => {
      const { data } = await supabase.from("duelo_respuestas").select("*").eq("duelo_id", duelo.id).eq("indice", duelo.indice);
      if (data && data.length) {
        const r = {};
        data.forEach((row) => { r[row.jugador === duelo.jugador1 ? "jugador1" : "jugador2"] = row.opcion; });
        setRespuestasTodas((prev) => ({ ...prev, [duelo.indice]: { ...(prev[duelo.indice] || {}), ...r } }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelo && duelo.indice, duelo && duelo.estado]);

  useEffect(() => {
    if (fase !== "esperando" || !duelo) return;
    const intervalo = setInterval(async () => {
      const { data } = await supabase.from("duelos").select("*").eq("id", duelo.id).maybeSingle();
      if (data && data.estado !== "esperando") { setDuelo(data); return; }
      // "Late": mientras seguimos esperando, refrescamos created_at para que esta
      // búsqueda no caduque mientras la pestaña siga realmente abierta y esperando.
      await supabase.from("duelos").update({ created_at: new Date().toISOString() }).eq("id", duelo.id).eq("estado", "esperando");
    }, 2000);
    return () => clearInterval(intervalo);
  }, [fase, duelo && duelo.id]);

  useEffect(() => {
    if (fase !== "jugando" || !duelo || !duelo.pregunta_inicio || duelo.revelado_en) return;
    const inicio = new Date(duelo.pregunta_inicio).getTime();
    const tick = () => {
      const restante = Math.max(0, DURACION_PREGUNTA - Math.floor((Date.now() - inicio) / 1000));
      setTiempoRestante(restante);
      if (restante <= 0 && soyJugador1) resolverPregunta();
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, duelo && duelo.pregunta_inicio, duelo && duelo.revelado_en]);

  useEffect(() => {
    if (fase !== "jugando" || !duelo || duelo.revelado_en) return;
    if (respuestas.jugador1 !== undefined && respuestas.jugador2 !== undefined && soyJugador1) {
      resolverPregunta();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respuestas.jugador1, respuestas.jugador2]);

  useEffect(() => {
    if (!duelo || !duelo.revelado_en) { setCuentaRevelacion(null); return; }
    const inicio = new Date(duelo.revelado_en).getTime();
    const tick = () => {
      const restante = Math.max(0, PAUSA_REVELACION - Math.floor((Date.now() - inicio) / 1000));
      setCuentaRevelacion(restante);
      if (restante <= 0 && soyJugador1 && avanzadoRef.current !== duelo.revelado_en) {
        avanzadoRef.current = duelo.revelado_en;
        avanzarSiguiente();
      }
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelo && duelo.revelado_en]);

  const buscarDuelo = async () => {
    setBuscando(true);
    const cutoffIso = new Date(Date.now() - DUELO_ESPERA_MAX_MS).toISOString();
    const { data: esperando } = await supabase
      .from("duelos")
      .select("*")
      .eq("estado", "esperando")
      .is("jugador2", null)
      .neq("jugador1", user.name)
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: true })
      .limit(1);

    if (esperando && esperando.length > 0) {
      const fila = esperando[0];
      const { data: actualizado } = await supabase
        .from("duelos")
        .update({ jugador2: user.name, estado: "jugando", pregunta_inicio: new Date().toISOString() })
        .eq("id", fila.id)
        .select();
      if (actualizado && actualizado[0]) {
        await cargarPreguntasDuelo(actualizado[0].preguntas_ids);
        setDuelo(actualizado[0]);
        setFase("jugando");
      }
    } else {
      const cantidad = Math.min(PREGUNTAS_POR_DUELO, questionsReales.length);
      const barajadas = [...questionsReales].sort(() => Math.random() - 0.5).slice(0, cantidad);
      if (barajadas.length < 4) { setBuscando(false); return; }
      const ids = barajadas.map((q) => q.id);
      const { data: nuevo } = await supabase
        .from("duelos")
        .insert([{ jugador1: user.name, preguntas_ids: ids, estado: "esperando" }])
        .select();
      if (nuevo && nuevo[0]) {
        await cargarPreguntasDuelo(nuevo[0].preguntas_ids);
        setDuelo(nuevo[0]);
        setFase("esperando");
      }
    }
    setBuscando(false);
  };

  useEffect(() => {
    if (autoUnirse && fase === "lobby" && !duelo && !buscando) {
      buscarDuelo();
      if (onAutoUnirseConsumido) onAutoUnirseConsumido();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoUnirse]);

  const cargarPreguntasDuelo = async (ids) => {
    const { data } = await supabase.from("preguntas").select("*").in("id", ids);
    if (data) {
      const ordenadas = ids.map((id) => data.find((q) => q.id === id)).filter(Boolean);
      setPreguntasDuelo(ordenadas);
    }
  };

  const responder = async (opcion) => {
    if (miRespuesta !== null || !duelo) return;
    setMiRespuesta(opcion);
    setRespuestasTodas((prev) => ({ ...prev, [duelo.indice]: { ...(prev[duelo.indice] || {}), [miClave]: opcion } }));
    await supabase.from("duelo_respuestas").insert([{ duelo_id: duelo.id, jugador: user.name, indice: duelo.indice, opcion }]);
    const preguntaActual = preguntasDuelo[duelo.indice % preguntasDuelo.length];
    if (onProgresoDiario && preguntaActual) onProgresoDiario(opcion === preguntaActual.correcta);
    if (onRespuestaPregunta && preguntaActual) onRespuestaPregunta(preguntaActual, opcion === preguntaActual.correcta);
  };

  const resolverPregunta = async () => {
    if (!duelo || duelo.revelado_en) return;
    const preguntaActual = preguntasDuelo[duelo.indice % preguntasDuelo.length];
    if (!preguntaActual) return;
    const actuales = respuestasTodas[duelo.indice] || {};
    const r1 = actuales.jugador1 !== undefined ? actuales.jugador1 : -1;
    const r2 = actuales.jugador2 !== undefined ? actuales.jugador2 : -1;
    const nuevasVidas1 = r1 === preguntaActual.correcta ? duelo.vidas1 : duelo.vidas1 - 1;
    const nuevasVidas2 = r2 === preguntaActual.correcta ? duelo.vidas2 : duelo.vidas2 - 1;
    await supabase.from("duelos").update({
      vidas1: Math.max(0, nuevasVidas1),
      vidas2: Math.max(0, nuevasVidas2),
      revelado_en: new Date().toISOString(),
    }).eq("id", duelo.id);
  };

  const avanzarSiguiente = async () => {
    if (!duelo) return;
    const vidas1 = duelo.vidas1, vidas2 = duelo.vidas2;
    if (vidas1 <= 0 || vidas2 <= 0) {
      const ganador = vidas1 <= 0 && vidas2 <= 0 ? null : (vidas1 <= 0 ? duelo.jugador2 : duelo.jugador1);
      await supabase.from("duelos").update({ estado: "terminado", ganador }).eq("id", duelo.id);
      return;
    }
    await supabase.from("duelos").update({
      indice: duelo.indice + 1,
      pregunta_inicio: new Date().toISOString(),
      revelado_en: null,
    }).eq("id", duelo.id);
  };

  const salirDuelo = async () => {
    if (duelo && duelo.estado === "esperando" && soyJugador1) {
      await supabase.from("duelos").delete().eq("id", duelo.id).eq("estado", "esperando");
    }
    setDuelo(null);
    setPreguntasDuelo([]);
    setRespuestasTodas({});
    setFase("lobby");
  };

  if (fase === "lobby" || !duelo) {
    if (questionsReales.length < 4) {
      return (
        <div>
          <SectionTitle title="Duelo 1v1" subtitle="Hace falta al menos 4 preguntas en el banco." />
          <Card style={{ textAlign: "center", color: "#9B9689", padding: "28px 16px" }}>
            Añade más preguntas desde "Banco de preguntas" para poder jugar duelos.
          </Card>
        </div>
      );
    }
    return (
      <div>
        <SectionTitle title="Duelo 1v1" subtitle="Reta a otra persona en tiempo real. 3 vidas, sin límite de preguntas." />
        <Card style={{ textAlign: "center", padding: "32px 20px" }}>
          <Swords size={30} color={ACENTO} style={{ marginBottom: 14 }} />
          <p style={{ color: "#6E6A61", fontSize: 14, marginBottom: 20 }}>
            Al pulsar "Buscar duelo", te empareja con la primera persona que también esté buscando. Si nadie está buscando, esperas a que otro entre.
          </p>
          <button type="button" onClick={buscarDuelo} disabled={buscando} style={{ ...styles.btnPrimary, width: "100%" }}>
            {buscando ? "Buscando..." : "Buscar duelo"}
          </button>
        </Card>
      </div>
    );
  }

  if (fase === "esperando") {
    return (
      <div>
        <SectionTitle title="Duelo 1v1" />
        <Card style={{ textAlign: "center", padding: "32px 20px" }}>
          <Loader2 className="animate-spin" size={26} color={ACENTO} style={{ marginBottom: 14 }} />
          <p style={{ color: "#6E6A61", fontSize: 14, marginBottom: 20 }}>Esperando a un oponente...</p>
          <button type="button" onClick={salirDuelo} style={styles.btnSecondary}>Cancelar</button>
        </Card>
      </div>
    );
  }

  if (fase === "terminado") {
    const gane = duelo.ganador === user.name;
    const empate = !duelo.ganador;
    if (streakRegistradaRef.current !== duelo.id) {
      streakRegistradaRef.current = duelo.id;
      onDueloEnd(gane);
    }
    return (
      <div>
        {mostrarCelebracion && !empate && <CelebracionDuelo gane={gane} />}
        <SectionTitle title="Duelo terminado" />
        <Card style={{ textAlign: "center", padding: "32px 20px" }}>
          <EspadaResultado resultado={empate ? "empate" : gane ? "gane" : "perdi"} />
          <div style={{ fontSize: 22, fontFamily: "var(--font-display)", color: "#1E1C18" }}>
            {empate ? "Empate" : gane ? "¡Has ganado!" : "Has perdido"}
          </div>
          {!empate && <div style={{ color: "#6E6A61", fontSize: 14, marginTop: 6 }}>Ganador: {duelo.ganador}</div>}
          <button type="button" onClick={salirDuelo} style={{ ...styles.btnPrimary, marginTop: 22 }}>Volver al lobby</button>
        </Card>
      </div>
    );
  }

  const preguntaActual = preguntasDuelo[duelo.indice % preguntasDuelo.length];
  const revelando = !!duelo.revelado_en;
  const miVidas = soyJugador1 ? duelo.vidas1 : duelo.vidas2;
  const suVidas = soyJugador1 ? duelo.vidas2 : duelo.vidas1;

  return (
    <div>
      {mostrarChoque && <ChoqueEspadas />}
      <div style={styles.vsHeader}>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 13, color: "#1E1C18", fontWeight: 600 }}>{user.name}</div>
          <Corazones vidas={miVidas} />
        </div>
        <div style={{ fontSize: 12, color: "#9B9689", textAlign: "center" }}>
          <div>VS</div>
          <div>Pregunta {duelo.indice + 1}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: "#1E1C18", fontWeight: 600 }}>{oponenteNombre || "..."}</div>
          <Corazones vidas={suVidas} align="right" />
        </div>
      </div>

      {!revelando && (
        <div style={{ textAlign: "center", margin: "10px 0" }}>
          <span style={{ fontSize: 13, color: tiempoRestante <= 10 ? "#A6362B" : "#6E6A61" }}>
            <Clock size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />{tiempoRestante}s
          </span>
        </div>
      )}

      {preguntaActual && (
        <Card style={{ marginTop: 10 }}>
          <p style={{ fontSize: 21, color: "#1E1C18", lineHeight: 1.5, marginBottom: 20 }}>{preguntaActual.pregunta}</p>
          {preguntaActual.opciones.map((op, i) => {
            let borderColor = "#C9C5B7", background = "#F6F4EC";
            if (revelando) {
              if (i === preguntaActual.correcta) { borderColor = CORRECTO; background = CORRECTO_SUAVE; }
              else if (i === respuestas[miClave]) { borderColor = ACENTO; background = ACENTO_SUAVE; }
            } else if (miRespuesta === i) {
              borderColor = "#1E1C18"; background = "#E8E5D9";
            }
            return (
              <button
                type="button"
                key={i}
                onClick={() => responder(i)}
                disabled={miRespuesta !== null || revelando}
                style={{ ...styles.option, borderColor, background, opacity: miRespuesta !== null && miRespuesta !== i && !revelando ? 0.6 : 1 }}
              >
                {op}
                {revelando && i === respuestas[miClave] && i !== preguntaActual.correcta && <span style={{ fontSize: 11, color: "#A6362B" }}> — tu respuesta</span>}
                {revelando && respuestas[soyJugador1 ? "jugador2" : "jugador1"] === i && i !== preguntaActual.correcta && i !== respuestas[miClave] && <span style={{ fontSize: 11, color: "#9B9689" }}> — respuesta de {oponenteNombre}</span>}
              </button>
            );
          })}
          {miRespuesta !== null && !revelando && (
            <p style={{ fontSize: 12, color: "#9B9689", textAlign: "center", marginTop: 8 }}>Esperando al oponente...</p>
          )}
          {revelando && (
            <p style={{ fontSize: 12, color: "#9B9689", textAlign: "center", marginTop: 8 }}>
              Siguiente pregunta en {cuentaRevelacion ?? PAUSA_REVELACION}s...
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

// Choque de espadas mostrado una vez, al arrancar el duelo: dos espadas
// entran desde los lados y se cruzan en el centro con un destello, y todo
// el overlay se desvanece solo (vía CSS, sin estado extra) justo antes de
// que `mostrarChoque` se ponga a false y lo desmonte.
function ChoqueEspadas() {
  return (
    <div className="choque-overlay" style={styles.choqueOverlay}>
      <style>{`
        @keyframes espadaEntraIzq {
          0% { transform: translateX(-90px) rotate(-75deg); opacity: 0; }
          55% { transform: translateX(0) rotate(-45deg); opacity: 1; }
          65% { transform: translateX(5px) rotate(-40deg); }
          80% { transform: translateX(-3px) rotate(-47deg); }
          100% { transform: translateX(0) rotate(-45deg); opacity: 1; }
        }
        @keyframes espadaEntraDer {
          0% { transform: translateX(90px) rotate(75deg) scaleX(-1); opacity: 0; }
          55% { transform: translateX(0) rotate(45deg) scaleX(-1); opacity: 1; }
          65% { transform: translateX(-5px) rotate(40deg) scaleX(-1); }
          80% { transform: translateX(3px) rotate(47deg) scaleX(-1); }
          100% { transform: translateX(0) rotate(45deg) scaleX(-1); opacity: 1; }
        }
        @keyframes choqueDestello {
          0%, 52% { opacity: 0; transform: translate(-50%, -50%) scale(0.2); }
          62% { opacity: 1; transform: translate(-50%, -50%) scale(1.4); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2); }
        }
        @keyframes choqueDesvanece {
          0%, 78% { opacity: 1; }
          100% { opacity: 0; }
        }
        .choque-overlay { animation: choqueDesvanece 1.1s ease-in both; }
        .choque-espada-izq { animation: espadaEntraIzq 0.7s cubic-bezier(.3,.2,.2,1.2) both; }
        .choque-espada-der { animation: espadaEntraDer 0.7s cubic-bezier(.3,.2,.2,1.2) both; }
        .choque-destello { animation: choqueDestello 0.7s ease-out both; }
      `}</style>
      <Sword size={42} color={ACENTO} className="choque-espada-izq" style={{ transformOrigin: "80% 80%" }} />
      <span className="choque-destello" style={styles.choqueDestello} />
      <Sword size={42} color={ACENTO} className="choque-espada-der" style={{ transformOrigin: "20% 80%" }} />
    </div>
  );
}

// Icono de resultado en la pantalla "Duelo terminado": si ganas o empatas se
// deja exactamente como estaba (el icono cruzado de siempre, sin animar);
// si pierdes, ese mismo icono tiembla y se parte en dos mitades (recortadas
// con clip-path sobre el mismo SVG) que caen y se desvanecen.
function EspadaResultado({ resultado }) {
  const color = resultado === "empate" ? "#9B9689" : resultado === "gane" ? CORRECTO : "#A6362B";
  if (resultado !== "perdi") {
    return <Swords size={26} color={color} style={{ marginBottom: 10 }} />;
  }
  return (
    <div style={{ position: "relative", width: 26, height: 26, margin: "0 auto 10px" }}>
      <style>{`
        @keyframes espadaTiembla {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          40% { transform: translateX(3px); }
          60% { transform: translateX(-2px); }
          80% { transform: translateX(2px); }
        }
        @keyframes rompeIzq {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate(-14px, 20px) rotate(-55deg); opacity: 0; }
        }
        @keyframes rompeDer {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate(14px, 20px) rotate(55deg); opacity: 0; }
        }
        .espada-rota-izq { clip-path: inset(0 50% 0 0); animation: espadaTiembla 0.35s ease-in-out 2, rompeIzq 0.5s ease-in 0.7s both; }
        .espada-rota-der { clip-path: inset(0 0 0 50%); animation: espadaTiembla 0.35s ease-in-out 2, rompeDer 0.5s ease-in 0.7s both; }
      `}</style>
      <Swords size={26} color={color} className="espada-rota-izq" style={{ position: "absolute", top: 0, left: 0 }} />
      <Swords size={26} color={color} className="espada-rota-der" style={{ position: "absolute", top: 0, left: 0 }} />
    </div>
  );
}

// Overlay a pantalla completa en "Duelo terminado": confeti + 👏 si ganas,
// lluvia de emoticonos llorando + 😭 grande si pierdes. `pointerEvents: "none"`
// para no bloquear el botón "Volver al lobby" que sigue debajo; se desmonta
// solo (vía el timeout que pone `mostrarCelebracion` a false en `Duelo`).
function CelebracionDuelo({ gane }) {
  const piezas = useMemo(() => Array.from({ length: gane ? 46 : 24 }, (_, i) => ({
    izquierda: Math.random() * 100,
    retraso: Math.random() * 0.6,
    duracion: 2.2 + Math.random() * 1.4,
    color: CONFETI_COLORES[i % CONFETI_COLORES.length],
    rotacion: Math.random() * 360,
    tamano: 5 + Math.random() * 4,
    emoji: Math.random() < 0.5 ? "😢" : "😭",
    fontSize: 16 + Math.random() * 12,
  })), [gane]);

  return (
    <div style={styles.celebracionOverlay}>
      <style>{`
        @keyframes celebracionCae {
          0% { transform: translateY(-24px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(105vh) rotate(360deg); opacity: 0; }
        }
      `}</style>
      {piezas.map((p, i) => (
        gane ? (
          <span
            key={i}
            style={{
              position: "absolute", top: 0, left: `${p.izquierda}%`, width: p.tamano, height: p.tamano * 1.4,
              background: p.color, borderRadius: 2,
              animation: `celebracionCae ${p.duracion}s linear ${p.retraso}s forwards`,
              transform: `rotate(${p.rotacion}deg)`,
            }}
          />
        ) : (
          <span
            key={i}
            style={{
              position: "absolute", top: 0, left: `${p.izquierda}%`, fontSize: p.fontSize, lineHeight: 1,
              animation: `celebracionCae ${p.duracion}s linear ${p.retraso}s forwards`,
            }}
          >
            {p.emoji}
          </span>
        )
      ))}
    </div>
  );
}

function Corazones({ vidas, align }) {
  return (
    <div style={{ display: "flex", gap: 3, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
      {[0, 1, 2].map((i) => (
        <Heart key={i} size={15} color={i < vidas ? "#A6362B" : "#C9C5B7"} fill={i < vidas ? "#A6362B" : "none"} />
      ))}
    </div>
  );
}

function BarraNivel({ actual, siguiente, totalCorrectas, compact }) {
  const desde = actual ? actual.umbral : 0;
  const hasta = siguiente ? siguiente.umbral : desde;
  const rango = Math.max(1, hasta - desde);
  const puntosEnNivel = Math.min(rango, Math.max(0, totalCorrectas - desde));
  const pct = siguiente ? Math.round((puntosEnNivel / rango) * 100) : 100;
  return (
    <Card style={{ padding: compact ? "14px 16px" : "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: compact ? 10 : 14, flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontSize: compact ? 13 : 15, fontWeight: 600, color: "#1E1C18" }}>{actual ? actual.titulo : "Todavía sin insignia"}</div>
        <div style={{ fontSize: compact ? 11 : 12, color: "#9B9689" }}>
          {totalCorrectas} acertadas{siguiente ? ` · ${siguiente.umbral - totalCorrectas} para ${siguiente.nombre}` : " · nivel máximo"}
        </div>
      </div>
      <div style={styles.insigniasGrid}>
        {INSIGNIAS.map((ins) => {
          const desbloqueada = totalCorrectas >= ins.umbral;
          const Icono = ins.icon;
          return (
            <div key={ins.id} style={{ ...styles.insigniaCard, ...(compact ? { flex: "1 1 62px", minWidth: 56, padding: "8px 4px" } : {}), borderColor: desbloqueada ? ins.color : "#C9C5B7" }}>
              <Icono size={compact ? 18 : 22} color={desbloqueada ? ins.color : "#C7C2B4"} strokeWidth={1.6} />
              <div style={{ fontSize: compact ? 10 : 11.5, fontWeight: 600, color: desbloqueada ? "#1E1C18" : "#B7BEC8", marginTop: 5 }}>{ins.nombre}</div>
              <div style={{ fontSize: compact ? 9 : 10, color: "#B7BEC8", marginTop: 1 }}>{ins.umbral}</div>
            </div>
          );
        })}
      </div>
      <div style={{ ...styles.progressTrack, marginTop: compact ? 10 : 14 }}>
        <div style={{ ...styles.progressFill, width: `${pct}%`, background: ORO }} />
      </div>
    </Card>
  );
}

function RuletaDiaria({ questions, miRacha, onGirarRuleta }) {
  const cursosDisponibles = useMemo(() => {
    const reales = questions.filter((q) => !q.inventada);
    return [...new Set(reales.map((q) => q.curso))].slice(0, 6);
  }, [questions]);

  const [girando, setGirando] = useState(false);
  const [angulo, setAngulo] = useState(0);
  const [resultado, setResultado] = useState(null);

  const hoy = new Date().toISOString().slice(0, 10);
  const yaGirasteHoy = miRacha && miRacha.ultimo_giro_ruleta === hoy;

  if (cursosDisponibles.length === 0) return null;

  const numSegmentos = cursosDisponibles.length;
  const anguloPorSegmento = 360 / numSegmentos;
  const gradiente = cursosDisponibles
    .map((c, i) => `${CURSOS_RULETA_COLORES[i % CURSOS_RULETA_COLORES.length]} ${i * anguloPorSegmento}deg ${(i + 1) * anguloPorSegmento}deg`)
    .join(", ");

  const girar = () => {
    if (girando || yaGirasteHoy) return;
    setGirando(true);
    setResultado(null);
    const indiceGanador = Math.floor(Math.random() * numSegmentos);
    const cursoGanador = cursosDisponibles[indiceGanador];
    const anguloCentro = indiceGanador * anguloPorSegmento + anguloPorSegmento / 2;
    const vueltas = 5;
    const nuevoAngulo = angulo - (angulo % 360) + vueltas * 360 + (360 - anguloCentro);
    setAngulo(nuevoAngulo);
    setTimeout(() => {
      const delCurso = questions.filter((q) => !q.inventada && q.curso === cursoGanador);
      const pregunta = delCurso[Math.floor(Math.random() * delCurso.length)];
      setResultado({ curso: cursoGanador, pregunta });
      setGirando(false);
      if (onGirarRuleta) onGirarRuleta();
    }, 3000);
  };

  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
          <div
            style={{
              width: 88, height: 88, borderRadius: "50%",
              background: `conic-gradient(${gradiente})`,
              transform: `rotate(${angulo}deg)`,
              transition: girando ? "transform 3s cubic-bezier(0.17,0.67,0.12,0.99)" : "none",
              boxShadow: "0 0 0 3px #fff, 0 0 0 4px #C9C5B7",
            }}
          />
          <div style={{ position: "absolute", top: -7, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "10px solid #1E1C18" }} />
        </div>
        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1E1C18", marginBottom: 4 }}>Ruleta del día</div>
          {yaGirasteHoy && !resultado ? (
            <div style={{ fontSize: 12.5, color: "#9B9689" }}>Ya has girado hoy. Vuelve mañana para otra pregunta sorpresa.</div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: "#9B9689", marginBottom: 8 }}>Gira y te toca una pregunta sorpresa de un curso al azar.</div>
              <button type="button" onClick={girar} disabled={girando || yaGirasteHoy} style={{ ...styles.btnSecondary, opacity: girando ? 0.6 : 1 }}>
                {girando ? "Girando..." : "Girar"}
              </button>
            </>
          )}
        </div>
      </div>
      {resultado && (
        <div style={{ marginTop: 16 }}>
          <PreguntaGeneradaCard p={resultado.pregunta} guardada={false} onGuardar={null} />
        </div>
      )}
    </Card>
  );
}

// "Dónde fallas": el % de acierto por examen y por tema, para saber qué
// repasar sin ir a ciegas. No hace falta nada nuevo en Supabase — sale de
// cruzar lo que ya se guarda: `preguntas_progreso.veces` (intentos por
// pregunta) menos `fallos.veces` (fallos por pregunta) = aciertos.
//
// Ojo con lo que NO puede saber: antes de existir preguntas_progreso solo
// se guardaban los fallos, así que las que acertaste a la primera en aquella
// época no constan como hechas (el aviso del pie lo dice). Y las preguntas
// del backfill (fallos antiguos) arrancan con intentos = fallos, o sea 0% de
// acierto, que es justo lo que consta de ellas.
const TEMA_PLACEHOLDER = /^pregunta\s*\d+$/i;
const MAX_FILAS_TEMA = 15;

function agruparAciertos(preguntas, clave, progresoPorId, fallosPorId) {
  const grupos = new Map();
  preguntas.forEach((q) => {
    const nombre = clave(q);
    if (!nombre) return;
    if (!grupos.has(nombre)) grupos.set(nombre, { nombre, total: 0, hechas: 0, intentos: 0, aciertos: 0 });
    const g = grupos.get(nombre);
    g.total += 1;
    const intentos = (progresoPorId[q.id] && progresoPorId[q.id].veces) || 0;
    if (intentos > 0) {
      const fallidas = (fallosPorId[q.id] && fallosPorId[q.id].veces) || 0;
      g.hechas += 1;
      g.intentos += intentos;
      g.aciertos += Math.max(0, intentos - fallidas);
    }
  });
  return [...grupos.values()].map((g) => ({ ...g, pct: g.intentos > 0 ? Math.round((g.aciertos / g.intentos) * 100) : null }));
}

function FilaAcierto({ g }) {
  // La barra ya dice cuánto; el color solo se usa para señalar lo flojo (no
  // para repintar un degradado sobre algo que la longitud ya cuenta), y el
  // número va siempre en tinta, nunca en el color de la barra.
  const flojo = g.pct < 60;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
        <span style={{ fontSize: 14, color: TINTA, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {g.nombre}
        </span>
        <span style={{ fontSize: 13.5, color: TINTA, fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {g.pct}%
        </span>
      </div>
      <div
        style={{ height: 8, borderRadius: 4, background: "#F2EFE7", overflow: "hidden" }}
        title={`${g.aciertos} aciertos de ${g.intentos} respuestas`}
      >
        <div style={{ width: `${Math.max(g.pct, 2)}%`, height: "100%", borderRadius: 4, background: flojo ? ACENTO : TINTA_SUAVE }} />
      </div>
      <div style={{ fontSize: 11.5, color: TINTA_TENUE, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        {g.aciertos} de {g.intentos} respuestas · {g.hechas}/{g.total} preguntas empezadas
      </div>
    </div>
  );
}

function DondeFallas({ questions, fallos, preguntasProgreso }) {
  const [modo, setModo] = useState("curso"); // curso | tema

  const { filas, resumen, sinEmpezar } = useMemo(() => {
    const progresoPorId = {};
    (preguntasProgreso || []).forEach((p) => { progresoPorId[p.pregunta_id] = p; });
    const fallosPorId = {};
    (fallos || []).forEach((f) => { fallosPorId[f.pregunta_id] = f; });
    const reales = questions.filter((q) => !q.inventada);

    const porCurso = agruparAciertos(reales, (q) => q.curso, progresoPorId, fallosPorId);
    const totales = porCurso.reduce(
      (acc, g) => ({ total: acc.total + g.total, hechas: acc.hechas + g.hechas, intentos: acc.intentos + g.intentos, aciertos: acc.aciertos + g.aciertos }),
      { total: 0, hechas: 0, intentos: 0, aciertos: 0 }
    );

    const grupos = modo === "curso"
      ? porCurso
      : agruparAciertos(reales, (q) => (q.tema && !TEMA_PLACEHOLDER.test(q.tema.trim()) ? q.tema.trim() : null), progresoPorId, fallosPorId);

    // Solo tiene sentido ordenar "de peor a mejor" lo que has tocado; lo que
    // no has empezado no es un mal resultado, es que no hay dato.
    const conDatos = grupos.filter((g) => g.pct !== null).sort((a, b) => a.pct - b.pct || b.intentos - a.intentos);

    return {
      filas: modo === "tema" ? conDatos.slice(0, MAX_FILAS_TEMA) : conDatos,
      resumen: { ...totales, pct: totales.intentos > 0 ? Math.round((totales.aciertos / totales.intentos) * 100) : null },
      sinEmpezar: grupos.length - conDatos.length,
    };
  }, [questions, fallos, preguntasProgreso, modo]);

  return (
    <div>
      <SectionTitle
        title="Dónde fallas"
        subtitle={resumen.pct === null
          ? "Cuando respondas unas cuantas preguntas, aquí verás en qué bloques flojeas."
          : `${resumen.pct}% de aciertos · ${resumen.hechas} de ${resumen.total} preguntas empezadas`}
      />
      <Card>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <button type="button" onClick={() => setModo("curso")} style={{ ...styles.tabOrigenBtn, ...(modo === "curso" ? styles.tabOrigenActivo : {}) }}>
            Por examen
          </button>
          <button type="button" onClick={() => setModo("tema")} style={{ ...styles.tabOrigenBtn, ...(modo === "tema" ? styles.tabOrigenActivo : {}) }}>
            Por tema
          </button>
        </div>
        {filas.length === 0 ? (
          <p style={{ fontSize: 13.5, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
            {modo === "tema"
              ? "Todavía no hay datos por tema. Los exámenes oficiales que transcribimos no traían el tema de cada pregunta, así que aquí solo salen las de los simulacros."
              : "Todavía no has respondido ninguna pregunta."}
          </p>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: TINTA_SUAVE, margin: "0 0 14px" }}>
              De peor a mejor. Empieza por arriba.
            </p>
            {filas.map((g) => <FilaAcierto key={g.nombre} g={g} />)}
            {modo === "tema" && sinEmpezar > 0 && (
              <p style={{ fontSize: 11.5, color: TINTA_TENUE, margin: "10px 0 0" }}>
                Se muestran los {filas.length} peores. Te quedan {sinEmpezar} temas sin empezar.
              </p>
            )}
            {modo === "curso" && sinEmpezar > 0 && (
              <p style={{ fontSize: 11.5, color: TINTA_TENUE, margin: "10px 0 0" }}>
                {sinEmpezar} examen{sinEmpezar === 1 ? "" : "es"} sin empezar todavía.
              </p>
            )}
          </>
        )}
      </Card>
      <p style={{ fontSize: 11.5, color: TINTA_TENUE, margin: "8px 2px 0", lineHeight: 1.5 }}>
        Cuenta desde que existe el contador por pregunta. Lo que acertaste antes de eso no dejó rastro y figura como no empezado hasta que lo repitas.
      </p>
    </div>
  );
}

function MiPerfil({ user, miRacha, questions, fallos, favoritos, onToggleFavorito, onGirarRuleta, preguntasProgreso }) {
  const [verTodosFallos, setVerTodosFallos] = useState(false);
  const [abiertaId, setAbiertaId] = useState(null);

  const preguntasPorId = useMemo(() => {
    const m = {};
    questions.forEach((q) => { m[q.id] = q; });
    return m;
  }, [questions]);

  const fallosConPregunta = useMemo(
    () => fallos
      .map((f) => ({ ...f, pregunta: preguntasPorId[f.pregunta_id] }))
      .filter((f) => f.pregunta)
      .sort((a, b) => b.veces - a.veces),
    [fallos, preguntasPorId]
  );
  const favoritasConPregunta = useMemo(
    () => favoritos
      .map((f) => ({ ...f, pregunta: preguntasPorId[f.pregunta_id] }))
      .filter((f) => f.pregunta),
    [favoritos, preguntasPorId]
  );

  const fallosVisibles = verTodosFallos ? fallosConPregunta : fallosConPregunta.slice(0, 10);
  const abierta = abiertaId != null ? (preguntasPorId[abiertaId] || null) : null;

  return (
    <div>
      <SectionTitle title="Mi perfil" subtitle={user.name} />

      <div style={{ marginBottom: 32 }}>
        <DondeFallas questions={questions} fallos={fallos} preguntasProgreso={preguntasProgreso} />
      </div>

      <div style={{ marginTop: 8 }}>
        <SectionTitle
          title="Historial de fallos"
          subtitle={fallosConPregunta.length === 0 ? "Todavía no has fallado ninguna pregunta." : "Las que más se te atascan, primero."}
        />
        {fallosVisibles.map((f, i) => (
          <FalloRepetible key={f.pregunta_id} f={f} index={i + 1} favoritos={favoritos} onToggleFavorito={onToggleFavorito} />
        ))}
        {fallosConPregunta.length > 10 && (
          <button type="button" onClick={() => setVerTodosFallos((v) => !v)} style={styles.linkBtn}>
            {verTodosFallos ? "Ver menos" : `Ver las ${fallosConPregunta.length} preguntas falladas`}
          </button>
        )}
      </div>

      <div style={{ marginTop: 32 }}>
        <PreguntasPlegables
          titulo="Favoritas"
          subtitulo={favoritasConPregunta.length === 0 ? "Toca la estrella en cualquier pregunta para guardarla aquí." : null}
          items={favoritasConPregunta}
          abiertaId={abiertaId}
          setAbiertaId={setAbiertaId}
          favoritos={favoritos}
          onToggleFavorito={onToggleFavorito}
        />
      </div>
    </div>
  );
}

function Logros({ user, miRacha, compact }) {
  const totalCorrectas = (miRacha && miRacha.total_correctas) || 0;
  const totalRespondidas = (miRacha && miRacha.total_respondidas) || 0;
  const pctAcierto = totalRespondidas > 0 ? Math.round((totalCorrectas / totalRespondidas) * 100) : 0;
  const rachaDias = (miRacha && miRacha.racha_dias_actual) || 0;
  const rachaDiasRecord = (miRacha && miRacha.racha_dias_record) || 0;
  const rachaPreguntas = (miRacha && miRacha.racha_actual) || 0;
  const rachaPreguntasRecord = (miRacha && miRacha.racha_record) || 0;
  const correctasHoy = (miRacha && miRacha.fecha_correctas_hoy === new Date().toISOString().slice(0, 10)) ? (miRacha.correctas_hoy || 0) : 0;

  const actual = insigniaActual(totalCorrectas);
  const siguiente = siguienteInsignia(totalCorrectas);

  return (
    <div>
      {compact ? (
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1E1C18", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Award size={15} color="#C89B3C" /> Logros
        </div>
      ) : (
        <SectionTitle title="Logros" subtitle={user.name} />
      )}

      <BarraNivel actual={actual} siguiente={siguiente} totalCorrectas={totalCorrectas} compact={compact} />

      <Card style={{ marginTop: 14, padding: compact ? "14px 0" : "16px 0", display: "flex" }}>
        <EstadisticaItem
          icono={Flame}
          color="#A6362B"
          valor={rachaDias}
          etiqueta={`días de racha${rachaDiasRecord > 0 ? ` (récord ${rachaDiasRecord})` : ""}`}
          detalle={`${correctasHoy}/${META_DIARIA_RACHA} aciertos hoy`}
        />
        <EstadisticaItem
          icono={Target}
          color={CORRECTO}
          valor={`${pctAcierto}%`}
          etiqueta="de acierto"
          detalle={`${totalRespondidas} respondidas`}
          borde
        />
        <EstadisticaItem
          icono={Zap}
          color="#C89B3C"
          valor={rachaPreguntas}
          etiqueta="aciertos seguidos"
          detalle={rachaPreguntasRecord > 0 ? `récord ${rachaPreguntasRecord}` : null}
          borde
        />
      </Card>
    </div>
  );
}

const TAM_SESION_FLASHCARDS = 20;

// Las etiquetas se escriben como texto libre separado por comas y se guardan
// en flashcards.etiquetas (text[]): se recortan, se quitan las vacías y se
// deduplican, para que "Porcentajes, dsm , Porcentajes" no cree tres.
const parsearEtiquetas = (texto) => [
  ...new Set((texto || "").split(",").map((e) => e.trim()).filter(Boolean)),
];
const CALIFICACIONES_FLASHCARD = [
  { calidad: 0, label: "Muy difícil", bg: ACENTO_SUAVE, color: ACENTO, borde: ACENTO },
  { calidad: 3, label: "Difícil", bg: AVISO_SUAVE, color: AVISO, borde: AVISO },
  { calidad: 4, label: "Fácil", bg: CAUTELA_SUAVE, color: CAUTELA, borde: CAUTELA },
  { calidad: 5, label: "Muy fácil", bg: CORRECTO_SUAVE, color: CORRECTO, borde: CORRECTO },
];

function Flashcards({ user, flashcards, progreso, onRepaso, onUpdate, onAdd, onAddBulk, onDelete, onRenombrarMazo, onEliminarMazo }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const progresoPorId = useMemo(() => {
    const m = {};
    progreso.forEach((p) => { m[p.flashcard_id] = p; });
    return m;
  }, [progreso]);

  const mazos = useMemo(
    () => [...new Set(flashcards.map((f) => f.mazo || "General"))].sort((a, b) => a.localeCompare(b)),
    [flashcards]
  );

  const statsPorMazo = useMemo(() => {
    const m = new Map();
    flashcards.forEach((f) => {
      const clave = f.mazo || "General";
      if (!m.has(clave)) m.set(clave, { total: 0, pendientes: 0 });
      const s = m.get(clave);
      s.total += 1;
      const p = progresoPorId[f.grupo_id || f.id];
      if (!p || !p.proxima_revision || p.proxima_revision <= hoy) s.pendientes += 1;
    });
    return m;
  }, [flashcards, progresoPorId, hoy]);

  const pendientesTotal = useMemo(
    () => [...statsPorMazo.values()].reduce((acc, s) => acc + s.pendientes, 0),
    [statsPorMazo]
  );

  const [mostrandoLista, setMostrandoLista] = useState(true); // listado de mazos vs. vista de repaso
  const [mazoActivo, setMazoActivo] = useState(null); // mazo exacto seleccionado para repasar/ver

  // Si borras el mazo que tenías abierto, deja de existir en `mazos` —
  // vuelve al listado en vez de quedarse mirando un mazo fantasma.
  useEffect(() => {
    if (mazoActivo && !mazos.includes(mazoActivo)) {
      setMazoActivo(null);
      setMostrandoLista(true);
    }
  }, [mazoActivo, mazos]);

  const seleccionarMazo = (nombre) => {
    setMazoActivo(nombre);
    setMostrandoLista(false);
  };
  const seleccionarTodas = () => {
    setMazoActivo(null);
    setMostrandoLista(false);
  };
  const volverALista = () => setMostrandoLista(true);

  const flashcardsDelMazo = useMemo(
    () => (mazoActivo ? flashcards.filter((f) => (f.mazo || "General") === mazoActivo) : flashcards),
    [flashcards, mazoActivo]
  );

  // Etiquetas (flashcards.etiquetas, un text[] por tarjeta): son
  // transversales al mazo. Se pueden marcar VARIAS a la vez y el repaso se
  // queda con las tarjetas que lleven cualquiera de ellas (o, no y): pedir
  // "porcentajes y DSM-5" a la vez casi siempre daría cero tarjetas, y lo
  // que se quiere es repasar esos dos temas juntos.
  const [etiquetasActivas, setEtiquetasActivas] = useState([]);

  // Para elegir al etiquetar se ofrecen TODAS las que ya usas (da igual el
  // mazo); para filtrar, solo las que existen en lo que estás mirando.
  const todasLasEtiquetas = useMemo(() => {
    const s = new Set();
    flashcards.forEach((f) => (f.etiquetas || []).forEach((e) => s.add(e)));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [flashcards]);

  const etiquetasDelMazo = useMemo(() => {
    const s = new Set();
    flashcardsDelMazo.forEach((f) => (f.etiquetas || []).forEach((e) => s.add(e)));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [flashcardsDelMazo]);

  useEffect(() => {
    setEtiquetasActivas((prev) => {
      const validas = prev.filter((e) => etiquetasDelMazo.includes(e));
      return validas.length === prev.length ? prev : validas;
    });
  }, [etiquetasDelMazo]);

  const alternarEtiqueta = (e) =>
    setEtiquetasActivas((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));

  const flashcardsFiltradas = useMemo(
    () => (etiquetasActivas.length === 0
      ? flashcardsDelMazo
      : flashcardsDelMazo.filter((f) => (f.etiquetas || []).some((e) => etiquetasActivas.includes(e)))),
    [flashcardsDelMazo, etiquetasActivas]
  );

  const pendientes = useMemo(
    () => flashcardsFiltradas.filter((f) => {
      const p = progresoPorId[f.grupo_id || f.id];
      return !p || !p.proxima_revision || p.proxima_revision <= hoy;
    }),
    [flashcardsFiltradas, progresoPorId, hoy]
  );

  const [sesion, setSesion] = useState(null);
  const [idx, setIdx] = useState(0);
  const [revelada, setRevelada] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [numTarjetas, setNumTarjetas] = useState(TAM_SESION_FLASHCARDS);
  const [verTarjetas, setVerTarjetas] = useState(false);
  const [busquedaTarjetas, setBusquedaTarjetas] = useState("");

  // Orden "inteligente" según el feedback de dificultad dado hasta ahora:
  // primero las que se marcaron Muy difícil (se reinician, repeticiones=0),
  // luego el resto de pendientes por antigüedad de vencimiento, y al final
  // las que nunca se han visto.
  const ordenarPorPrioridad = (lista) => {
    const conPrioridad = lista.map((f) => {
      const p = progresoPorId[f.grupo_id || f.id];
      if (!p) return { f, prioridad: 2, orden: Math.random() };
      if (p.repeticiones === 0) return { f, prioridad: 0, orden: p.ultima_revision || "" };
      return { f, prioridad: 1, orden: p.proxima_revision || "" };
    });
    conPrioridad.sort((a, b) => {
      if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
      if (a.prioridad === 2) return a.orden - b.orden;
      return String(a.orden).localeCompare(String(b.orden));
    });
    return conPrioridad.map((x) => x.f);
  };

  const empezar = () => {
    const cantidad = Math.max(1, Math.min(numTarjetas || 1, pendientes.length));
    setSesion(ordenarPorPrioridad(pendientes).slice(0, cantidad));
    setIdx(0);
    setRevelada(false);
    setResumen(null);
  };

  const calificar = async (calidad) => {
    if (enviando) return;
    setEnviando(true);
    const carta = sesion[idx];
    await onRepaso(carta.grupo_id || carta.id, calidad);
    setEnviando(false);
    if (idx + 1 < sesion.length) {
      setIdx(idx + 1);
      setRevelada(false);
    } else {
      setResumen({ total: sesion.length });
      setSesion(null);
    }
  };

  if (flashcards.length === 0) {
    return (
      <div>
        <SectionTitle title="Flashcards" subtitle="Todavía no tienes tarjetas propias. Cada persona tiene su propio mazo privado — nadie más ve las tuyas." />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <NuevaFlashcard onAdd={onAdd} etiquetasExistentes={todasLasEtiquetas} />
          <ImportarFlashcards onAddBulk={onAddBulk} etiquetasExistentes={todasLasEtiquetas} />
        </div>
      </div>
    );
  }

  if (sesion) {
    const carta = sesion[idx];
    return (
      <div>
        <SectionTitle title="Flashcards" subtitle={`Tarjeta ${idx + 1} de ${sesion.length}`} />
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${(idx / sesion.length) * 100}%`, background: "#8A5A9E" }} />
        </div>
        <style>{`
          .flip-container { perspective: 1600px; margin-top: 16px; }
          .flip-inner { display: grid; width: 100%; transition: transform 0.5s; transform-style: preserve-3d; }
          .flip-inner.flipped { transform: rotateY(180deg); }
          .flip-face { grid-area: 1 / 1; min-height: 280px; backface-visibility: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; box-sizing: border-box; margin: 0; overflow-y: auto; }
          .flip-back { transform: rotateY(180deg); }
        `}</style>
        <div className="flip-container" onClick={() => setRevelada((v) => !v)} style={{ cursor: "pointer" }}>
          <div className={`flip-inner${revelada ? " flipped" : ""}`}>
            <Card className="flip-face">
              <div style={{ fontSize: 11, color: "#8A5A9E", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 18 }}>{carta.mazo}</div>
              <p style={{ fontSize: "clamp(22px, 4vw, 30px)", color: TINTA, lineHeight: 1.4, margin: 0, fontWeight: 600 }}>{carta.frontal}</p>
            </Card>
            <Card className="flip-face flip-back">
              <div style={{ fontSize: 11, color: "#8A5A9E", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 18 }}>{carta.mazo}</div>
              <p style={{ fontSize: "clamp(22px, 4vw, 30px)", color: CORRECTO, lineHeight: 1.4, margin: 0, fontWeight: 700 }}>{carta.posterior}</p>
            </Card>
          </div>
        </div>
        {!revelada ? (
          <p style={{ fontSize: 12.5, color: "#9B9689", textAlign: "center", marginTop: 14 }}>Toca la tarjeta para ver la respuesta</p>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {CALIFICACIONES_FLASHCARD.map((c) => (
              <button
                key={c.calidad}
                type="button"
                disabled={enviando}
                onClick={() => calificar(c.calidad)}
                style={{ ...styles.btnDificultad, background: c.bg, color: c.color, borderColor: c.borde, opacity: enviando ? 0.6 : 1 }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const terminoTarjetas = busquedaTarjetas.trim().toLowerCase();
  const tarjetasFiltradas = terminoTarjetas
    ? flashcardsFiltradas.filter((f) => f.frontal.toLowerCase().includes(terminoTarjetas) || f.posterior.toLowerCase().includes(terminoTarjetas))
    : flashcardsFiltradas;

  if (mostrandoLista) {
    return (
      <div>
        <SectionTitle
          title="Flashcards"
          subtitle={`Tu mazo privado — ${flashcards.length} tarjeta${flashcards.length === 1 ? "" : "s"} en ${mazos.length} mazo${mazos.length === 1 ? "" : "s"}`}
        />
        <FilaNavegacion
          icono={Layers}
          titulo="Todas las tarjetas"
          subtitulo={`${flashcards.length} tarjeta${flashcards.length === 1 ? "" : "s"} en total`}
          badge={pendientesTotal > 0 ? `${pendientesTotal} hoy` : null}
          onClick={seleccionarTodas}
        />
        {mazos.map((m) => {
          const s = statsPorMazo.get(m) || { total: 0, pendientes: 0 };
          return (
            <FilaMazoEditable
              key={m}
              icono={Layers}
              titulo={m}
              subtitulo={`${s.total} tarjeta${s.total === 1 ? "" : "s"}`}
              badge={s.pendientes > 0 ? `${s.pendientes} hoy` : null}
              onClick={() => seleccionarMazo(m)}
              onRenombrar={(nuevo) => onRenombrarMazo(m, nuevo)}
              onBorrar={() => onEliminarMazo(m)}
              avisoBorrado={`¿Borrar "${m}" y sus ${s.total} tarjeta${s.total === 1 ? "" : "s"}? No se puede deshacer.`}
              otrosMazos={mazos.filter((x) => x !== m)}
            />
          );
        })}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <NuevaFlashcard onAdd={onAdd} textoBoton="Nuevo mazo" etiquetasExistentes={todasLasEtiquetas} />
          <ImportarFlashcards onAddBulk={onAddBulk} etiquetasExistentes={todasLasEtiquetas} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={volverALista}
        style={{ ...styles.linkBtn, display: "flex", alignItems: "center", gap: 6, padding: 0, marginBottom: 14 }}
      >
        <ChevronRight size={15} style={{ transform: "rotate(180deg)" }} /> Mazos
      </button>
      <SectionTitle
        title="Flashcards"
        subtitle={`${mazoActivo ? `"${mazoActivo}"` : "Tu mazo privado"} — ${flashcardsFiltradas.length} tarjeta${flashcardsFiltradas.length === 1 ? "" : "s"}${etiquetasActivas.length > 0 ? ` de ${etiquetasActivas.join(" · ")}` : ""}`}
      />
      {etiquetasDelMazo.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Repasar solo estos temas</FieldLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <button
              type="button"
              onClick={() => setEtiquetasActivas([])}
              style={{ ...styles.chipEtiqueta, ...(etiquetasActivas.length === 0 ? styles.chipEtiquetaActiva : {}) }}
            >
              Todos
            </button>
            {etiquetasDelMazo.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => alternarEtiqueta(e)}
                style={{ ...styles.chipEtiqueta, ...(etiquetasActivas.includes(e) ? styles.chipEtiquetaActiva : {}) }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
      {resumen && (
        <Card style={{ marginBottom: 16, textAlign: "center", borderColor: CORRECTO }}>
          <p style={{ fontSize: 15, color: "#1E1C18", margin: 0 }}>
            ¡Sesión terminada! Has repasado {resumen.total} tarjeta{resumen.total === 1 ? "" : "s"}.
          </p>
        </Card>
      )}
      <Card style={{ textAlign: "center", padding: "28px 20px" }}>
        {pendientes.length === 0 ? (
          <p style={{ fontSize: 15, color: "#1E1C18", margin: 0 }}>
            No te toca repasar ninguna tarjeta{etiquetasActivas.length > 0 ? ` de ${etiquetasActivas.join(" · ")}` : mazoActivo ? ` de "${mazoActivo}"` : ""} hoy. ¡Vuelve mañana!
          </p>
        ) : (
          <>
            <p style={{ fontSize: 15, color: "#1E1C18", marginTop: 0, marginBottom: 16 }}>
              Tienes {pendientes.length} tarjeta{pendientes.length === 1 ? "" : "s"} para repasar hoy.
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 18 }}>
              <FieldLabel style={{ margin: 0 }}>¿Cuántas quieres hacer?</FieldLabel>
              <input
                type="number"
                min={1}
                max={pendientes.length}
                value={numTarjetas}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setNumTarjetas(Number.isNaN(v) ? "" : v);
                }}
                onBlur={() => setNumTarjetas((v) => Math.max(1, Math.min(v || 1, pendientes.length)))}
                style={{ ...styles.input, width: 70, textAlign: "center" }}
              />
            </div>
            <button type="button" onClick={empezar} style={{ ...styles.btnPrimary, justifyContent: "center" }}>
              Empezar repaso
            </button>
          </>
        )}
      </Card>

      <div style={{ marginTop: 32 }}>
        <button type="button" onClick={() => setVerTarjetas((v) => !v)} style={{ ...styles.linkBtn, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
          {verTarjetas ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Ver, añadir y editar tarjetas ({flashcardsFiltradas.length})
        </button>
        {verTarjetas && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <NuevaFlashcard onAdd={onAdd} mazoFijo={mazoActivo || undefined} etiquetasExistentes={todasLasEtiquetas} />
              <ImportarFlashcards onAddBulk={onAddBulk} mazoFijo={mazoActivo || undefined} etiquetasExistentes={todasLasEtiquetas} />
            </div>
            <div style={{ position: "relative", marginBottom: 14 }}>
              <Search size={16} color="#9B9689" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={busquedaTarjetas}
                onChange={(e) => setBusquedaTarjetas(e.target.value)}
                placeholder="Busca una palabra o frase dentro de las tarjetas..."
                style={{ ...styles.input, paddingLeft: 38 }}
              />
            </div>
            {tarjetasFiltradas.map((f) => (
              <FlashcardEditableCard key={f.id} f={f} onUpdate={onUpdate} onDelete={onDelete} mazos={mazos} etiquetasExistentes={todasLasEtiquetas} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilaNavegacion({ icono: Icono, titulo, subtitulo, badge, onClick }) {
  return (
    <button type="button" onClick={onClick} style={styles.filaCarpeta}>
      <span style={styles.filaCarpetaIcono}><Icono size={17} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.filaCarpetaTitulo}>{titulo}</div>
        {subtitulo && <div style={styles.filaCarpetaSubtitulo}>{subtitulo}</div>}
      </span>
      {badge != null && <span style={styles.filaCarpetaBadge}>{badge}</span>}
      <ChevronRight size={16} color="#9B9689" />
    </button>
  );
}

// Como FilaNavegacion, pero con lápiz (renombrar in situ) y papelera
// (borrar con confirmación) junto al nombre — usada para cada mazo real,
// nunca para la fila sintética "Todas las tarjetas".
function FilaMazoEditable({ icono: Icono, titulo, subtitulo, badge, onClick, onRenombrar, onBorrar, avisoBorrado, otrosMazos }) {
  const [modo, setModo] = useState("normal"); // normal | editando | enviando | confirmando
  const [nombreNuevo, setNombreNuevo] = useState(titulo);
  const [procesando, setProcesando] = useState(false);
  const destinos = otrosMazos || [];
  const [destinoElegido, setDestinoElegido] = useState(destinos[0] || "");

  if (modo === "editando") {
    return (
      <Card style={{ marginBottom: 8, padding: 12 }}>
        <input
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          autoFocus
          style={{ ...styles.input, marginBottom: 10 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={procesando || !nombreNuevo.trim()}
            onClick={async () => {
              setProcesando(true);
              const ok = await onRenombrar(nombreNuevo.trim());
              setProcesando(false);
              if (ok) setModo("normal"); else setNombreNuevo(titulo);
            }}
            style={{ ...styles.btnPrimary, flex: 1, opacity: procesando ? 0.7 : 1 }}
          >
            {procesando ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" onClick={() => { setNombreNuevo(titulo); setModo("normal"); }} style={styles.btnSecondary}>
            Cancelar
          </button>
        </div>
      </Card>
    );
  }

  // Enviar a otro mazo: se elige uno ya existente de una lista (sin escribir
  // nada) y todas las tarjetas de este mazo pasan a formar parte de él —
  // como `mazo` es solo una etiqueta compartida, "enviar" es simplemente
  // renombrar este mazo para que coincida exactamente con el destino.
  if (modo === "enviando") {
    return (
      <Card style={{ marginBottom: 8, padding: 12 }}>
        <FieldLabel>Enviar todas las tarjetas de "{titulo}" a:</FieldLabel>
        <select value={destinoElegido} onChange={(e) => setDestinoElegido(e.target.value)} style={{ ...styles.input, marginTop: 6, marginBottom: 10 }}>
          {destinos.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={procesando || !destinoElegido}
            onClick={async () => {
              setProcesando(true);
              const ok = await onRenombrar(destinoElegido);
              setProcesando(false);
              if (ok) setModo("normal");
            }}
            style={{ ...styles.btnPrimary, flex: 1, opacity: procesando ? 0.7 : 1 }}
          >
            {procesando ? "Enviando..." : `Enviar a "${destinoElegido}"`}
          </button>
          <button type="button" onClick={() => setModo("normal")} style={styles.btnSecondary}>Cancelar</button>
        </div>
      </Card>
    );
  }

  if (modo === "confirmando") {
    return (
      <Card style={{ marginBottom: 8, padding: 12, borderColor: ACENTO }}>
        <p style={{ fontSize: 13, color: TINTA, margin: "0 0 10px" }}>{avisoBorrado}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={procesando}
            onClick={async () => { setProcesando(true); await onBorrar(); setProcesando(false); }}
            style={{ ...styles.btnPrimary, flex: 1, background: ACENTO, borderColor: ACENTO, opacity: procesando ? 0.7 : 1 }}
          >
            {procesando ? "Borrando..." : "Sí, borrar"}
          </button>
          <button type="button" onClick={() => setModo("normal")} style={styles.btnSecondary}>Cancelar</button>
        </div>
      </Card>
    );
  }

  return (
    <div style={styles.filaCarpeta}>
      <button type="button" onClick={onClick} style={styles.filaCarpetaBoton}>
        <span style={styles.filaCarpetaIcono}><Icono size={17} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.filaCarpetaTitulo}>{titulo}</div>
          {subtitulo && <div style={styles.filaCarpetaSubtitulo}>{subtitulo}</div>}
        </span>
        {badge != null && <span style={styles.filaCarpetaBadge}>{badge}</span>}
      </button>
      <button type="button" onClick={() => setModo("editando")} title="Renombrar" style={styles.filaCarpetaIconBtn}>
        <Pencil size={14} />
      </button>
      {destinos.length > 0 && (
        <button type="button" onClick={() => setModo("enviando")} title="Enviar a otro mazo" style={styles.filaCarpetaIconBtn}>
          <FolderInput size={14} />
        </button>
      )}
      <button type="button" onClick={() => setModo("confirmando")} title="Borrar" style={styles.filaCarpetaIconBtn}>
        <Trash2 size={14} />
      </button>
      <ChevronRight size={16} color="#9B9689" />
    </div>
  );
}

// Etiquetar sin escribir de más: las etiquetas que ya usas se tocan para
// ponerlas o quitarlas, y el campo de texto es solo para estrenar una
// nueva. Así no acaban conviviendo "porcentajes" y "Porcentajes" por una
// mayúscula.
function SelectorEtiquetas({ existentes, valor, onChange }) {
  const [nueva, setNueva] = useState("");
  const sugerencias = (existentes || []).filter((e) => !valor.includes(e));

  const anadirEscrita = () => {
    const nuevas = parsearEtiquetas(nueva);
    if (nuevas.length === 0) return;
    onChange([...new Set([...valor, ...nuevas])]);
    setNueva("");
  };

  return (
    <div>
      {valor.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {valor.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onChange(valor.filter((x) => x !== e))}
              title="Quitar esta etiqueta"
              style={{ ...styles.chipEtiqueta, ...styles.chipEtiquetaActiva, display: "flex", alignItems: "center", gap: 5 }}
            >
              {e} <X size={11} />
            </button>
          ))}
        </div>
      )}
      {sugerencias.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {sugerencias.map((e) => (
            <button key={e} type="button" onClick={() => onChange([...valor, e])} style={styles.chipEtiqueta}>
              + {e}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={nueva}
          onChange={(ev) => setNueva(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); anadirEscrita(); } }}
          placeholder="Etiqueta nueva (ej. Psicopatología)"
          style={{ ...styles.input, flex: 1 }}
        />
        <button type="button" onClick={anadirEscrita} disabled={!nueva.trim()} style={{ ...styles.btnSecondary, opacity: nueva.trim() ? 1 : 0.5 }}>
          Añadir
        </button>
      </div>
    </div>
  );
}

// `mazoFijo` es el mazo en el que se está (ya dentro de él, sin elegir
// destino): la tarjeta se añade directamente ahí y el formulario no se
// cierra al guardar, para poder meter varias seguidas rápido. Sin
// `mazoFijo` (solo en el listado raíz) pide el nombre del mazo nuevo que
// se va a crear — no hay forma de añadir una tarjeta a "otro mazo más" ni
// de elegir entre varios existentes, cada tarjeta va a un único mazo.
function NuevaFlashcard({ onAdd, mazoFijo, textoBoton, etiquetasExistentes }) {
  const [abierto, setAbierto] = useState(false);
  const [mazo, setMazo] = useState("");
  const [frontal, setFrontal] = useState("");
  const [posterior, setPosterior] = useState("");
  const [etiquetas, setEtiquetas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const frontalRef = useRef(null);
  const destino = mazoFijo || mazo.trim();

  const guardar = async () => {
    if (!frontal.trim() || !posterior.trim() || !destino) return;
    setGuardando(true);
    const ok = await onAdd({ mazo: destino, frontal: frontal.trim(), posterior: posterior.trim(), etiquetas });
    setGuardando(false);
    if (!ok) return;
    // Las etiquetas NO se limpian: así pones "porcentajes" una vez y metes
    // diez tarjetas seguidas con ella sin volver a escribirla.
    setFrontal("");
    setPosterior("");
    if (mazoFijo) {
      frontalRef.current?.focus();
    } else {
      setMazo("");
      setAbierto(false);
    }
  };

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} style={styles.btnSecondary}>
        <Plus size={14} style={{ marginRight: 4 }} /> {textoBoton || "Añadir tarjeta"}
      </button>
    );
  }

  return (
    <Card style={{ marginBottom: 14, borderLeft: "3px solid #8A5A9E", width: "100%" }}>
      {!mazoFijo && (
        <>
          <FieldLabel>Nombre del mazo nuevo</FieldLabel>
          <input value={mazo} onChange={(e) => setMazo(e.target.value)} placeholder='Ej. "Trastornos de personalidad"' style={{ ...styles.input, marginBottom: 12 }} />
        </>
      )}
      <FieldLabel>Frontal</FieldLabel>
      <textarea ref={frontalRef} value={frontal} onChange={(e) => setFrontal(e.target.value)} style={{ ...styles.input, minHeight: 60 }} />
      <FieldLabel style={{ marginTop: 12 }}>Posterior</FieldLabel>
      <textarea value={posterior} onChange={(e) => setPosterior(e.target.value)} style={{ ...styles.input, minHeight: 60 }} />
      <FieldLabel style={{ marginTop: 12 }}>Etiquetas del tema (opcional)</FieldLabel>
      <SelectorEtiquetas existentes={etiquetasExistentes} valor={etiquetas} onChange={setEtiquetas} />
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="button" onClick={guardar} disabled={guardando || !frontal.trim() || !posterior.trim() || !destino} style={{ ...styles.btnPrimary, flex: 1, opacity: guardando ? 0.6 : 1 }}>{guardando ? "Añadiendo..." : "Añadir tarjeta"}</button>
        <button type="button" onClick={() => { setFrontal(""); setPosterior(""); setMazo(""); setEtiquetas([]); setAbierto(false); }} style={styles.btnSecondary}>{mazoFijo ? "Cerrar" : "Cancelar"}</button>
      </div>
    </Card>
  );
}

function ImportarFlashcards({ onAddBulk, mazoFijo, etiquetasExistentes }) {
  const [abierto, setAbierto] = useState(false);
  const [mazo, setMazo] = useState("");
  const [texto, setTexto] = useState("");
  const [etiquetas, setEtiquetas] = useState([]);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const destino = mazoFijo || mazo.trim();

  const parsear = (bruto) => {
    const separador = bruto.includes("\t") ? "\t" : bruto.includes(" | ") ? " | " : ";";
    return bruto
      .split("\n")
      .map((linea) => linea.trim())
      .filter(Boolean)
      .map((linea) => {
        const partes = linea.split(separador);
        if (partes.length < 2) return null;
        const frontal = partes[0].trim();
        const posterior = partes.slice(1).join(separador).trim();
        if (!frontal || !posterior) return null;
        return { frontal, posterior };
      })
      .filter(Boolean);
  };

  const tarjetas = parsear(texto);

  const importar = async () => {
    if (tarjetas.length === 0 || !destino) return;
    setImportando(true);
    const n = await onAddBulk(destino, tarjetas, etiquetas);
    setImportando(false);
    setResultado(n);
    if (n > 0) setTexto("");
  };

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} style={styles.btnSecondary}>
        <ListChecks size={14} style={{ marginRight: 4 }} /> Importar tarjetas
      </button>
    );
  }

  return (
    <Card style={{ marginBottom: 14, borderLeft: "3px solid #8A5A9E", width: "100%" }}>
      {!mazoFijo && (
        <>
          <FieldLabel>Nombre del mazo nuevo</FieldLabel>
          <input value={mazo} onChange={(e) => setMazo(e.target.value)} placeholder='Ej. "Trastornos de personalidad"' style={{ ...styles.input, marginBottom: 12 }} />
        </>
      )}
      <FieldLabel>Pega tus tarjetas, una por línea</FieldLabel>
      <p style={{ fontSize: 12, color: "#9B9689", margin: "0 0 8px" }}>
        Cada línea es una tarjeta: frontal y posterior separados por tabulador, " | " o ";" — el formato en que se exportan la mayoría de mazos de Anki o una hoja de cálculo.
      </p>
      <textarea
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setResultado(null); }}
        placeholder={"¿Qué es la prevalencia? | Proporción de casos existentes en un momento dado\nOtra pregunta | Su respuesta"}
        style={{ ...styles.input, minHeight: 140, fontFamily: "monospace", fontSize: 13 }}
      />
      <p style={{ fontSize: 12.5, color: TINTA_SUAVE, margin: "8px 0 0" }}>
        {tarjetas.length} tarjeta{tarjetas.length === 1 ? "" : "s"} detectada{tarjetas.length === 1 ? "" : "s"}
        {texto.trim() && tarjetas.length === 0 ? " — revisa el separador de cada línea." : "."}
      </p>
      <FieldLabel style={{ marginTop: 12 }}>Etiquetas del tema para todas (opcional)</FieldLabel>
      <SelectorEtiquetas existentes={etiquetasExistentes} valor={etiquetas} onChange={setEtiquetas} />
      {resultado !== null && (
        <p style={{ fontSize: 13, color: resultado > 0 ? CORRECTO : ACENTO, margin: "4px 0 0" }}>
          {resultado > 0 ? `¡Importadas ${resultado} tarjetas!` : "No se pudo importar. Inténtalo de nuevo."}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="button" onClick={importar} disabled={importando || tarjetas.length === 0 || !destino} style={{ ...styles.btnPrimary, flex: 1, opacity: importando || tarjetas.length === 0 || !destino ? 0.6 : 1 }}>
          {importando ? "Importando..." : `Importar ${tarjetas.length || ""} tarjeta${tarjetas.length === 1 ? "" : "s"}`}
        </button>
        <button type="button" onClick={() => { setTexto(""); setResultado(null); setAbierto(false); }} style={styles.btnSecondary}>Cancelar</button>
      </div>
    </Card>
  );
}

function FlashcardEditableCard({ f, onUpdate, onDelete, mazos, etiquetasExistentes }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moviendo, setMoviendo] = useState(false);
  const [frontal, setFrontal] = useState(f.frontal);
  const [posterior, setPosterior] = useState(f.posterior);
  const [etiquetas, setEtiquetas] = useState(f.etiquetas || []);
  const [saving, setSaving] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const otrosMazos = (mazos || []).filter((m) => m !== (f.mazo || "General"));
  const [mazoDestino, setMazoDestino] = useState(otrosMazos[0] || "");

  const guardar = async () => {
    if (!frontal.trim() || !posterior.trim()) return;
    setSaving(true);
    const ok = await onUpdate(f.id, { frontal: frontal.trim(), posterior: posterior.trim(), etiquetas });
    setSaving(false);
    if (ok) setEditing(false);
  };

  const mover = async () => {
    if (!mazoDestino) return;
    setSaving(true);
    const ok = await onUpdate(f.id, { mazo: mazoDestino });
    setSaving(false);
    if (ok) setMoviendo(false);
  };

  const borrar = async () => {
    setBorrando(true);
    await onDelete(f.id);
    setBorrando(false);
  };

  if (moviendo) {
    return (
      <Card style={{ marginBottom: 10, borderLeft: "3px solid #8A5A9E" }}>
        <FieldLabel>Mover esta tarjeta a:</FieldLabel>
        <select value={mazoDestino} onChange={(e) => setMazoDestino(e.target.value)} style={{ ...styles.input, marginTop: 6, marginBottom: 10 }}>
          {otrosMazos.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={mover} disabled={saving || !mazoDestino} style={{ ...styles.btnPrimary, flex: 1, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Moviendo..." : `Mover a "${mazoDestino}"`}
          </button>
          <button type="button" onClick={() => setMoviendo(false)} style={styles.btnSecondary}>Cancelar</button>
        </div>
      </Card>
    );
  }

  if (editing) {
    return (
      <Card style={{ marginBottom: 10, borderLeft: "3px solid #C89B3C" }}>
        <FieldLabel>Frontal</FieldLabel>
        <textarea value={frontal} onChange={(e) => setFrontal(e.target.value)} style={{ ...styles.input, minHeight: 60 }} />
        <FieldLabel style={{ marginTop: 12 }}>Posterior</FieldLabel>
        <textarea value={posterior} onChange={(e) => setPosterior(e.target.value)} style={{ ...styles.input, minHeight: 60 }} />
        <FieldLabel style={{ marginTop: 12 }}>Etiquetas del tema</FieldLabel>
        <SelectorEtiquetas existentes={etiquetasExistentes} valor={etiquetas} onChange={setEtiquetas} />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={guardar} disabled={saving} style={{ ...styles.btnPrimary, flex: 1 }}>{saving ? "Guardando..." : "Guardar cambios"}</button>
          <button type="button" onClick={() => { setFrontal(f.frontal); setPosterior(f.posterior); setEtiquetas(f.etiquetas || []); setEditing(false); }} style={styles.btnSecondary}>Cancelar</button>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 10 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...styles.expandBtn, width: "100%" }}>
        <div style={{ textAlign: "left", flex: 1 }}>
          <div style={{ fontSize: 11, color: "#8A5A9E", marginBottom: 4 }}>{f.mazo}</div>
          <div style={{ fontSize: 14, color: "#1E1C18", lineHeight: 1.4 }}>{f.frontal}</div>
          {(f.etiquetas || []).length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
              {f.etiquetas.map((e) => <span key={e} style={styles.etiquetaTarjeta}>{e}</span>)}
            </div>
          )}
        </div>
        {open ? <ChevronDown size={16} color="#9B9689" /> : <ChevronRight size={16} color="#9B9689" />}
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 14, color: CORRECTO, lineHeight: 1.5, fontWeight: 600, margin: 0 }}>{f.posterior}</p>
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setEditing(true)} style={styles.btnSecondary}>
              <Pencil size={13} style={{ marginRight: 4 }} /> Editar
            </button>
            {otrosMazos.length > 0 && (
              <button type="button" onClick={() => setMoviendo(true)} style={styles.btnSecondary}>
                <FolderInput size={13} style={{ marginRight: 4 }} /> Mover
              </button>
            )}
            {confirmarBorrar ? (
              <>
                <button type="button" onClick={borrar} disabled={borrando} style={{ ...styles.btnSecondary, color: ACENTO, borderColor: ACENTO }}>
                  {borrando ? "Borrando..." : "¿Seguro? Borrar"}
                </button>
                <button type="button" onClick={() => setConfirmarBorrar(false)} style={styles.btnSecondary}>Cancelar</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmarBorrar(true)} style={styles.btnSecondary}>
                <Trash2 size={13} style={{ marginRight: 4 }} /> Borrar
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function EstadisticaItem({ icono: Icono, color, valor, etiqueta, detalle, borde }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "0 10px", borderLeft: borde ? "1px solid #C9C5B7" : "none" }}>
      <Icono size={18} color={color} strokeWidth={1.7} style={{ marginBottom: 6 }} />
      <div style={styles.perfilStatNum}>{valor}</div>
      <div style={styles.perfilStatLabel}>{etiqueta}</div>
      {detalle && <div style={{ fontSize: 10.5, color: "#B7BEC8", marginTop: 3 }}>{detalle}</div>}
    </div>
  );
}

function PreguntasPlegables({ titulo, subtitulo, items, etiquetaItem, abiertaId, setAbiertaId, favoritos, onToggleFavorito }) {
  return (
    <div>
      <SectionTitle title={titulo} subtitle={subtitulo} />
      {items.map((f) => (
        <Card key={f.pregunta_id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <button type="button" onClick={() => setAbiertaId(abiertaId === f.pregunta_id ? null : f.pregunta_id)} style={{ ...styles.expandBtn, flex: 1 }}>
              <div style={{ textAlign: "left", flex: 1 }}>
                <div style={{ fontSize: 11, color: "#9B9689", marginBottom: 4 }}>
                  {f.pregunta.curso} · {f.pregunta.tema}{etiquetaItem ? ` · ${etiquetaItem(f)}` : ""}
                </div>
                <div style={{ fontSize: 14, color: "#1E1C18", lineHeight: 1.4 }}>{f.pregunta.pregunta}</div>
              </div>
              {abiertaId === f.pregunta_id ? <ChevronDown size={16} color="#9B9689" /> : <ChevronRight size={16} color="#9B9689" />}
            </button>
            <FavoritoBtn pregunta={f.pregunta} favoritos={favoritos} onToggle={onToggleFavorito} />
          </div>
          {abiertaId === f.pregunta_id && (
            <div style={{ marginTop: 12 }}>
              {f.pregunta.opciones.map((op, oi) => (
                <div key={oi} style={{ ...styles.opcion, cursor: "default", ...(oi === f.pregunta.correcta ? styles.opcionCorrectaLegacy : {}) }}>
                  {oi === f.pregunta.correcta && <Check size={13} color={CORRECTO} />}
                  {op}
                </div>
              ))}
              {f.pregunta.explicacion && <p style={{ fontSize: 13, color: "#6E6A61", marginTop: 10, lineHeight: 1.5 }}>{f.pregunta.explicacion}</p>}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function FalloRepetible({ f, index, favoritos, onToggleFavorito }) {
  const [abierta, setAbierta] = useState(false);
  const [repitiendo, setRepitiendo] = useState(false);
  const [selected, setSelected] = useState(null);
  const q = f.pregunta;

  const toggleAbierta = () => {
    setAbierta((v) => !v);
    setRepitiendo(false);
    setSelected(null);
  };

  return (
    <Card style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={toggleAbierta} style={{ ...styles.expandBtn, flex: 1 }}>
          <div style={{ textAlign: "left", flex: 1 }}>
            <div style={{ fontSize: 14, color: TINTA, fontWeight: 600 }}>
              {q.curso} · Pregunta {index}
            </div>
            <div style={{ fontSize: 11, color: "#9B9689", marginTop: 2 }}>
              fallada {f.veces} {f.veces === 1 ? "vez" : "veces"}
            </div>
          </div>
          {abierta ? <ChevronDown size={16} color="#9B9689" /> : <ChevronRight size={16} color="#9B9689" />}
        </button>
        <FavoritoBtn pregunta={q} favoritos={favoritos} onToggle={onToggleFavorito} />
      </div>
      {abierta && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 14, color: TINTA, lineHeight: 1.4, marginBottom: 10 }}>{q.pregunta}</div>
          {!repitiendo ? (
            <button type="button" onClick={() => setRepitiendo(true)} style={styles.linkBtn}>
              Repetir
            </button>
          ) : (
            <div>
              {q.opciones.map((op, i) => {
                let estilo = { ...styles.daypoOpcion, marginBottom: 8, padding: "12px 14px", fontSize: 14 };
                if (selected != null) {
                  if (i === q.correcta) estilo = { ...estilo, ...styles.daypoOpcionCorrecta };
                  else if (i === selected) estilo = { ...estilo, ...styles.daypoOpcionIncorrecta };
                }
                return (
                  <button type="button" key={i} onClick={() => selected == null && setSelected(i)} disabled={selected != null} style={estilo}>
                    <span style={styles.daypoLetra}>{String.fromCharCode(65 + i)}</span>
                    <span style={{ flex: 1 }}>{op}</span>
                    {selected != null && i === q.correcta && <Check size={16} color={CORRECTO} />}
                    {selected != null && i === selected && i !== q.correcta && <X size={16} color={ACENTO} />}
                  </button>
                );
              })}
              {selected != null && (
                <>
                  {q.explicacion && <p style={{ fontSize: 13, color: TINTA_SUAVE, margin: "4px 0 8px", lineHeight: 1.5 }}>{q.explicacion}</p>}
                  <button type="button" onClick={() => setSelected(null)} style={styles.linkBtn}>
                    Repetir de nuevo
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function EnRachaBadge() {
  return (
    <span style={styles.enRachaBadge}>
      <span style={{ position: "relative", width: 6, height: 6, flexShrink: 0 }}>
        <span style={styles.enRachaPunto} />
        <span style={{ ...styles.enRachaPunto, animation: "pulsoEnLinea 1.8s ease-out infinite" }} />
      </span>
      en racha
    </span>
  );
}

function Ranking({ rachas, user }) {
  const [modo, setModo] = useState("quiz");
  const campoRecord = modo === "quiz" ? "racha_record" : "racha_duelos_record";
  const campoVivo = modo === "quiz" ? "racha_actual" : "racha_duelo_actual";
  const IconoModo = modo === "quiz" ? Flame : Swords;
  const colorModo = modo === "quiz" ? "#C89B3C" : "#A6362B";

  const filas = [...rachas]
    .filter((r) => (r[campoRecord] || 0) > 0)
    .sort((a, b) => (b[campoRecord] || 0) - (a[campoRecord] || 0));

  const lunesActual = lunesDeLaSemana(new Date());
  const ligaSemanal = [...rachas]
    .filter((r) => r.semana_actual === lunesActual && (r.correctas_semana || 0) > 0)
    .sort((a, b) => (b.correctas_semana || 0) - (a.correctas_semana || 0));

  return (
    <div>
      <SectionTitle title="Ranking" />

      <div style={styles.tabsOrigen}>
        <button type="button" onClick={() => setModo("quiz")} style={{ ...styles.tabOrigenBtn, ...(modo === "quiz" ? styles.tabOrigenActivo : {}) }}>
          Autoevaluaciones
        </button>
        <button type="button" onClick={() => setModo("duelo")} style={{ ...styles.tabOrigenBtn, ...(modo === "duelo" ? styles.tabOrigenActivo : {}) }}>
          Duelo
        </button>
      </div>

      <div style={styles.tablaRanking}>
        {filas.length === 0 ? (
          <p style={{ fontSize: 13, color: TINTA_TENUE, padding: "6px 2px 2px" }}>Todavía no hay récords en este modo.</p>
        ) : (
          filas.map((r, i) => {
            const enVivo = (r[campoVivo] || 0) > 0;
            return (
              <div key={r.name} style={{ ...styles.rankRow, background: r.name === user.name ? ACENTO_SUAVE : styles.rankRow.background }}>
                <span style={{ width: 24, fontSize: 14, color: i < 3 ? "#C89B3C" : TINTA_TENUE, fontFamily: "var(--font-display)" }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 15, color: TINTA }}>{r.name}</span>
                {enVivo && <EnRachaBadge />}
                <span style={{ fontSize: 16, color: colorModo, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                  <IconoModo size={14} /> {r[campoRecord]}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: 30 }}>
        <SectionTitle title="Liga semanal" subtitle="Aciertos desde el lunes. Se reinicia cada semana." />
        <ColumnaRanking titulo="Esta semana" icono={Trophy} color={ACENTO}>
          <ListaRachas
            datos={ligaSemanal} campo="correctas_semana" icono={Trophy} colorIcono={ACENTO}
            user={user} vacioTexto="Todavía nadie ha respondido esta semana."
          />
        </ColumnaRanking>
      </div>
    </div>
  );
}

function ColumnaRanking({ titulo, icono: Icono, color, children }) {
  return (
    <div style={{ ...styles.columnaRanking, borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <Icono size={15} color={color} />
        <span style={{ fontSize: 14, fontWeight: 600, color: "#1E1C18" }}>{titulo}</span>
      </div>
      {children}
    </div>
  );
}

function ListaRachas({ datos, campo, icono: Icono, colorIcono, user, vacioTexto, enVivo }) {
  if (datos.length === 0) {
    return <p style={{ fontSize: 13, color: "#9B9689", padding: "6px 0 4px" }}>{vacioTexto}</p>;
  }
  return (
    <>
      {datos.map((r, i) => (
        <div key={r.name} style={{ ...styles.rankRow, background: r.name === user.name ? ACENTO_SUAVE : styles.rankRow.background }}>
          <span style={{ width: 24, fontSize: 14, color: i < 3 ? "#C89B3C" : "#9B9689", fontFamily: "var(--font-display)" }}>{i + 1}</span>
          <span style={{ flex: 1, fontSize: 15, color: "#1E1C18" }}>{r.name}</span>
          {enVivo && <EnRachaBadge />}
          <span style={{ fontSize: 16, color: colorIcono, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
            <Icono size={14} /> {r[campo]}
          </span>
        </div>
      ))}
    </>
  );
}

function SectionTitle({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
      <div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "#1E1C18", margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: "#9B9689", margin: "4px 0 0" }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Card({ children, style, className }) {
  return <div className={className} style={{ ...styles.card, ...style }}>{children}</div>;
}

function FieldLabel({ children, style }) {
  return <div style={{ fontSize: 12, color: "#6E6A61", marginBottom: 6, ...style }}>{children}</div>;
}

const SOMBRA_SUAVE = "0 1px 2px rgba(30,28,24,0.07), 0 1px 6px rgba(30,28,24,0.05)";
const styles = {
  app: { fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#EEECE4", minHeight: "100vh", color: TINTA, WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none", fontSize: 17 },
  center: { display: "flex", alignItems: "center", justifyContent: "center" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${RAYA}` },
  nav: { display: "flex", gap: 6, padding: "0 18px", borderBottom: `1px solid ${RAYA}`, overflowX: "auto" },
  navBtn: { display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: "16px 14px", fontSize: 16, cursor: "pointer", whiteSpace: "nowrap" },
  navDot: { position: "absolute", top: 10, right: 6, width: 8, height: 8, borderRadius: "50%", background: ACENTO, animation: "dueloPulso 1.2s ease-in-out infinite" },
  tabsOrigen: { display: "flex", gap: 8, marginBottom: 14 },
  tabOrigenBtn: { flex: 1, padding: "11px 14px", borderRadius: 12, border: `1.5px solid ${RAYA}`, background: "#fff", color: TINTA_SUAVE, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  tabOrigenActivo: { background: TINTA, borderColor: TINTA, color: "#fff" },
  tabOrigenActivoIA: { background: "#8A5A9E", borderColor: "#8A5A9E", color: "#fff" },
  filaCarpeta: { display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "#fff", border: `1.5px solid ${RAYA}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", marginBottom: 8 },
  filaCarpetaBoton: { display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, margin: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" },
  filaCarpetaIcono: { display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, background: "#F2EFE7", color: "#8A5A9E", flexShrink: 0 },
  filaCarpetaTitulo: { fontSize: 15, fontWeight: 700, color: TINTA },
  filaCarpetaSubtitulo: { fontSize: 12, color: "#9B9689", marginTop: 2 },
  filaCarpetaBadge: { fontSize: 12, fontWeight: 700, color: TINTA_SUAVE, background: "#F2EFE7", borderRadius: 20, padding: "4px 10px", whiteSpace: "nowrap" },
  filaCarpetaIconBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: "none", background: "none", color: "#9B9689", cursor: "pointer", flexShrink: 0 },
  rachaDiasChip: { display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: TINTA_TENUE, background: "#F2EFE7", borderRadius: 20, padding: "5px 10px" },
  rachaDiasChipActiva: { color: ACENTO, background: ACENTO_SUAVE },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(30,28,24,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 },
  dropdownCatcher: { position: "fixed", inset: 0, zIndex: 39 },
  logrosDropdown: { position: "absolute", top: "calc(100% + 10px)", right: 0, width: 320, maxWidth: "88vw", background: "#fff", border: `1.5px solid ${RAYA_FUERTE}`, borderRadius: 18, boxShadow: SOMBRA_SUAVE, padding: 16, zIndex: 40 },
  pantallaCompleta: { position: "fixed", inset: 0, background: "#EEECE4", zIndex: 50, overflowY: "auto" },
  pantallaCompletaCierre: { display: "flex", justifyContent: "flex-end", padding: "14px 18px 0" },
  modalCard: { background: "#fff", borderRadius: 18, padding: 24, maxWidth: 340, width: "100%", boxShadow: "0 12px 40px rgba(30,28,24,0.20)" },
  escalaBtn: { flex: 1, padding: "10px 0", borderRadius: 10, border: `1.5px solid ${RAYA}`, background: "#fff", color: TINTA, fontWeight: 700, cursor: "pointer" },
  escalaBtnActivo: { borderColor: TINTA, background: TINTA, color: "#fff" },
  colorSwatch: { width: 30, height: 30, borderRadius: "50%", border: "2px solid", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  perfilStatNum: { fontSize: 24, fontFamily: "var(--font-display)", fontWeight: 600, color: TINTA },
  perfilStatLabel: { fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", textTransform: "uppercase", letterSpacing: 0.5, color: TINTA_TENUE, marginTop: 3, lineHeight: 1.4 },
  linkBtn: { background: "none", border: "none", color: ACENTO, fontSize: 13, cursor: "pointer", padding: "10px 0", fontWeight: 600 },
  btnDificultad: { flex: "1 1 auto", minWidth: 110, padding: "13px 10px", borderRadius: 12, border: "1.5px solid", fontSize: 13.5, fontWeight: 700, cursor: "pointer", textAlign: "center" },
  insigniasGrid: { display: "flex", gap: 8, flexWrap: "wrap" },
  insigniaCard: { flex: "1 1 84px", minWidth: 78, textAlign: "center", background: "#fff", border: "1.5px solid", borderRadius: 14, padding: "12px 6px" },
  puntoVivo: { width: 8, height: 8, borderRadius: "50%", background: CORRECTO, animation: "dueloPulso 1.4s ease-in-out infinite" },
  h3Ranking: { fontFamily: "var(--font-display)", fontSize: 21, color: TINTA, margin: 0 },
  rankingColumnas: { display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 4, alignItems: "stretch" },
  columnaRanking: { flex: 1, minWidth: 240, background: "#F1ECDD", border: `1.5px solid ${RAYA}`, borderRadius: 16, padding: "14px 14px 16px", boxShadow: SOMBRA_SUAVE },
  tablaRanking: { background: "#F1ECDD", border: `1.5px solid ${RAYA_FUERTE}`, borderRadius: 16, padding: "14px 14px 16px", boxShadow: SOMBRA_SUAVE },
  enRachaBadge: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: ORO, textTransform: "uppercase", letterSpacing: 0.3 },
  enRachaPunto: { position: "absolute", inset: 0, borderRadius: "50%", background: ORO },
  dueloAviso: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "calc(100% - 36px)", margin: "14px 18px 0", padding: "12px 16px", borderRadius: 14, border: "none", background: ACENTO, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", animation: "dueloPulso 1.6s ease-in-out infinite" },
  rachaAviso: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "calc(100% - 36px)", margin: "14px 18px 0", padding: "11px 16px", borderRadius: 14, border: `1.5px solid ${ACENTO_SUAVE}`, background: ACENTO_SUAVE, color: "#7A2E21", fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  main: { padding: "24px 22px 50px", maxWidth: 820, margin: "0 auto" },
  card: { background: "#F6F4EC", border: `1.5px solid ${RAYA}`, borderRadius: 16, padding: 26, boxShadow: SOMBRA_SUAVE },
  authCard: { textAlign: "left", borderRadius: 20, border: `1.5px solid ${RAYA}`, boxShadow: "0 18px 48px rgba(30,28,24,0.10)" },
  input: { width: "100%", padding: "13px 15px", borderRadius: 12, border: "1.5px solid #D9D5C4", fontSize: 17, fontFamily: "inherit", color: TINTA, boxSizing: "border-box" },
  select: { width: "100%", padding: "13px 15px", borderRadius: 12, border: "1.5px solid #D9D5C4", fontSize: 17, fontFamily: "inherit", color: TINTA, background: "#fff" },
  btnPrimary: { background: TINTA, color: "#fff", border: "none", borderRadius: 12, padding: "15px 22px", fontSize: 17, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  btnSecondary: { background: "transparent", color: TINTA, border: `1.5px solid ${TINTA}`, borderRadius: 12, padding: "12px 18px", fontSize: 16, cursor: "pointer", display: "inline-flex", alignItems: "center" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: 6 },
  chip: { border: "1.5px solid", borderRadius: 22, padding: "9px 18px", fontSize: 16, cursor: "pointer" },
  chipEtiqueta: { border: `1.5px solid ${RAYA}`, borderRadius: 20, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, background: "#fff", color: TINTA_SUAVE, cursor: "pointer" },
  chipEtiquetaActiva: { background: TINTA, borderColor: TINTA, color: "#fff" },
  etiquetaTarjeta: { border: `1px solid ${RAYA}`, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 600, color: TINTA_SUAVE, background: "#F2EFE7" },
  option: { display: "block", width: "100%", textAlign: "left", padding: "16px 18px", borderRadius: 14, border: `1.5px solid ${RAYA}`, marginBottom: 10, fontSize: 18, cursor: "pointer", color: TINTA, background: "#F6F4EC" },
  runHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  progressTrack: { height: 4, background: RAYA, borderRadius: 2, marginTop: 10 },
  progressFill: { height: 4, background: TINTA, borderRadius: 2, transition: "width .3s" },
  cuadroPregunta: { width: 40, height: 40, borderRadius: 12, border: "2px solid", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  expandBtn: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" },
  rankRow: { display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", border: `1.5px solid ${RAYA}`, borderRadius: 14, marginBottom: 8, fontSize: 16, background: "#F6F4EC" },
  vsHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px 6px", borderBottom: `1px solid ${RAYA}` },
  choqueOverlay: { position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 64, marginBottom: 2 },
  choqueDestello: { position: "absolute", top: "50%", left: "50%", width: 30, height: 30, borderRadius: "50%", background: `radial-gradient(circle, ${ACENTO_SUAVE} 0%, transparent 70%)`, pointerEvents: "none" },
  celebracionOverlay: { position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 55 },
  daypoCard: { background: "#F6F4EC", border: `1.5px solid ${RAYA}`, borderRadius: 18, padding: 26, boxShadow: SOMBRA_SUAVE },
  daypoPregunta: { fontFamily: "var(--font-display)", fontWeight: 470, fontSize: 22, color: TINTA, lineHeight: 1.4, marginBottom: 20 },
  daypoOpcion: { display: "flex", alignItems: "center", gap: 14, width: "100%", boxSizing: "border-box", textAlign: "left", padding: "16px 18px", borderRadius: 14, border: `1.5px solid ${RAYA}`, marginBottom: 10, fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 15.5, color: TINTA, background: "#F6F4EC", cursor: "pointer", WebkitAppearance: "none", appearance: "none", outline: "none" },
  daypoOpcionCorrecta: { borderColor: CORRECTO, borderWidth: 2, background: CORRECTO_SUAVE },
  daypoOpcionIncorrecta: { borderColor: ACENTO, borderWidth: 2, background: ACENTO_SUAVE },
  daypoLetra: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", border: `1px solid ${RAYA}`, fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, flexShrink: 0, color: TINTA_SUAVE },
  daypoFeedback: { fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 14.5, fontWeight: 600, padding: "13px 16px", borderRadius: 14, marginTop: 10 },
  daypoFeedbackOk: { background: CORRECTO_SUAVE, color: CORRECTO },
  daypoFeedbackMal: { background: ACENTO_SUAVE, color: ACENTO },
  opcion: { display: "block", width: "100%", textAlign: "left", padding: "11px 14px", borderRadius: 10, border: `1px solid ${RAYA}`, marginBottom: 8, fontSize: 14, cursor: "pointer", color: TINTA },
  opcionCorrectaLegacy: { borderColor: CORRECTO, background: CORRECTO_SUAVE, display: "flex", alignItems: "center", gap: 8 },
};
