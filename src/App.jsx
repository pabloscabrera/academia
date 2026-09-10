import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Compass, ListChecks, Trophy, Clock, ChevronRight, ChevronDown,
  Plus, Check, X, Loader2, User, LogOut, Flag, Pencil, Trash2,
   Zap, Heart, Swords, Flame, Sparkles, Star, Award, Target, Settings,
   Medal, Gem, Crown
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { TEMARIO } from "./temario";

const ADMIN_NAME = "pabloadmin";
const META_DIARIA_RACHA = 10;
const AJUSTES_DEFECTO = { escala: 1, fondo: "#FBF9F4" };
const ESCALAS = [
  { id: "pequena", label: "A", escala: 0.9, tamPreview: 13 },
  { id: "normal", label: "A", escala: 1, tamPreview: 16 },
  { id: "grande", label: "A", escala: 1.15, tamPreview: 19 },
  { id: "muygrande", label: "A", escala: 1.3, tamPreview: 22 },
];
const COLORES_FONDO = ["#FBF9F4", "#FFFFFF", "#F3F1EA", "#EAF2EF", "#EDF1F7", "#F7ECEC"];
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

  useEffect(() => { savePersonal("pir-ajustes", ajustes); }, [ajustes]);

  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const { data: qData, error: qErr } = await supabase
          .from("preguntas")
          .select("*")
          .order("created_at", { ascending: true });
        if (qErr) throw qErr;
        const { data: rData, error: rErr } = await supabase
          .from("ranking")
          .select("*")
          .order("pct", { ascending: false })
          .limit(100);
        if (rErr) throw rErr;
        const { data: rachasData } = await supabase.from("rachas").select("*");
        setUser(usuarioFromSession(sessionData && sessionData.session));
        setQuestions(qData || []);
        setRanking(rData || []);
        setRachas(rachasData || []);
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
      if (activo) {
        setFallos(fData || []);
        setFavoritos(favData || []);
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
    const totalRespondidasPrevio = actual ? (actual.total_respondidas || 0) : 0;
    const totalCorrectasPrevio = actual ? (actual.total_correctas || 0) : 0;
    const fechaCorrectasHoy = actual ? actual.fecha_correctas_hoy : null;
    const correctasHoyPrevias = fechaCorrectasHoy === hoy ? (actual ? (actual.correctas_hoy || 0) : 0) : 0;

    const payload = { name: user.name, total_respondidas: totalRespondidasPrevio + 1 };

    if (correcto) {
      const nuevasCorrectasHoy = correctasHoyPrevias + 1;
      payload.total_correctas = totalCorrectasPrevio + 1;
      payload.correctas_hoy = nuevasCorrectasHoy;
      payload.fecha_correctas_hoy = hoy;

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

  let contenido;
  if (!ready) {
    contenido = <div style={{ ...styles.center, height: "100%", minHeight: 400 }}><Loader2 className="animate-spin" size={28} color="#2E7D6B" /></div>;
  } else if (loadError) {
    contenido = (
      <div style={{ padding: 24 }}>
        <h2 style={{ fontFamily: "Georgia, serif", color: "#B0533E" }}>No se pudo conectar</h2>
        <p style={{ color: "#5B6472", fontSize: 14, lineHeight: 1.5 }}>{loadError}</p>
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
        <Header user={user} onLogout={handleLogout} miRacha={rachas.find((r) => r.name === user.name)} onAjustes={() => setMostrarAjustes(true)} />
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
        <main style={styles.main}>
          {section === "perfil" && (
            <MiPerfil
              user={user}
              miRacha={rachas.find((r) => r.name === user.name)}
              questions={questions}
              fallos={fallos}
              favoritos={favoritos}
              onToggleFavorito={toggleFavorito}
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
            />
          )}
          {section === "banco" && (
            <BancoPreguntas
              questions={questions}
              user={user}
              onAdd={addQuestion}
              onUpdate={updateQuestion}
              onDelete={deleteQuestion}
              favoritos={favoritos}
              onToggleFavorito={toggleFavorito}
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
          {section === "ranking" && <Ranking rachas={rachas} user={user} />}
        </main>
      </div>
    );
  }

  return (
    <div style={{ ...styles.app, background: ajustes.fondo, zoom: ajustes.escala }}>
      {contenido}
      {mostrarAjustes && <AjustesPanel ajustes={ajustes} setAjustes={setAjustes} onClose={() => setMostrarAjustes(false)} />}
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

  return (
    <div style={{ ...styles.center, minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <FondoPortada />
      <div style={{ maxWidth: 340, width: "100%", padding: "0 24px", textAlign: "center", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <Compass size={34} color="#2E7D6B" strokeWidth={1.6} />
        </div>
        <h1 style={styles.h1}>AUTOPIR</h1>
        <p style={{ color: "#5B6472", fontSize: 15, lineHeight: 1.5, marginBottom: 24 }}>
          Autoevaluaciones, banco de preguntas, duelos 1v1 y ranking en un mismo sitio.
        </p>
        <div style={styles.tabsOrigen}>
          <button type="button" onClick={() => cambiarModo("login")} style={{ ...styles.tabOrigenBtn, ...(modo === "login" ? styles.tabOrigenActivo : {}) }}>Entrar</button>
          <button type="button" onClick={() => cambiarModo("signup")} style={{ ...styles.tabOrigenBtn, ...(modo === "signup" ? styles.tabOrigenActivo : {}) }}>Crear cuenta</button>
        </div>
        {cuentaCreada ? (
          <Card style={{ textAlign: "left" }}>
            <p style={{ fontSize: 14, color: "#14213D", lineHeight: 1.5, margin: 0 }}>
              Cuenta creada. Ya puedes entrar con tu usuario y contraseña.
            </p>
            <button type="button" onClick={() => { setPassword(""); setPassword2(""); cambiarModo("login"); }} style={{ ...styles.btnPrimary, width: "100%", marginTop: 14 }}>
              Ir a entrar
            </button>
          </Card>
        ) : (
          <Card style={{ textAlign: "left" }}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Nombre de usuario"
              style={{ ...styles.input, marginBottom: 10 }}
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
              style={{ ...styles.input, marginBottom: modo === "signup" ? 10 : 0 }}
            />
            {modo === "signup" && (
              <input
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Repite la contraseña"
                type="password"
                style={styles.input}
              />
            )}
            {error && <p style={{ color: "#B0533E", fontSize: 13, marginTop: 10 }}>{error}</p>}
            <button type="button" onClick={submit} disabled={cargando} style={{ ...styles.btnPrimary, width: "100%", marginTop: 14, opacity: cargando ? 0.6 : 1, justifyContent: "center" }}>
              {cargando ? <Loader2 className="animate-spin" size={16} /> : modo === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}

function FondoPortada() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background: `
          radial-gradient(circle at 15% 20%, rgba(46,125,107,0.14), transparent 40%),
          radial-gradient(circle at 85% 15%, rgba(200,155,60,0.12), transparent 38%),
          radial-gradient(circle at 75% 85%, rgba(138,90,158,0.12), transparent 42%),
          radial-gradient(circle at 20% 90%, rgba(46,125,107,0.10), transparent 40%)
        `,
      }}
    >
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        <defs>
          <pattern id="autopir-nodos" width="72" height="72" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="8" r="1.4" fill="#2E7D6B" fillOpacity="0.35" />
            <line x1="8" y1="8" x2="44" y2="30" stroke="#2E7D6B" strokeOpacity="0.12" strokeWidth="1" />
            <circle cx="44" cy="30" r="1.4" fill="#C89B3C" fillOpacity="0.3" />
            <line x1="44" y1="30" x2="20" y2="60" stroke="#8A5A9E" strokeOpacity="0.12" strokeWidth="1" />
            <circle cx="20" cy="60" r="1.4" fill="#8A5A9E" fillOpacity="0.3" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#autopir-nodos)" />
      </svg>
    </div>
  );
}

function AjustesPanel({ ajustes, setAjustes, onClose }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontSize: 17, fontFamily: "Georgia, serif", color: "#14213D" }}>Ajustes</span>
          <button type="button" onClick={onClose} style={styles.iconBtn}><X size={18} color="#5B6472" /></button>
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
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {COLORES_FONDO.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAjustes((prev) => ({ ...prev, fondo: c }))}
              title={c}
              style={{ ...styles.colorSwatch, background: c, borderColor: ajustes.fondo === c ? "#14213D" : "#E4E1D8" }}
            >
              {ajustes.fondo === c && <Check size={14} color="#14213D" />}
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

function Header({ user, onLogout, miRacha, onAjustes }) {
  const rachaDias = (miRacha && miRacha.racha_dias_actual) || 0;
  const totalCorrectas = (miRacha && miRacha.total_correctas) || 0;
  const insignia = insigniaActual(totalCorrectas);
  const IconoInsignia = insignia ? insignia.icon : Medal;
  return (
    <header style={styles.header}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Compass size={20} color="#2E7D6B" strokeWidth={1.8} />
        <span style={{ fontFamily: "Georgia, serif", fontSize: 18, color: "#14213D", letterSpacing: 0.3 }}>AUTOPIR</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          title={insignia ? `${insignia.titulo} · ${totalCorrectas} acertadas` : `${totalCorrectas} acertadas`}
          style={{ ...styles.rachaDiasChip, color: insignia ? insignia.color : "#B7BEC8" }}
        >
          <IconoInsignia size={14} color={insignia ? insignia.color : "#B7BEC8"} />
          {totalCorrectas}
        </span>
        <span
          title={rachaDias > 0 ? `${rachaDias} día${rachaDias === 1 ? "" : "s"} seguidos entrando y acertando ${META_DIARIA_RACHA}+ preguntas` : `Acierta ${META_DIARIA_RACHA} preguntas hoy para empezar tu racha`}
          style={{ ...styles.rachaDiasChip, ...(rachaDias > 0 ? styles.rachaDiasChipActiva : {}) }}
        >
          <Flame size={14} color={rachaDias > 0 ? "#B0533E" : "#B7BEC8"} fill={rachaDias > 0 ? "#B0533E" : "none"} />
          {rachaDias}
        </span>
        <span style={{ fontSize: 13, color: "#5B6472", display: "flex", alignItems: "center", gap: 4 }}>
          <User size={14} /> {user.name}{user.isAdmin ? " · admin" : ""}
        </span>
        <button type="button" onClick={onAjustes} style={styles.iconBtn} title="Ajustes">
          <Settings size={15} color="#5B6472" />
        </button>
        <button type="button" onClick={onLogout} style={styles.iconBtn} title="Salir">
          <LogOut size={15} color="#5B6472" />
        </button>
      </div>
    </header>
  );
}

function Nav({ section, setSection, alerta }) {
  const items = [
    { id: "perfil", label: "Mi perfil", icon: User },
    { id: "simulacros", label: "Autoevaluaciones", icon: Clock },
    { id: "banco", label: "Banco de preguntas", icon: ListChecks },
    { id: "duelo", label: "Duelo 1v1", icon: Zap },
    { id: "ranking", label: "Ranking", icon: Trophy },
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
            style={{ ...styles.navBtn, color: active ? "#14213D" : "#8A93A3", borderBottom: active ? "2px solid #2E7D6B" : "2px solid transparent", position: "relative" }}
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

function Simulacros({ questions, user, onFinish, onStreakAnswer, onProgresoDiario, onFallo, favoritos, onToggleFavorito }) {
  const [incluirInventadas, setIncluirInventadas] = useState(false);
  const base = useMemo(() => (incluirInventadas ? questions : questions.filter((q) => !q.inventada)), [questions, incluirInventadas]);
  const cursos = useMemo(() => ["Todos", ...new Set(base.map((q) => q.curso))], [base]);
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

  useEffect(() => {
    let timer;
    if (state === "running") timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  const start = () => {
    const filtered = curso === "Todos" ? base : base.filter((q) => q.curso === curso);
    const cantidad = Math.max(1, Math.min(numPreguntas || 1, filtered.length));
    const shuffled = [...filtered].sort(() => Math.random() - 0.5).slice(0, cantidad);
    setPool(shuffled); setPoolOriginal(shuffled);
    setIdx(0); setAnswers([]); setSelected(null); setRevealed(false); setSeconds(0);
    setRonda(1); setResultados({}); setPrimerIntento(null); setPreguntaAbierta(null);
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
      onStreakAnswer(correcto);
      if (onProgresoDiario) onProgresoDiario(correcto);
      if (!correcto && onFallo) onFallo(q);
    }
  };

  const next = async () => {
    if (submitting) return;
    const current = pool[idx];
    const nextAnswers = [...answers, { qId: current.id, pregunta: current, selected, correct: selected === current.correcta }];
    setAnswers(nextAnswers); setSelected(null); setRevealed(false);
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

    setSubmitting(true);
    const resumenPrimerIntento = primerIntento || { correctCount: nextAnswers.filter((a) => a.correct).length, total: nextAnswers.length };
    const pct = Math.round((resumenPrimerIntento.correctCount / resumenPrimerIntento.total) * 100);
    try {
      await onFinish({ name: user.name, score: resumenPrimerIntento.correctCount, total: resumenPrimerIntento.total, pct, seconds, date: new Date().toISOString() });
    } catch {}
    setSubmitting(false);
    setState("done");
  };

  if (questions.length === 0) {
    return (
      <div>
        <SectionTitle title="Autoevaluaciones" subtitle="Todavía no hay preguntas en el banco." />
        <Card style={{ textAlign: "center", color: "#8A93A3", padding: "28px 16px" }}>
          Añade preguntas desde "Banco de preguntas" para poder hacer una autoevaluación.
        </Card>
      </div>
    );
  }

  if (state === "config") {
    return (
      <div>
        <SectionTitle title="Autoevaluaciones" subtitle="Elige curso y cuántas preguntas quieres." />
        <Card>
          <FieldLabel>Curso</FieldLabel>
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
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontSize: 13, color: "#5B6472", cursor: "pointer" }}>
            <input type="checkbox" checked={incluirInventadas} onChange={(e) => setIncluirInventadas(e.target.checked)} />
            Incluir preguntas inventadas por IA
          </label>
          <button type="button" onClick={start} style={{ ...styles.btnPrimary, width: "100%", marginTop: 22 }}>Empezar autoevaluación</button>
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
          <span style={{ fontSize: 13, color: "#5B6472" }}>
            {ronda > 1 ? `Repaso de falladas (ronda ${ronda}) · ` : ""}Pregunta {idx + 1} de {pool.length}
          </span>
          <span style={{ fontSize: 13, color: "#5B6472", display: "flex", alignItems: "center", gap: 4 }}><Clock size={13} /> {mm}:{ss}</span>
        </div>
        <div style={styles.progressTrack}><div style={{ ...styles.progressFill, width: `${(idx / pool.length) * 100}%` }} /></div>
        <Card style={{ marginTop: 16, ...styles.daypoCard }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#2E7D6B", fontFamily: "Arial, Helvetica, sans-serif" }}>{q.curso} · {q.tema}</div>
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
              <button type="button" key={`${idx}-${i}`} className={claseExtra} onClick={(e) => elegir(i, e)} disabled={revealed} style={estilo}>
                <span style={styles.daypoLetra}>{letra}</span>
                <span style={{ flex: 1 }}>{op}</span>
                {revealed && i === q.correcta && <Check size={18} color="#2E7D6B" />}
                {revealed && i === selected && i !== q.correcta && <X size={18} color="#B0533E" />}
              </button>
            );
          })}
          {revealed && (
            <div style={{ ...styles.daypoFeedback, ...(esCorrecta ? styles.daypoFeedbackOk : styles.daypoFeedbackMal) }}>
              {esCorrecta ? "¡Correcto!" : `Incorrecto. La respuesta correcta es la ${String.fromCharCode(65 + q.correcta)}.`}
              {q.explicacion && <div style={{ marginTop: 6, fontWeight: 400 }}>{q.explicacion}</div>}
            </div>
          )}
          <button type="button" onClick={next} disabled={!revealed} style={{ ...styles.btnPrimary, width: "100%", marginTop: 18, opacity: !revealed ? 0.4 : 1 }}>
            {idx + 1 === pool.length ? "Terminar" : "Siguiente"}
          </button>
        </Card>
      </div>
    );
  }

  const total = poolOriginal.length;
  const aciertosPrimeraVuelta = primerIntento ? primerIntento.correctCount : total;
  const pctPrimeraVuelta = total > 0 ? Math.round((aciertosPrimeraVuelta / total) * 100) : 0;
  const abierta = preguntaAbierta != null ? resultados[preguntaAbierta] : null;
  return (
    <div>
      <SectionTitle title="Autoevaluación completada" />
      <Card style={{ textAlign: "center", padding: "28px 20px" }}>
        <Flag size={26} color="#2E7D6B" style={{ marginBottom: 10 }} />
        <div style={{ color: "#14213D", fontSize: 16 }}>Has respondido correctamente las {total} preguntas.</div>
        <div style={{ color: "#8A93A3", fontSize: 13, marginTop: 6 }}>
          {aciertosPrimeraVuelta} de {total} a la primera ({pctPrimeraVuelta}%) · {Math.floor(seconds / 60)} min {seconds % 60}s
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
                borderColor: preguntaAbierta === q.id ? "#14213D" : "#2E7D6B",
                background: preguntaAbierta === q.id ? "#14213D" : "#EEF3F1",
                color: preguntaAbierta === q.id ? "#fff" : "#2E7D6B",
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
        {abierta && (
          <Card style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#2E7D6B" }}>{abierta.pregunta.curso} · {abierta.pregunta.tema}</div>
              {onToggleFavorito && (
                <FavoritoBtn pregunta={abierta.pregunta} favoritos={favoritos} onToggle={onToggleFavorito} />
              )}
            </div>
            <p style={{ fontSize: 15, color: "#14213D", lineHeight: 1.5, marginBottom: 14 }}>{abierta.pregunta.pregunta}</p>
            {abierta.pregunta.opciones.map((op, i) => (
              <div key={i} style={{ ...styles.opcion, cursor: "default", ...(i === abierta.pregunta.correcta ? styles.opcionCorrectaLegacy : {}) }}>
                {i === abierta.pregunta.correcta && <Check size={13} color="#2E7D6B" />}
                {op}
              </div>
            ))}
            {abierta.pregunta.explicacion && <p style={{ fontSize: 13, color: "#5B6472", marginTop: 10, lineHeight: 1.5 }}>{abierta.pregunta.explicacion}</p>}
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
  const [filtro, setFiltro] = useState("Todos");
  const [showForm, setShowForm] = useState(false);
  const totalReales = useMemo(() => questions.filter((q) => !q.inventada).length, [questions]);
  const totalInventadas = useMemo(() => questions.filter((q) => q.inventada).length, [questions]);
  const porOrigen = useMemo(
    () => questions.filter((q) => !!q.inventada === (origen === "inventadas")),
    [questions, origen]
  );
  const cursos = useMemo(() => ["Todos", ...new Set(porOrigen.map((q) => q.curso))], [porOrigen]);
  const filtered = filtro === "Todos" ? porOrigen : porOrigen.filter((q) => q.curso === filtro);

  const cambiarOrigen = (o) => { setOrigen(o); setFiltro("Todos"); };

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
        <NuevaPregunta onAdd={(q) => { onAdd(q); setShowForm(false); }} cursos={cursos.filter((c) => c !== "Todos")} />
      )}

      {origen === "inventadas" && (
        <GenerarPreguntasIA user={user} onGuardar={user.isAdmin ? onAdd : null} />
      )}

      {origen === "inventadas" && porOrigen.length > 0 && (
        <FieldLabel style={{ marginTop: 4 }}>Preguntas ya guardadas en el banco</FieldLabel>
      )}
      {porOrigen.length > 0 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "14px 0 14px" }}>
          {cursos.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setFiltro(c)}
              style={{ ...styles.chip, whiteSpace: "nowrap", background: filtro === c ? "#14213D" : "transparent", color: filtro === c ? "#fff" : "#14213D", borderColor: "#14213D" }}
            >
              {c}
            </button>
          ))}
        </div>
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
        <span style={{ fontSize: 15, color: "#14213D", fontFamily: "Georgia, serif" }}>Pídele preguntas a la IA</span>
      </div>
      <p style={{ fontSize: 12.5, color: "#8A93A3", marginTop: 0, marginBottom: 12 }}>
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
        onChange={(e) => setCantidad(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
        style={{ ...styles.input, maxWidth: 100 }}
      />
      <button type="button" onClick={generar} disabled={cargando} style={{ ...styles.btnPrimary, width: "100%", marginTop: 14, opacity: cargando ? 0.6 : 1 }}>
        {cargando ? <Loader2 className="animate-spin" size={15} /> : "Generar"}
      </button>
      {error && <p style={{ color: "#B0533E", fontSize: 13, marginTop: 10 }}>{error}</p>}

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
      <div style={{ fontSize: 14, color: "#14213D", marginBottom: 8 }}>{p.pregunta}</div>
      {p.opciones.map((op, oi) => {
        let estilo = { ...styles.opcion };
        if (revealed) {
          if (oi === p.correcta) estilo = { ...estilo, ...styles.opcionCorrectaLegacy };
          else if (oi === selected) estilo = { ...estilo, borderColor: "#B0533E", background: "#FBEDEA" };
        }
        return (
          <button type="button" key={oi} onClick={() => !revealed && setSelected(oi)} disabled={revealed} style={{ ...estilo, cursor: revealed ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            {revealed && oi === p.correcta && <Check size={13} color="#2E7D6B" />}
            {revealed && oi === selected && oi !== p.correcta && <X size={13} color="#B0533E" />}
            {op}
          </button>
        );
      })}
      {revealed && p.explicacion && <p style={{ fontSize: 13, color: "#5B6472", marginTop: 8 }}>{p.explicacion}</p>}
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
        <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...styles.expandBtn, flex: 1 }}>
          <div style={{ textAlign: "left", flex: 1 }}>
            <div style={{ fontSize: 11, color: q.inventada ? "#8A5A9E" : "#2E7D6B", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              {q.inventada && <Sparkles size={11} />}
              {q.curso} · {q.tema}
            </div>
            <div style={{ fontSize: 14, color: "#14213D", lineHeight: 1.4 }}>{q.pregunta}</div>
          </div>
          {open ? <ChevronDown size={16} color="#8A93A3" /> : <ChevronRight size={16} color="#8A93A3" />}
        </button>
        {onToggleFavorito && <FavoritoBtn pregunta={q} favoritos={favoritos} onToggle={onToggleFavorito} />}
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          {q.opciones.map((op, i) => (
            <div key={i} style={{ ...styles.opcion, cursor: "default", ...(i === q.correcta ? styles.opcionCorrectaLegacy : {}) }}>
              {i === q.correcta && <Check size={13} color="#2E7D6B" />}
              {op}
            </div>
          ))}
          {q.explicacion && <p style={{ fontSize: 13, color: "#5B6472", marginTop: 10, lineHeight: 1.5 }}>{q.explicacion}</p>}
          {isAdmin && (
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => setEditing(true)} style={styles.btnSecondary}>
                <Pencil size={13} style={{ marginRight: 4 }} /> Editar
              </button>
              {!deleting ? (
                <button type="button" onClick={() => setDeleting(true)} style={{ ...styles.btnSecondary, color: "#B0533E", borderColor: "#B0533E" }}>
                  <Trash2 size={13} style={{ marginRight: 4 }} /> Borrar
                </button>
              ) : (
                <>
                  <span style={{ fontSize: 12, color: "#B0533E", alignSelf: "center" }}>¿Seguro?</span>
                  <button type="button" onClick={() => onDelete(q.id)} style={{ ...styles.btnSecondary, color: "#fff", background: "#B0533E", borderColor: "#B0533E" }}>Sí, borrar</button>
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
          <Card style={{ textAlign: "center", color: "#8A93A3", padding: "28px 16px" }}>
            Añade más preguntas desde "Banco de preguntas" para poder jugar duelos.
          </Card>
        </div>
      );
    }
    return (
      <div>
        <SectionTitle title="Duelo 1v1" subtitle="Reta a otra persona en tiempo real. 3 vidas, sin límite de preguntas." />
        <Card style={{ textAlign: "center", padding: "32px 20px" }}>
          <Swords size={30} color="#2E7D6B" style={{ marginBottom: 14 }} />
          <p style={{ color: "#5B6472", fontSize: 14, marginBottom: 20 }}>
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
          <Loader2 className="animate-spin" size={26} color="#2E7D6B" style={{ marginBottom: 14 }} />
          <p style={{ color: "#5B6472", fontSize: 14, marginBottom: 20 }}>Esperando a un oponente...</p>
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
          <Swords size={26} color={empate ? "#8A93A3" : gane ? "#2E7D6B" : "#B0533E"} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 22, fontFamily: "Georgia, serif", color: "#14213D" }}>
            {empate ? "Empate" : gane ? "¡Has ganado!" : "Has perdido"}
          </div>
          {!empate && <div style={{ color: "#5B6472", fontSize: 14, marginTop: 6 }}>Ganador: {duelo.ganador}</div>}
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
          <div style={{ fontSize: 13, color: "#14213D", fontWeight: 600 }}>{user.name}</div>
          <Corazones vidas={miVidas} />
        </div>
        <div style={{ fontSize: 12, color: "#8A93A3", textAlign: "center" }}>
          <div>VS</div>
          <div>Pregunta {duelo.indice + 1}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: "#14213D", fontWeight: 600 }}>{oponenteNombre || "..."}</div>
          <Corazones vidas={suVidas} align="right" />
        </div>
      </div>

      {!revelando && (
        <div style={{ textAlign: "center", margin: "10px 0" }}>
          <span style={{ fontSize: 13, color: tiempoRestante <= 10 ? "#B0533E" : "#5B6472" }}>
            <Clock size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />{tiempoRestante}s
          </span>
        </div>
      )}

      {preguntaActual && (
        <Card style={{ marginTop: 10 }}>
          <p style={{ fontSize: 21, color: "#14213D", lineHeight: 1.5, marginBottom: 20 }}>{preguntaActual.pregunta}</p>
          {preguntaActual.opciones.map((op, i) => {
            let borderColor = "#E4E1D8", background = "#fff";
            if (revelando) {
              if (i === preguntaActual.correcta) { borderColor = "#2E7D6B"; background = "#EEF3F1"; }
              else if (i === respuestas[miClave]) { borderColor = "#B0533E"; background = "#FBEDEA"; }
            } else if (miRespuesta === i) {
              borderColor = "#14213D"; background = "#EEF3F1";
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
                {revelando && i === respuestas[miClave] && i !== preguntaActual.correcta && <span style={{ fontSize: 11, color: "#B0533E" }}> — tu respuesta</span>}
                {revelando && respuestas[soyJugador1 ? "jugador2" : "jugador1"] === i && i !== preguntaActual.correcta && i !== respuestas[miClave] && <span style={{ fontSize: 11, color: "#8A93A3" }}> — respuesta de {oponenteNombre}</span>}
              </button>
            );
          })}
          {miRespuesta !== null && !revelando && (
            <p style={{ fontSize: 12, color: "#8A93A3", textAlign: "center", marginTop: 8 }}>Esperando al oponente...</p>
          )}
          {revelando && (
            <p style={{ fontSize: 12, color: "#8A93A3", textAlign: "center", marginTop: 8 }}>
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
        <Heart key={i} size={15} color={i < vidas ? "#B0533E" : "#E4E1D8"} fill={i < vidas ? "#B0533E" : "none"} />
      ))}
    </div>
  );
}

function BarraNivel({ actual, siguiente, totalCorrectas }) {
  const desde = actual ? actual.umbral : 0;
  const hasta = siguiente ? siguiente.umbral : desde;
  const rango = Math.max(1, hasta - desde);
  const puntosEnNivel = Math.min(rango, Math.max(0, totalCorrectas - desde));
  const pct = siguiente ? Math.round((puntosEnNivel / rango) * 100) : 100;
  return (
    <Card style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#14213D" }}>{actual ? actual.titulo : "Todavía sin insignia"}</div>
        <div style={{ fontSize: 12, color: "#8A93A3" }}>
          {totalCorrectas} acertadas{siguiente ? ` · ${siguiente.umbral - totalCorrectas} para ${siguiente.nombre}` : " · nivel máximo"}
        </div>
      </div>
      <div style={styles.insigniasGrid}>
        {INSIGNIAS.map((ins) => {
          const desbloqueada = totalCorrectas >= ins.umbral;
          const Icono = ins.icon;
          return (
            <div key={ins.id} style={{ ...styles.insigniaCard, borderColor: desbloqueada ? ins.color : "#E4E1D8" }}>
              <Icono size={22} color={desbloqueada ? ins.color : "#C7C2B4"} strokeWidth={1.6} />
              <div style={{ fontSize: 11.5, fontWeight: 600, color: desbloqueada ? "#14213D" : "#B7BEC8", marginTop: 6 }}>{ins.nombre}</div>
              <div style={{ fontSize: 10, color: "#B7BEC8", marginTop: 1 }}>{ins.umbral}</div>
            </div>
          );
        })}
      </div>
      <div style={{ ...styles.progressTrack, marginTop: 14 }}>
        <div style={{ ...styles.progressFill, width: `${pct}%`, background: "#2E7D6B" }} />
      </div>
    </Card>
  );
}

function MiPerfil({ user, miRacha, questions, fallos, favoritos, onToggleFavorito }) {
  const [verTodosFallos, setVerTodosFallos] = useState(false);
  const [abiertaId, setAbiertaId] = useState(null);

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
  const progresoSiguiente = siguiente ? Math.min(100, Math.round((totalCorrectas / siguiente.umbral) * 100)) : 100;

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

  const fallosVisibles = verTodosFallos ? fallosConPregunta : fallosConPregunta.slice(0, 5);
  const abierta = abiertaId != null ? (preguntasPorId[abiertaId] || null) : null;

  return (
    <div>
      <SectionTitle title="Mi perfil" subtitle={user.name} />

      <BarraNivel actual={actual} siguiente={siguiente} totalCorrectas={totalCorrectas} />

      <Card style={{ marginTop: 14, padding: "16px 0", display: "flex" }}>
        <EstadisticaItem
          icono={Flame}
          color="#B0533E"
          valor={rachaDias}
          etiqueta={`días de racha${rachaDiasRecord > 0 ? ` (récord ${rachaDiasRecord})` : ""}`}
          detalle={`${correctasHoy}/${META_DIARIA_RACHA} aciertos hoy`}
        />
        <EstadisticaItem
          icono={Target}
          color="#2E7D6B"
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

      <div style={{ marginTop: 36 }}>
        <PreguntasPlegables
          titulo="Historial de fallos"
          subtitulo={fallosConPregunta.length === 0 ? "Todavía no has fallado ninguna pregunta." : "Las que más se te atascan, primero."}
          items={fallosVisibles}
          etiquetaItem={(f) => `fallada ${f.veces} ${f.veces === 1 ? "vez" : "veces"}`}
          abiertaId={abiertaId}
          setAbiertaId={setAbiertaId}
          favoritos={favoritos}
          onToggleFavorito={onToggleFavorito}
        />
        {fallosConPregunta.length > 5 && (
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

function EstadisticaItem({ icono: Icono, color, valor, etiqueta, detalle, borde }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "0 10px", borderLeft: borde ? "1px solid #E4E1D8" : "none" }}>
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
                <div style={{ fontSize: 11, color: "#8A93A3", marginBottom: 4 }}>
                  {f.pregunta.curso} · {f.pregunta.tema}{etiquetaItem ? ` · ${etiquetaItem(f)}` : ""}
                </div>
                <div style={{ fontSize: 14, color: "#14213D", lineHeight: 1.4 }}>{f.pregunta.pregunta}</div>
              </div>
              {abiertaId === f.pregunta_id ? <ChevronDown size={16} color="#8A93A3" /> : <ChevronRight size={16} color="#8A93A3" />}
            </button>
            <FavoritoBtn pregunta={f.pregunta} favoritos={favoritos} onToggle={onToggleFavorito} />
          </div>
          {abiertaId === f.pregunta_id && (
            <div style={{ marginTop: 12 }}>
              {f.pregunta.opciones.map((op, oi) => (
                <div key={oi} style={{ ...styles.opcion, cursor: "default", ...(oi === f.pregunta.correcta ? styles.opcionCorrectaLegacy : {}) }}>
                  {oi === f.pregunta.correcta && <Check size={13} color="#2E7D6B" />}
                  {op}
                </div>
              ))}
              {f.pregunta.explicacion && <p style={{ fontSize: 13, color: "#5B6472", marginTop: 10, lineHeight: 1.5 }}>{f.pregunta.explicacion}</p>}
            </div>
          )}
        </Card>
      ))}
    </div>
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
        <ColumnaRanking titulo="Duelo 1v1" icono={Swords} color="#B0533E">
          <ListaRachas
            datos={vivoDuelo} campo="racha_duelo_actual" icono={Swords} colorIcono="#B0533E"
            user={user} vacioTexto="Sin racha activa." enVivo
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
          <ColumnaRanking titulo="Duelo 1v1" icono={Swords} color="#B0533E">
            <ListaRachas
              datos={historicoDuelo} campo="racha_duelos_record" icono={Swords} colorIcono="#B0533E"
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
        <span style={{ fontSize: 14, fontWeight: 600, color: "#14213D" }}>{titulo}</span>
      </div>
      {children}
    </div>
  );
}

function ListaRachas({ datos, campo, icono: Icono, colorIcono, user, vacioTexto, enVivo }) {
  if (datos.length === 0) {
    return <p style={{ fontSize: 13, color: "#8A93A3", padding: "6px 0 4px" }}>{vacioTexto}</p>;
  }
  return (
    <>
      {datos.map((r, i) => {
        const fila = (
          <div style={{ ...styles.rankRow, position: "relative", border: enVivo ? "none" : styles.rankRow.border, marginBottom: enVivo ? 0 : styles.rankRow.marginBottom, background: r.name === user.name ? "#EEF3F1" : "#fff" }}>
            <span style={{ width: 24, fontSize: 14, color: i < 3 ? "#C89B3C" : "#8A93A3", fontFamily: "Georgia, serif" }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 15, color: "#14213D" }}>{r.name}</span>
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
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#14213D", margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: "#8A93A3", margin: "4px 0 0" }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ ...styles.card, ...style }}>{children}</div>;
}

function FieldLabel({ children, style }) {
  return <div style={{ fontSize: 12, color: "#5B6472", marginBottom: 6, ...style }}>{children}</div>;
}

const styles = {
  app: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#FBF9F4", minHeight: "100vh", color: "#14213D", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none", fontSize: 17 },
  center: { display: "flex", alignItems: "center", justifyContent: "center" },
  h1: { fontFamily: "Georgia, serif", fontSize: 32, margin: "0 0 10px", color: "#14213D" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid #E4E1D8" },
  nav: { display: "flex", gap: 6, padding: "0 18px", borderBottom: "1px solid #E4E1D8", overflowX: "auto" },
  navBtn: { display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: "16px 14px", fontSize: 16, cursor: "pointer", whiteSpace: "nowrap" },
  navDot: { position: "absolute", top: 10, right: 6, width: 8, height: 8, borderRadius: "50%", background: "#B0533E", animation: "dueloPulso 1.2s ease-in-out infinite" },
  tabsOrigen: { display: "flex", gap: 8, marginBottom: 14 },
  tabOrigenBtn: { flex: 1, padding: "11px 14px", borderRadius: 8, border: "1px solid #E4E1D8", background: "#fff", color: "#8A93A3", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  tabOrigenActivo: { background: "#14213D", borderColor: "#14213D", color: "#fff" },
  tabOrigenActivoIA: { background: "#8A5A9E", borderColor: "#8A5A9E", color: "#fff" },
  rachaDiasChip: { display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: "#B7BEC8", background: "#F3F1EA", borderRadius: 20, padding: "5px 10px" },
  rachaDiasChipActiva: { color: "#B0533E", background: "#FBEDEA" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(20,33,61,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 },
  modalCard: { background: "#fff", borderRadius: 14, padding: 24, maxWidth: 340, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.22)" },
  escalaBtn: { flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid #E4E1D8", background: "#fff", color: "#14213D", fontWeight: 700, cursor: "pointer" },
  escalaBtnActivo: { borderColor: "#14213D", background: "#14213D", color: "#fff" },
  colorSwatch: { width: 34, height: 34, borderRadius: "50%", border: "2px solid", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  perfilStatNum: { fontSize: 22, fontFamily: "Georgia, serif", color: "#14213D" },
  perfilStatLabel: { fontSize: 11.5, color: "#8A93A3", marginTop: 2, lineHeight: 1.4 },
  linkBtn: { background: "none", border: "none", color: "#2E7D6B", fontSize: 13, cursor: "pointer", padding: "10px 0", fontWeight: 600 },
  insigniasGrid: { display: "flex", gap: 8, flexWrap: "wrap" },
  insigniaCard: { flex: "1 1 84px", minWidth: 78, textAlign: "center", background: "#fff", border: "1.5px solid", borderRadius: 10, padding: "12px 6px" },
  puntoVivo: { width: 8, height: 8, borderRadius: "50%", background: "#2E7D6B", animation: "dueloPulso 1.4s ease-in-out infinite" },
  h3Ranking: { fontFamily: "Georgia, serif", fontSize: 20, color: "#14213D", margin: 0 },
  rankingColumnas: { display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 4, alignItems: "stretch" },
  columnaRanking: { flex: 1, minWidth: 240, background: "#fff", border: "1px solid #E4E1D8", borderRadius: 12, padding: "14px 14px 16px" },
  energiaWrap: { position: "relative", borderRadius: 9, padding: 1.5, marginBottom: 8, overflow: "hidden" },
  energiaAnillo: { position: "absolute", inset: -20, animation: "energiaGiro 3.5s linear infinite" },
  dueloAviso: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "calc(100% - 36px)", margin: "14px 18px 0", padding: "12px 16px", borderRadius: 10, border: "none", background: "#B0533E", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", animation: "dueloPulso 1.6s ease-in-out infinite" },
  main: { padding: "24px 22px 50px", maxWidth: 820, margin: "0 auto" },
  card: { background: "#fff", border: "1px solid #E4E1D8", borderRadius: 10, padding: 26 },
  input: { width: "100%", padding: "13px 15px", borderRadius: 8, border: "1px solid #D9D5C9", fontSize: 17, fontFamily: "inherit", color: "#14213D", boxSizing: "border-box" },
  select: { width: "100%", padding: "13px 15px", borderRadius: 8, border: "1px solid #D9D5C9", fontSize: 17, fontFamily: "inherit", color: "#14213D", background: "#fff" },
  btnPrimary: { background: "#14213D", color: "#fff", border: "none", borderRadius: 8, padding: "15px 22px", fontSize: 17, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  btnSecondary: { background: "transparent", color: "#14213D", border: "1px solid #14213D", borderRadius: 8, padding: "12px 18px", fontSize: 16, cursor: "pointer", display: "inline-flex", alignItems: "center" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: 6 },
  chip: { border: "1px solid", borderRadius: 22, padding: "9px 18px", fontSize: 16, cursor: "pointer" },
  option: { display: "block", width: "100%", textAlign: "left", padding: "16px 18px", borderRadius: 8, border: "1px solid #E4E1D8", marginBottom: 10, fontSize: 18, cursor: "pointer", color: "#14213D" },
  runHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  progressTrack: { height: 4, background: "#E4E1D8", borderRadius: 2, marginTop: 10 },
  progressFill: { height: 4, background: "#2E7D6B", borderRadius: 2, transition: "width .3s" },
  cuadroPregunta: { width: 40, height: 40, borderRadius: 8, border: "2px solid", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  expandBtn: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" },
  rankRow: { display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", border: "1px solid #E4E1D8", borderRadius: 8, marginBottom: 8, fontSize: 16 },
  vsHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px 6px", borderBottom: "1px solid #E4E1D8" },
  daypoCard: { background: "#fff", border: "1px solid #ccc", borderRadius: 4, padding: 22 },
  daypoPregunta: { fontFamily: "Arial, Helvetica, sans-serif", fontSize: 19, fontWeight: 700, color: "#222", lineHeight: 1.5, marginBottom: 18 },
  daypoOpcion: { display: "flex", alignItems: "center", gap: 12, width: "100%", boxSizing: "border-box", textAlign: "left", padding: "13px 14px", borderRadius: 4, border: "1px solid #ccc", marginBottom: 8, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 16, color: "#222", background: "#fff", cursor: "pointer", WebkitAppearance: "none", appearance: "none", outline: "none" },
  daypoOpcionCorrecta: { borderColor: "#4caf50", background: "#e8f8e8" },
  daypoOpcionIncorrecta: { borderColor: "#e05353", background: "#fbe6e6" },
  daypoLetra: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", border: "1px solid #999", fontSize: 13, fontWeight: 700, flexShrink: 0 },
  daypoFeedback: { fontFamily: "Arial, Helvetica, sans-serif", fontSize: 15, fontWeight: 700, padding: "12px 14px", borderRadius: 4, marginTop: 10 },
  daypoFeedbackOk: { background: "#e8f8e8", color: "#2e7d32" },
  daypoFeedbackMal: { background: "#fbe6e6", color: "#c62828" },
  opcion: { display: "block", width: "100%", textAlign: "left", padding: "11px 14px", borderRadius: 6, border: "1px solid #E4E1D8", marginBottom: 8, fontSize: 14, cursor: "pointer", color: "#14213D" },
  opcionCorrectaLegacy: { borderColor: "#2E7D6B", background: "#EEF3F1", display: "flex", alignItems: "center", gap: 8 },
};
