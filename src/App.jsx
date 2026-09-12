import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Compass, ListChecks, Trophy, Clock, ChevronRight, ChevronDown,
  Plus, Check, X, Loader2, User, LogOut, Flag, Pencil, Trash2,
   Zap, Heart, Swords, Flame, Sparkles, Star, Award, Target, Settings,
   Medal, Gem, Crown, Search, Layers, Lightbulb
} from "lucide-react";
import { supabase } from "./supabaseClient";
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

  useEffect(() => { savePersonal("pir-ajustes", ajustes); }, [ajustes]);

  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const qData = await fetchTodasPreguntas();
        const { data: rData, error: rErr } = await supabase
          .from("ranking")
          .select("*")
          .order("pct", { ascending: false })
          .limit(100);
        if (rErr) throw rErr;
        const { data: rachasData } = await supabase.from("rachas").select("*");
        const { data: flashcardsData } = await supabase.from("flashcards").select("*");
        setUser(usuarioFromSession(sessionData && sessionData.session));
        setQuestions(qData || []);
        setRanking(rData || []);
        setRachas(rachasData || []);
        setFlashcards(flashcardsData || []);
        setReady(true);
      } catch (err) {
        setLoadError(err && err.message ? err.message : String(err));
        setReady(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(usuarioFromSession(session));
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
    let activo = true;
    (async () => {
      const { data: fData } = await supabase.from("fallos").select("*").eq("name", user.name);
      const { data: favData } = await supabase.from("favoritos").select("*").eq("name", user.name);
      const { data: progresoData } = await supabase.from("flashcards_progreso").select("*").eq("name", user.name);
      if (activo) {
        setFallos(fData || []);
        setFavoritos(favData || []);
        setFlashcardsProgreso(progresoData || []);
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

  const handleSignup = async (username, password) => {
    const errorUsuario = validarUsuario(username);
    if (errorUsuario) return { error: errorUsuario };
    if (!password || password.length < 6) return { error: "La contraseña debe tener al menos 6 caracteres." };
    const limpio = username.trim();
    const { error } = await supabase.auth.signUp({
      email: emailDeUsuario(limpio),
      password,
      options: { data: { username: limpio } },
    });
    if (error) {
      if (/registered|exists/i.test(error.message || "")) return { error: "Ese nombre de usuario ya está en uso. Elige otro." };
      return { error: error.message || "No se pudo crear la cuenta." };
    }
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
    if (!error && data && data[0]) setQuestions((prev) => [...prev, data[0]]);
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
    }
    return !error;
  };

  const deleteQuestion = async (id) => {
    const { error } = await supabase.from("preguntas").delete().eq("id", id);
    if (!error) setQuestions((prev) => prev.filter((p) => p.id !== id));
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

  const updateFlashcard = async (id, f) => {
    const { data, error } = await supabase
      .from("flashcards")
      .update({ frontal: f.frontal, posterior: f.posterior })
      .eq("id", id)
      .select();
    if (!error && data && data[0]) {
      setFlashcards((prev) => prev.map((p) => (p.id === id ? data[0] : p)));
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
        `}</style>
        <Header
          user={user} onLogout={handleLogout} miRacha={rachas.find((r) => r.name === user.name)} onAjustes={() => setMostrarAjustes(true)}
          questions={questions} onAddQuestion={addQuestion} onUpdateQuestion={updateQuestion} onDeleteQuestion={deleteQuestion}
          favoritos={favoritos} onToggleFavorito={toggleFavorito} rachas={rachas} onGirarRuleta={girarRuleta}
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
            />
          )}
          {section === "perfil" && (
            <MiPerfil
              user={user}
              miRacha={rachas.find((r) => r.name === user.name)}
              questions={questions}
              fallos={fallos}
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
              favoritos={favoritos}
              onToggleFavorito={toggleFavorito}
              miRacha={rachas.find((r) => r.name === user.name)}
            />
          )}
          {section === "duelo" && (
            <Duelo
              user={user}
              questions={questions}
              onDueloEnd={registrarResultadoDuelo}
              onProgresoDiario={registrarProgresoDiario}
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

function AuthScreen({ onLogin, onSignup }) {
  const [modo, setModo] = useState("login");
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
    const resultado = modo === "login" ? await onLogin(username, password) : await onSignup(username, password);
    setCargando(false);
    if (resultado.error) {
      setError(resultado.error);
    } else if (modo === "signup") {
      setCuentaCreada(true);
    }
  };

  const tabPortada = { flex: 1, padding: "15px 16px", borderRadius: 14, border: `1.5px solid ${PORTADA_BORDE}`, background: "#241D13", color: "#B8AB8C", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
  const tabPortadaActivo = { background: PORTADA_DORADO, border: `1.5px solid ${PORTADA_DORADO}`, color: PORTADA_TARJETA };
  const inputPortada = { ...styles.input, background: "#241D13", border: `1.5px solid ${PORTADA_BORDE}`, color: PORTADA_TEXTO, padding: "18px 20px", fontSize: 19, borderRadius: 14 };
  const btnPortada = { ...styles.btnPrimary, position: "relative", zIndex: 1, width: "100%", margin: 0, borderRadius: 12.5, padding: "18px 24px", fontSize: 18, background: PORTADA_DORADO, color: PORTADA_TARJETA, justifyContent: "center" };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", minHeight: "100dvh", position: "relative", overflow: "hidden", paddingTop: "clamp(28px, 7vh, 70px)", paddingBottom: 40, boxSizing: "border-box" }}>
      <FondoPortada />
      <style>{`
        .portada-input::placeholder { color: ${PORTADA_PLACEHOLDER}; }
        @keyframes portadaGirarBorde { to { transform: rotate(360deg); } }
        .portada-btn-glow {
          position: absolute; inset: -60%; opacity: .6;
          background: conic-gradient(from 0deg, transparent 0deg, transparent 285deg, #7a6530 305deg, #E9C878 322deg, #7a6530 338deg, transparent 360deg);
          animation: portadaGirarBorde 7s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) { .portada-btn-glow { animation: none; } }
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
              <div className="portada-btn-glow" />
              <button
                type="button"
                onClick={() => { setPassword(""); setPassword2(""); cambiarModo("login"); }}
                style={btnPortada}
              >
                Ir a entrar
              </button>
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
              <input
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Repite la contraseña"
                type="password"
                className="portada-input"
                style={inputPortada}
              />
            )}
            {error && <p style={{ color: ACENTO, fontSize: 14, marginTop: 12 }}>{error}</p>}
            <div style={{ position: "relative", borderRadius: 14, padding: 1.5, overflow: "hidden", marginTop: 18, background: "#4a3a1c" }}>
              <div className="portada-btn-glow" />
              <button type="button" onClick={submit} disabled={cargando} style={{ ...btnPortada, opacity: cargando ? 0.6 : 1 }}>
                {cargando ? <Loader2 className="animate-spin" size={18} /> : modo === "login" ? "Entrar" : "Crear cuenta"}
              </button>
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
      <div style={{ position: "absolute", left: "50%", bottom: -14, transform: "translateX(-50%)", width: "76%", height: 20, borderRadius: "50%", background: "rgba(28,23,15,.32)", filter: "blur(12px)" }} />
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
        .portada-impacto { position: absolute; left: 50%; bottom: -6px; width: 70%; height: 8px; transform: translateX(-50%) scaleX(.2); border-radius: 50%; opacity: 0; animation: portadaGolpe .85s ease-out both; background: radial-gradient(ellipse, rgba(233,200,120,.5), transparent 70%); }
        @media (prefers-reduced-motion: reduce) { .portada-letra { animation-duration: .01s !important; animation-delay: 0s !important; } }
      `}</style>
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
  rachas, onGirarRuleta,
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

function Simulacros({ questions, user, onFinish, onStreakAnswer, onProgresoDiario, onFallo, favoritos, onToggleFavorito, miRacha }) {
  const [incluirInventadas, setIncluirInventadas] = useState(false);
  const base = useMemo(() => (incluirInventadas ? questions : questions.filter((q) => !q.inventada)), [questions, incluirInventadas]);
  const cursos = useMemo(() => {
    const examenes = [...new Set(base.filter((q) => esExamen(q.curso)).map((q) => q.curso))];
    examenes.sort((a, b) => (parseInt(b.match(/\d+/), 10) || 0) - (parseInt(a.match(/\d+/), 10) || 0));
    return ["Todos", ...examenes];
  }, [base]);
  const [curso, setCurso] = useState("Todos");
  const disponibles = useMemo(() => (curso === "Todos" ? base.length : base.filter((q) => q.curso === curso).length), [curso, base]);
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
  const recordPrevio = (miRacha && miRacha.racha_record) || 0;

  useEffect(() => {
    let timer;
    if (state === "running") {
      timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [state]);

  const start = () => {
    const filtered = curso === "Todos" ? base : base.filter((q) => q.curso === curso);
    const cantidad = Math.max(1, Math.min(numPreguntas || 1, filtered.length));
    const shuffled = [...filtered].sort(() => Math.random() - 0.5).slice(0, cantidad);
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
        <SectionTitle title="Autoevaluaciones" subtitle="Elige examen y cuántas preguntas quieres." />
        <Card>
          <FieldLabel>Exámenes</FieldLabel>
          <select value={curso} onChange={(e) => setCurso(e.target.value)} style={styles.select}>
            {cursos.map((c) => (<option key={c} value={c}>{c}</option>))}
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
          <button type="button" onClick={start} style={{ ...styles.btnPrimary, width: "100%", marginTop: 22 }}>Empezar autoevaluación</button>
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
          {poolOriginal.map((q, i) => (
            <button
              type="button"
              key={q.id}
              onClick={() => setPreguntaAbierta(preguntaAbierta === q.id ? null : q.id)}
              style={{
                ...styles.cuadroPregunta,
                borderColor: preguntaAbierta === q.id ? "#1E1C18" : ACENTO,
                background: preguntaAbierta === q.id ? "#1E1C18" : ACENTO_SUAVE,
                color: preguntaAbierta === q.id ? "#fff" : ACENTO,
              }}
            >
              {i + 1}
            </button>
          ))}
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

function BancoPreguntas({ questions, user, onAdd, onUpdate, onDelete, favoritos, onToggleFavorito }) {
  const [origen, setOrigen] = useState("reales");
  const [showForm, setShowForm] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const totalReales = useMemo(() => questions.filter((q) => !q.inventada).length, [questions]);
  const totalInventadas = useMemo(() => questions.filter((q) => q.inventada).length, [questions]);
  const porOrigen = useMemo(
    () => questions.filter((q) => !!q.inventada === (origen === "inventadas")),
    [questions, origen]
  );
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
        subtitle={`${questions.length} preguntas disponibles`}
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
          onClick={() => cambiarOrigen("inventadas")}
          style={{ ...styles.tabOrigenBtn, ...(origen === "inventadas" ? styles.tabOrigenActivoIA : {}) }}
        >
          <Sparkles size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} /> Inventadas por IA ({totalInventadas})
        </button>
      </div>

      {origen === "reales" && showForm && (
        <NuevaPregunta onAdd={(q) => { onAdd(q); setShowForm(false); }} cursos={cursos} />
      )}

      {origen === "inventadas" && (
        <GenerarPreguntasIA user={user} onGuardar={user.isAdmin ? onAdd : null} />
      )}

      {origen === "inventadas" && porOrigen.length > 0 && (
        <FieldLabel style={{ marginTop: 4 }}>Preguntas ya guardadas en el banco</FieldLabel>
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
        <PreguntaCard key={q.id} q={q} isAdmin={user.isAdmin} onUpdate={onUpdate} onDelete={onDelete} favoritos={favoritos} onToggleFavorito={onToggleFavorito} />
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

function PreguntaCard({ q, isAdmin, onUpdate, onDelete, favoritos, onToggleFavorito }) {
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

function Duelo({ user, questions, onDueloEnd, onProgresoDiario, autoUnirse, onAutoUnirseConsumido }) {
  const questionsReales = useMemo(() => questions.filter((q) => !q.inventada), [questions]);
  const [fase, setFase] = useState("lobby");
  const [duelo, setDuelo] = useState(null);
  const [preguntasDuelo, setPreguntasDuelo] = useState([]);
  const [miRespuesta, setMiRespuesta] = useState(null);
  const [respuestasTodas, setRespuestasTodas] = useState({});
  const [tiempoRestante, setTiempoRestante] = useState(DURACION_PREGUNTA);
  const [cuentaRevelacion, setCuentaRevelacion] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const duelRef = useRef(null);
  const avanzadoRef = useRef(null);
  const streakRegistradaRef = useRef(null);

  useEffect(() => { duelRef.current = duelo; }, [duelo]);

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
        <SectionTitle title="Duelo terminado" />
        <Card style={{ textAlign: "center", padding: "32px 20px" }}>
          <Swords size={26} color={empate ? "#9B9689" : gane ? CORRECTO : "#A6362B"} style={{ marginBottom: 10 }} />
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

function MiPerfil({ user, miRacha, questions, fallos, favoritos, onToggleFavorito, onGirarRuleta }) {
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
const CALIFICACIONES_FLASHCARD = [
  { calidad: 0, label: "Muy difícil", bg: ACENTO_SUAVE, color: ACENTO, borde: ACENTO },
  { calidad: 3, label: "Difícil", bg: AVISO_SUAVE, color: AVISO, borde: AVISO },
  { calidad: 4, label: "Fácil", bg: CAUTELA_SUAVE, color: CAUTELA, borde: CAUTELA },
  { calidad: 5, label: "Muy fácil", bg: CORRECTO_SUAVE, color: CORRECTO, borde: CORRECTO },
];

function Flashcards({ user, flashcards, progreso, onRepaso, onUpdate }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const progresoPorId = useMemo(() => {
    const m = {};
    progreso.forEach((p) => { m[p.flashcard_id] = p; });
    return m;
  }, [progreso]);

  const pendientes = useMemo(
    () => flashcards.filter((f) => {
      const p = progresoPorId[f.id];
      return !p || !p.proxima_revision || p.proxima_revision <= hoy;
    }),
    [flashcards, progresoPorId, hoy]
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
      const p = progresoPorId[f.id];
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
    await onRepaso(carta.id, calidad);
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
        <SectionTitle title="Flashcards" subtitle="Todavía no hay tarjetas en el mazo." />
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
          .flip-container { perspective: 1600px; margin-top: 16px; min-height: 280px; }
          .flip-inner { position: relative; width: 100%; height: 100%; min-height: 280px; transition: transform 0.5s; transform-style: preserve-3d; }
          .flip-inner.flipped { transform: rotateY(180deg); }
          .flip-face { position: absolute; inset: 0; backface-visibility: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; box-sizing: border-box; margin: 0; }
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
    ? flashcards.filter((f) => f.frontal.toLowerCase().includes(terminoTarjetas) || f.posterior.toLowerCase().includes(terminoTarjetas))
    : flashcards;

  return (
    <div>
      <SectionTitle title="Flashcards" subtitle={`${flashcards.length} tarjetas en el mazo "${flashcards[0].mazo}"`} />
      {resumen && (
        <Card style={{ marginBottom: 16, textAlign: "center", borderColor: CORRECTO }}>
          <p style={{ fontSize: 15, color: "#1E1C18", margin: 0 }}>
            ¡Sesión terminada! Has repasado {resumen.total} tarjeta{resumen.total === 1 ? "" : "s"}.
          </p>
        </Card>
      )}
      <Card style={{ textAlign: "center", padding: "28px 20px" }}>
        {pendientes.length === 0 ? (
          <p style={{ fontSize: 15, color: "#1E1C18", margin: 0 }}>No te toca repasar ninguna tarjeta hoy. ¡Vuelve mañana!</p>
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
          {verTarjetas ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Ver y editar tarjetas ({flashcards.length})
        </button>
        {verTarjetas && (
          <div style={{ marginTop: 12 }}>
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
              <FlashcardEditableCard key={f.id} f={f} isAdmin={user && user.isAdmin} onUpdate={onUpdate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FlashcardEditableCard({ f, isAdmin, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [frontal, setFrontal] = useState(f.frontal);
  const [posterior, setPosterior] = useState(f.posterior);
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!frontal.trim() || !posterior.trim()) return;
    setSaving(true);
    const ok = await onUpdate(f.id, { frontal: frontal.trim(), posterior: posterior.trim() });
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <Card style={{ marginBottom: 10, borderLeft: "3px solid #C89B3C" }}>
        <FieldLabel>Frontal</FieldLabel>
        <textarea value={frontal} onChange={(e) => setFrontal(e.target.value)} style={{ ...styles.input, minHeight: 60 }} />
        <FieldLabel style={{ marginTop: 12 }}>Posterior</FieldLabel>
        <textarea value={posterior} onChange={(e) => setPosterior(e.target.value)} style={{ ...styles.input, minHeight: 60 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={guardar} disabled={saving} style={{ ...styles.btnPrimary, flex: 1 }}>{saving ? "Guardando..." : "Guardar cambios"}</button>
          <button type="button" onClick={() => { setFrontal(f.frontal); setPosterior(f.posterior); setEditing(false); }} style={styles.btnSecondary}>Cancelar</button>
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
        </div>
        {open ? <ChevronDown size={16} color="#9B9689" /> : <ChevronRight size={16} color="#9B9689" />}
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 14, color: CORRECTO, lineHeight: 1.5, fontWeight: 600, margin: 0 }}>{f.posterior}</p>
          {isAdmin && (
            <div style={{ marginTop: 14 }}>
              <button type="button" onClick={() => setEditing(true)} style={styles.btnSecondary}>
                <Pencil size={13} style={{ marginRight: 4 }} /> Editar
              </button>
            </div>
          )}
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

function Ranking({ rachas, user }) {
  const vivoQuiz = [...rachas]
    .filter((r) => (r.racha_actual || 0) > 0)
    .sort((a, b) => (b.racha_actual || 0) - (a.racha_actual || 0));
  const vivoDuelo = [...rachas]
    .filter((r) => (r.racha_duelo_actual || 0) > 0)
    .sort((a, b) => (b.racha_duelo_actual || 0) - (a.racha_duelo_actual || 0));
  const historicoQuiz = [...rachas]
    .filter((r) => (r.racha_record || 0) > 0)
    .sort((a, b) => (b.racha_record || 0) - (a.racha_record || 0));
  const historicoDuelo = [...rachas]
    .filter((r) => (r.racha_duelos_record || 0) > 0)
    .sort((a, b) => (b.racha_duelos_record || 0) - (a.racha_duelos_record || 0));
  const lunesActual = lunesDeLaSemana(new Date());
  const ligaSemanal = [...rachas]
    .filter((r) => r.semana_actual === lunesActual && (r.correctas_semana || 0) > 0)
    .sort((a, b) => (b.correctas_semana || 0) - (a.correctas_semana || 0));

  return (
    <div>
      <style>{`
        @keyframes energiaGiro { to { transform: rotate(360deg); } }
      `}</style>
      <SectionTitle title="Ranking" />

      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
        <span style={styles.puntoVivo} />
        <h2 style={styles.h3Ranking}>Rachas en vivo</h2>
      </div>
      <div style={styles.rankingColumnas}>
        <ColumnaRanking titulo="Autoevaluaciones" icono={Flame} color="#C89B3C">
          <ListaRachas
            datos={vivoQuiz} campo="racha_actual" icono={Flame} colorIcono="#C89B3C"
            user={user} vacioTexto="Sin racha activa." enVivo
          />
        </ColumnaRanking>
        <ColumnaRanking titulo="Duelo 1v1" icono={Swords} color="#A6362B">
          <ListaRachas
            datos={vivoDuelo} campo="racha_duelo_actual" icono={Swords} colorIcono="#A6362B"
            user={user} vacioTexto="Sin racha activa." enVivo
          />
        </ColumnaRanking>
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

      <div style={{ marginTop: 30 }}>
        <SectionTitle title="Rachas históricas" />
        <div style={styles.rankingColumnas}>
          <ColumnaRanking titulo="Autoevaluaciones" icono={Flame} color="#C89B3C">
            <ListaRachas
              datos={historicoQuiz} campo="racha_record" icono={Flame} colorIcono="#C89B3C"
              user={user} vacioTexto="Sin récords todavía."
            />
          </ColumnaRanking>
          <ColumnaRanking titulo="Duelo 1v1" icono={Swords} color="#A6362B">
            <ListaRachas
              datos={historicoDuelo} campo="racha_duelos_record" icono={Swords} colorIcono="#A6362B"
              user={user} vacioTexto="Sin récords todavía."
            />
          </ColumnaRanking>
        </div>
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
      {datos.map((r, i) => {
        const fila = (
          <div style={{ ...styles.rankRow, position: "relative", border: enVivo ? "none" : styles.rankRow.border, marginBottom: enVivo ? 0 : styles.rankRow.marginBottom, background: r.name === user.name ? ACENTO_SUAVE : "#fff" }}>
            <span style={{ width: 24, fontSize: 14, color: i < 3 ? "#C89B3C" : "#9B9689", fontFamily: "var(--font-display)" }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 15, color: "#1E1C18" }}>{r.name}</span>
            <span style={{ fontSize: 16, color: colorIcono, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
              <Icono size={14} /> {r[campo]}
            </span>
          </div>
        );
        if (!enVivo) return <div key={r.name}>{fila}</div>;
        return (
          <div key={r.name} style={styles.energiaWrap}>
            <div style={{ ...styles.energiaAnillo, background: `conic-gradient(from 0deg, transparent 0%, transparent 62%, ${colorIcono}66 74%, ${colorIcono}ee 80%, ${colorIcono}66 86%, transparent 100%)` }} />
            {fila}
          </div>
        );
      })}
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
  columnaRanking: { flex: 1, minWidth: 240, background: "#fff", border: `1.5px solid ${RAYA}`, borderRadius: 16, padding: "14px 14px 16px", boxShadow: SOMBRA_SUAVE },
  energiaWrap: { position: "relative", borderRadius: 9, padding: 1.5, marginBottom: 8, overflow: "hidden" },
  energiaAnillo: { position: "absolute", inset: -20, animation: "energiaGiro 3.5s linear infinite" },
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
  option: { display: "block", width: "100%", textAlign: "left", padding: "16px 18px", borderRadius: 14, border: `1.5px solid ${RAYA}`, marginBottom: 10, fontSize: 18, cursor: "pointer", color: TINTA, background: "#F6F4EC" },
  runHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  progressTrack: { height: 4, background: RAYA, borderRadius: 2, marginTop: 10 },
  progressFill: { height: 4, background: TINTA, borderRadius: 2, transition: "width .3s" },
  cuadroPregunta: { width: 40, height: 40, borderRadius: 12, border: "2px solid", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  expandBtn: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" },
  rankRow: { display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", border: `1.5px solid ${RAYA}`, borderRadius: 14, marginBottom: 8, fontSize: 16, background: "#F6F4EC" },
  vsHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px 6px", borderBottom: `1px solid ${RAYA}` },
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
