import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Compass, BookOpen, ListChecks, Trophy, Clock, ChevronRight, ChevronDown,
  Plus, Check, X, Loader2, LogOut, RotateCcw, Flag, Pencil, Trash2,
  Zap, Heart, Swords, Settings
} from "lucide-react";
import { supabase } from "./supabaseClient";

const ADMIN_NAME = "pabloadmin";

const TEMARIO = [
  { curso: "Psicopatología", color: "#FF9500", temas: [
    { nombre: "Trastornos del estado de ánimo", contenido: "Episodio depresivo mayor, trastorno bipolar tipo I y II, ciclotimia, distimia. Criterios diagnósticos, curso y diagnóstico diferencial." },
    { nombre: "Trastornos de ansiedad", contenido: "Trastorno de pánico, TAG, fobia específica, fobia social, agorafobia. Modelos explicativos cognitivo-conductuales." },
    { nombre: "Trastornos psicóticos", contenido: "Esquizofrenia, trastorno esquizoafectivo, trastorno delirante. Síntomas positivos y negativos, criterios temporales." }
  ]},
  { curso: "Evaluación psicológica", color: "#007AFF", temas: [
    { nombre: "Instrumentos de evaluación", contenido: "Tests de personalidad (MMPI, 16PF), tests de inteligencia (WAIS, WISC), entrevistas estructuradas." },
    { nombre: "Fiabilidad y validez", contenido: "Consistencia interna, fiabilidad test-retest, validez de contenido, de constructo y de criterio." }
  ]},
  { curso: "Psicología clínica", color: "#34C759", temas: [
    { nombre: "Terapia cognitivo-conductual", contenido: "Modelo ABC, reestructuración cognitiva, técnicas conductuales de exposición y activación." },
    { nombre: "Terapias de tercera generación", contenido: "ACT, terapia dialéctico-conductual, mindfulness aplicado a clínica." },
    { nombre: "Trastornos de la conducta alimentaria", contenido: "Anorexia, bulimia, trastorno por atracón. Criterios diferenciales y abordaje terapéutico." }
  ]},
  { curso: "Neuropsicología", color: "#AF52DE", temas: [
    { nombre: "Funciones cognitivas", contenido: "Atención, memoria, funciones ejecutivas, lenguaje. Síndromes neuropsicológicos principales (afasias, apraxias, agnosias)." }
  ]},
  { curso: "Psicología social", color: "#FF3B30", temas: [
    { nombre: "Procesos grupales", contenido: "Pensamiento grupal, polarización, facilitación social, dinámica de roles." },
    { nombre: "Influencia social", contenido: "Conformidad (Asch), obediencia (Milgram), persuasión y cambio de actitudes." }
  ]}
];

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

export default function AcademiaPIR() {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [user, setUser] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [section, setSection] = useState("simulacros");
  const [questions, setQuestions] = useState([]);
  const [ranking, setRanking] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const u = await loadPersonal("pir-user", null);
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
        setUser(u);
        setQuestions(qData || []);
        setRanking(rData || []);
        setReady(true);
      } catch (err) {
        setLoadError(err && err.message ? err.message : String(err));
        setReady(true);
      }
    })();
  }, []);

  const handleLogin = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    const isAdmin = trimmed.toLowerCase() === ADMIN_NAME.toLowerCase();
    const u = { name: isAdmin ? "Pablo" : trimmed, isAdmin };
    setUser(u);
    await savePersonal("pir-user", u);
  };

  const handleLogout = async () => {
    setUser(null);
    await savePersonal("pir-user", null);
  };

  const addQuestion = async (q) => {
    const { data, error } = await supabase
      .from("preguntas")
      .insert([{
        curso: q.curso, tema: q.tema, pregunta: q.pregunta,
        opciones: q.opciones, correcta: q.correcta, explicacion: q.explicacion
      }])
      .select();
    if (!error && data && data[0]) setQuestions((prev) => [...prev, data[0]]);
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

  if (!ready) {
    return <div style={{ ...styles.center, height: "100%", minHeight: 400, background: styles.app.background }}><Loader2 className="animate-spin" size={30} color="#007AFF" /></div>;
  }

  if (loadError) {
    return (
      <div style={{ ...styles.app, padding: 24 }}>
        <h2 style={{ fontFamily: "-apple-system, sans-serif", color: "#FF3B30", fontWeight: 700 }}>No se pudo conectar</h2>
        <p style={{ color: "#8E8E93", fontSize: 15, lineHeight: 1.5 }}>{loadError}</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen nameInput={nameInput} setNameInput={setNameInput} onSubmit={handleLogin} />;
  }

  const sectionTitles = {
    simulacros: "Autoevaluaciones",
    banco: "Banco",
    temario: "Temario",
    duelo: "Duelo 1v1",
    ranking: "Ranking",
  };

  return (
    <div style={styles.app}>
      <TopBar user={user} onLogout={handleLogout} title={sectionTitles[section]} />
      <main style={styles.main}>
        {section === "simulacros" && <Simulacros questions={questions} user={user} onFinish={submitScore} ranking={ranking} />}
        {section === "banco" && (
          <BancoPreguntas
            questions={questions}
            user={user}
            onAdd={addQuestion}
            onUpdate={updateQuestion}
            onDelete={deleteQuestion}
          />
        )}
        {section === "temario" && <Temario />}
        {section === "duelo" && <Duelo user={user} questions={questions} />}
        {section === "ranking" && <Ranking ranking={ranking} user={user} />}
      </main>
      <TabBar section={section} setSection={setSection} />
    </div>
  );
}

/* ---------------------------------------------------------
   Login
--------------------------------------------------------- */
function LoginScreen({ nameInput, setNameInput, onSubmit }) {
  return (
    <div style={{ ...styles.app, ...styles.center, minHeight: "100vh" }}>
      <div style={{ maxWidth: 360, width: "100%", padding: "0 28px", textAlign: "center" }}>
        <div style={styles.appIcon}>
          <Compass size={36} color="#fff" strokeWidth={2} />
        </div>
        <h1 style={styles.h1}>Ruta PIR</h1>
        <p style={{ color: "#8E8E93", fontSize: 16, lineHeight: 1.5, marginBottom: 32 }}>
          Autoevaluaciones, banco de preguntas, duelos 1v1 y ranking en un mismo sitio.
        </p>
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="Tu nombre"
          style={styles.input}
          autoFocus
        />
        <button type="button" onClick={onSubmit} style={{ ...styles.btnPrimary, width: "100%", marginTop: 14 }}>
          Entrar
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Barra superior y barra de pestañas (estilo iOS)
--------------------------------------------------------- */
function TopBar({ user, onLogout, title }) {
  const inicial = user.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <header style={styles.topBar}>
      <h1 style={styles.largeTitle}>{title}</h1>
      <button type="button" onClick={onLogout} style={styles.avatarBtn} title="Salir">
        <span style={styles.avatarCircle}>{inicial}</span>
      </button>
    </header>
  );
}

function TabBar({ section, setSection }) {
  const items = [
    { id: "simulacros", label: "Test", icon: Clock },
    { id: "banco", label: "Banco", icon: ListChecks },
    { id: "temario", label: "Temario", icon: BookOpen },
    { id: "duelo", label: "Duelo", icon: Zap },
    { id: "ranking", label: "Ranking", icon: Trophy },
  ];
  return (
    <nav style={styles.tabBar}>
      {items.map((it) => {
        const Icon = it.icon;
        const active = section === it.id;
        return (
          <button
            type="button"
            key={it.id}
            onClick={() => setSection(it.id)}
            style={styles.tabBtn}
          >
            <Icon size={23} strokeWidth={active ? 2.3 : 1.8} color={active ? "#007AFF" : "#8E8E93"} />
            <span style={{ fontSize: 10.5, marginTop: 3, color: active ? "#007AFF" : "#8E8E93", fontWeight: active ? 600 : 400 }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ---------------------------------------------------------
   Autoevaluaciones
--------------------------------------------------------- */
function Simulacros({ questions, user, onFinish, ranking }) {
  const cursos = useMemo(() => ["Todos", ...new Set(questions.map((q) => q.curso))], [questions]);
  const [curso, setCurso] = useState("Todos");
  const disponibles = useMemo(() => (curso === "Todos" ? questions.length : questions.filter((q) => q.curso === curso).length), [curso, questions]);
  const [numPreguntas, setNumPreguntas] = useState(10);
  const [state, setState] = useState("config");
  const [pool, setPool] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [modo, setModo] = useState("normal");

  useEffect(() => {
    let timer;
    if (state === "running") timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  const start = () => {
    const filtered = curso === "Todos" ? questions : questions.filter((q) => q.curso === curso);
    const cantidad = Math.max(1, Math.min(numPreguntas || 1, filtered.length));
    const shuffled = [...filtered].sort(() => Math.random() - 0.5).slice(0, cantidad);
    setPool(shuffled); setIdx(0); setAnswers([]); setSelected(null); setRevealed(false); setSeconds(0); setModo("normal"); setState("running");
  };

  const elegir = (i, e) => {
    if (revealed) return;
    if (e && e.currentTarget) e.currentTarget.blur();
    setSelected(i);
    setRevealed(true);
  };

  const next = async () => {
    if (submitting) return;
    const current = pool[idx];
    const nextAnswers = [...answers, { qId: current.id, pregunta: current, selected, correct: selected === current.correcta }];
    setAnswers(nextAnswers); setSelected(null); setRevealed(false);
    if (idx + 1 < pool.length) { setIdx(idx + 1); }
    else {
      if (modo === "normal") {
        setSubmitting(true);
        const correctCount = nextAnswers.filter((a) => a.correct).length;
        const pct = Math.round((correctCount / pool.length) * 100);
        try {
          await onFinish({ name: user.name, score: correctCount, total: pool.length, pct, seconds, date: new Date().toISOString() });
        } catch {}
        setSubmitting(false);
      }
      setState("done");
    }
  };

  const repasarFalladas = () => {
    const falladas = answers.filter((a) => !a.correct).map((a) => a.pregunta);
    setPool(falladas); setIdx(0); setAnswers([]); setSelected(null); setRevealed(false); setSeconds(0); setModo("repaso"); setState("running");
  };

  const miPosicion = useMemo(() => {
    if (!ranking || ranking.length === 0) return null;
    const ordenado = [...ranking].sort((a, b) => b.pct - a.pct);
    const idxUser = ordenado.findIndex((r) => r.name === user.name);
    return idxUser === -1 ? null : idxUser + 1;
  }, [ranking, user.name]);

  if (questions.length === 0) {
    return (
      <div>
        <EmptyState texto='Añade preguntas desde "Banco" para poder hacer una autoevaluación.' />
      </div>
    );
  }

  if (state === "config") {
    return (
      <div>
        <div style={styles.widgetRow}>
          <div style={styles.widget}>
            <div style={styles.widgetNumber}>{questions.length}</div>
            <div style={styles.widgetLabel}>Preguntas listas</div>
          </div>
          <div style={styles.widget}>
            <div style={styles.widgetNumber}>{miPosicion ? `#${miPosicion}` : "—"}</div>
            <div style={styles.widgetLabel}>Tu puesto</div>
          </div>
        </div>
        <Group>
          <GroupLabel>Curso</GroupLabel>
          <Segmented options={cursos} value={curso} onChange={setCurso} />
        </Group>
        <Group style={{ marginTop: 18 }}>
          <GroupLabel>Cantidad de preguntas (disponibles: {disponibles})</GroupLabel>
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
        </Group>
        <button type="button" onClick={start} style={{ ...styles.btnPrimary, width: "100%", marginTop: 22 }}>Empezar autoevaluación</button>
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
            0% { box-shadow: 0 0 0 0 rgba(52,199,89,0.5); }
            70% { box-shadow: 0 0 0 12px rgba(52,199,89,0); }
            100% { box-shadow: 0 0 0 0 rgba(52,199,89,0); }
          }
          .acierto-anim { animation: acertarPulso 0.6s ease-out; }
        `}</style>
        <div style={styles.runHeader}>
          <span style={{ fontSize: 13, color: "#8E8E93", fontWeight: 500 }}>
            {modo === "repaso" ? "Repaso · " : ""}{idx + 1} de {pool.length}
          </span>
          <span style={{ fontSize: 13, color: "#8E8E93", display: "flex", alignItems: "center", gap: 4 }}><Clock size={13} /> {mm}:{ss}</span>
        </div>
        <div style={styles.progressTrack}><div style={{ ...styles.progressFill, width: `${(idx / pool.length) * 100}%` }} /></div>
        <Card style={{ marginTop: 18 }}>
          <div style={styles.tagCurso}>{q.curso} · {q.tema}</div>
          <p style={styles.preguntaTexto}>{q.pregunta}</p>
          {q.opciones.map((op, i) => {
            const letra = String.fromCharCode(65 + i);
            let estilo = { ...styles.opcion };
            let badgeEstilo = { ...styles.opcionBadge };
            let claseExtra = "";
            if (revealed) {
              if (i === q.correcta) { estilo = { ...estilo, ...styles.opcionCorrecta }; badgeEstilo = { ...badgeEstilo, ...styles.opcionBadgeCorrecta }; claseExtra = "acierto-anim"; }
              else if (i === selected) { estilo = { ...estilo, ...styles.opcionIncorrecta }; badgeEstilo = { ...badgeEstilo, ...styles.opcionBadgeIncorrecta }; }
            } else if (selected === i) {
              estilo = { ...estilo, ...styles.opcionSeleccionada };
              badgeEstilo = { ...badgeEstilo, ...styles.opcionBadgeSeleccionada };
            }
            return (
              <button type="button" key={`${idx}-${i}`} className={claseExtra} onClick={(e) => elegir(i, e)} disabled={revealed} style={estilo}>
                <span style={badgeEstilo}>{letra}</span>
                <span style={{ flex: 1 }}>{op}</span>
                {revealed && i === q.correcta && <Check size={19} color="#34C759" strokeWidth={2.6} />}
                {revealed && i === selected && i !== q.correcta && <X size={19} color="#FF3B30" strokeWidth={2.6} />}
              </button>
            );
          })}
          {revealed && (
            <div style={{ ...styles.feedback, ...(esCorrecta ? styles.feedbackOk : styles.feedbackMal) }}>
              {esCorrecta ? "¡Correcto!" : `Incorrecto. La respuesta correcta es la ${String.fromCharCode(65 + q.correcta)}.`}
              {q.explicacion && <div style={{ marginTop: 6, fontWeight: 400 }}>{q.explicacion}</div>}
            </div>
          )}
          <button type="button" onClick={next} disabled={!revealed} style={{ ...styles.btnPrimary, width: "100%", marginTop: 18, opacity: !revealed ? 0.35 : 1 }}>
            {idx + 1 === pool.length ? "Terminar" : "Siguiente"}
          </button>
        </Card>
      </div>
    );
  }

  const correctCount = answers.filter((a) => a.correct).length;
  const pct = Math.round((correctCount / pool.length) * 100);
  const falladas = answers.filter((a) => !a.correct);
  return (
    <div>
      <Card style={{ textAlign: "center", padding: "36px 24px" }}>
        <div style={{ ...styles.resultRing, borderColor: pct >= 70 ? "#34C759" : pct >= 40 ? "#FF9500" : "#FF3B30" }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: "#1C1C1E" }}>{pct}%</span>
        </div>
        <div style={{ color: "#8E8E93", fontSize: 15, marginTop: 16 }}>{correctCount} de {pool.length} correctas · {Math.floor(seconds / 60)} min {seconds % 60}s</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
          {falladas.length > 0 && (
            <button type="button" onClick={repasarFalladas} style={styles.btnPrimary}>
              Repasar {falladas.length} fallada{falladas.length > 1 ? "s" : ""}
            </button>
          )}
          <button type="button" onClick={() => setState("config")} style={styles.btnSecondary}><RotateCcw size={15} style={{ marginRight: 6 }} /> Nueva autoevaluación</button>
        </div>
      </Card>
      <Group style={{ marginTop: 18 }}>
        <GroupLabel>Repaso</GroupLabel>
        {answers.map((a, i) => (
          <ListRow key={i} isLast={i === answers.length - 1}>
            {a.correct ? <Check size={17} color="#34C759" /> : <X size={17} color="#FF3B30" />}
            <span style={{ fontSize: 15, color: "#1C1C1E", flex: 1, marginLeft: 10 }}>{a.pregunta.pregunta}</span>
          </ListRow>
        ))}
      </Group>
    </div>
  );
}

/* ---------------------------------------------------------
   Banco de preguntas
--------------------------------------------------------- */
function BancoPreguntas({ questions, user, onAdd, onUpdate, onDelete }) {
  const [filtro, setFiltro] = useState("Todos");
  const [showForm, setShowForm] = useState(false);
  const cursos = useMemo(() => ["Todos", ...new Set(questions.map((q) => q.curso))], [questions]);
  const filtered = filtro === "Todos" ? questions : questions.filter((q) => q.curso === filtro);

  return (
    <div>
      <div style={styles.widgetRow}>
        <div style={styles.widget}>
          <div style={styles.widgetNumber}>{questions.length}</div>
          <div style={styles.widgetLabel}>Total preguntas</div>
        </div>
        <button type="button" onClick={() => setShowForm((s) => !s)} style={{ ...styles.widget, ...styles.widgetAction }}>
          <Plus size={22} color="#007AFF" />
          <div style={styles.widgetLabel}>Añadir</div>
        </button>
      </div>
      {showForm && <NuevaPregunta onAdd={(q) => { onAdd(q); setShowForm(false); }} cursos={cursos.filter(c => c !== "Todos")} />}
      <Segmented options={cursos} value={filtro} onChange={setFiltro} />
      <Group style={{ marginTop: 14 }}>
        {filtered.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "#8E8E93", fontSize: 15 }}>Sin preguntas en este curso.</div>}
        {filtered.map((q, i) => (
          <PreguntaCard key={q.id} q={q} isAdmin={user.isAdmin} onUpdate={onUpdate} onDelete={onDelete} isLast={i === filtered.length - 1} />
        ))}
      </Group>
    </div>
  );
}

function PreguntaCard({ q, isAdmin, onUpdate, onDelete, isLast }) {
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
    <div style={{ ...styles.listRow, borderBottom: isLast ? "none" : "0.5px solid #E5E5EA" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={styles.expandBtn}>
        <div style={{ textAlign: "left", flex: 1 }}>
          <div style={styles.tagCurso}>{q.curso} · {q.tema}</div>
          <div style={{ fontSize: 15, color: "#1C1C1E", lineHeight: 1.4, marginTop: 2 }}>{q.pregunta}</div>
        </div>
        <ChevronRight size={18} color="#C7C7CC" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .2s", flexShrink: 0, marginLeft: 8 }} />
      </button>
      {open && (
        <div style={{ marginTop: 12, paddingBottom: 4 }}>
          {q.opciones.map((op, i) => (
            <div key={i} style={{ ...styles.opcion, cursor: "default", ...(i === q.correcta ? styles.opcionCorrecta : {}) }}>
              <span style={{ ...styles.opcionBadge, ...(i === q.correcta ? styles.opcionBadgeCorrecta : {}) }}>{String.fromCharCode(65 + i)}</span>
              <span style={{ flex: 1 }}>{op}</span>
              {i === q.correcta && <Check size={17} color="#34C759" />}
            </div>
          ))}
          {q.explicacion && <p style={{ fontSize: 14, color: "#8E8E93", marginTop: 10, lineHeight: 1.5 }}>{q.explicacion}</p>}
          {isAdmin && (
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => setEditing(true)} style={styles.btnSecondary}>
                <Pencil size={13} style={{ marginRight: 4 }} /> Editar
              </button>
              {!deleting ? (
                <button type="button" onClick={() => setDeleting(true)} style={{ ...styles.btnSecondary, color: "#FF3B30" }}>
                  <Trash2 size={13} style={{ marginRight: 4 }} /> Borrar
                </button>
              ) : (
                <>
                  <span style={{ fontSize: 13, color: "#FF3B30", alignSelf: "center" }}>¿Seguro?</span>
                  <button type="button" onClick={() => onDelete(q.id)} style={{ ...styles.btnSecondary, color: "#fff", background: "#FF3B30" }}>Sí, borrar</button>
                  <button type="button" onClick={() => setDeleting(false)} style={styles.btnSecondary}>Cancelar</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
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
    <Card style={{ marginBottom: 14 }}>
      <GroupLabel>Curso</GroupLabel>
      <input value={curso} onChange={(e) => setCurso(e.target.value)} style={styles.input} placeholder="Ej: Psicopatología" />
      <GroupLabel style={{ marginTop: 12 }}>Tema</GroupLabel>
      <input value={tema} onChange={(e) => setTema(e.target.value)} style={styles.input} placeholder="Ej: Trastornos de ansiedad" />
      <GroupLabel style={{ marginTop: 12 }}>Pregunta</GroupLabel>
      <textarea value={pregunta} onChange={(e) => setPregunta(e.target.value)} style={{ ...styles.input, minHeight: 60 }} />
      <GroupLabel style={{ marginTop: 12 }}>Opciones (marca la correcta)</GroupLabel>
      {opciones.map((op, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <input type="radio" checked={correcta === i} onChange={() => setCorrecta(i)} />
          <input value={op} onChange={(e) => { const next = [...opciones]; next[i] = e.target.value; setOpciones(next); }} style={{ ...styles.input, flex: 1 }} placeholder={`Opción ${i + 1}`} />
        </div>
      ))}
      <GroupLabel style={{ marginTop: 8 }}>Explicación (opcional)</GroupLabel>
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
    <div style={{ padding: 16 }}>
      <GroupLabel>Curso</GroupLabel>
      <input value={curso} onChange={(e) => setCurso(e.target.value)} style={styles.input} />
      <GroupLabel style={{ marginTop: 12 }}>Tema</GroupLabel>
      <input value={tema} onChange={(e) => setTema(e.target.value)} style={styles.input} />
      <GroupLabel style={{ marginTop: 12 }}>Pregunta</GroupLabel>
      <textarea value={pregunta} onChange={(e) => setPregunta(e.target.value)} style={{ ...styles.input, minHeight: 60 }} />
      <GroupLabel style={{ marginTop: 12 }}>Opciones (marca la correcta)</GroupLabel>
      {opciones.map((op, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <input type="radio" checked={correcta === i} onChange={() => setCorrecta(i)} />
          <input value={op} onChange={(e) => { const next = [...opciones]; next[i] = e.target.value; setOpciones(next); }} style={{ ...styles.input, flex: 1 }} />
        </div>
      ))}
      <GroupLabel style={{ marginTop: 8 }}>Explicación (opcional)</GroupLabel>
      <textarea value={explicacion} onChange={(e) => setExplicacion(e.target.value)} style={{ ...styles.input, minHeight: 44 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="button" onClick={submit} disabled={saving} style={{ ...styles.btnPrimary, flex: 1 }}>{saving ? "Guardando..." : "Guardar cambios"}</button>
        <button type="button" onClick={onCancel} style={styles.btnSecondary}>Cancelar</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Duelo 1v1 en tiempo real
--------------------------------------------------------- */
const DURACION_PREGUNTA = 60;
const PAUSA_REVELACION = 5;
const PREGUNTAS_POR_DUELO = 200;

function Duelo({ user, questions }) {
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

  useEffect(() => { duelRef.current = duelo; }, [duelo]);

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
    const { data: esperando } = await supabase
      .from("duelos")
      .select("*")
      .eq("estado", "esperando")
      .is("jugador2", null)
      .neq("jugador1", user.name)
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
      const cantidad = Math.min(PREGUNTAS_POR_DUELO, questions.length);
      const barajadas = [...questions].sort(() => Math.random() - 0.5).slice(0, cantidad);
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

  const salirDuelo = () => {
    setDuelo(null);
    setPreguntasDuelo([]);
    setRespuestasTodas({});
    setFase("lobby");
  };

  if (fase === "lobby" || !duelo) {
    if (questions.length < 4) {
      return <EmptyState texto='Añade al menos 4 preguntas desde "Banco" para poder jugar duelos.' />;
    }
    return (
      <Card style={{ textAlign: "center", padding: "36px 24px" }}>
        <div style={{ ...styles.appIcon, margin: "0 auto 18px", width: 64, height: 64 }}>
          <Swords size={30} color="#fff" />
        </div>
        <p style={{ color: "#8E8E93", fontSize: 15, marginBottom: 24, lineHeight: 1.5 }}>
          Te empareja con la primera persona que también esté buscando. 3 vidas, sin límite de preguntas.
        </p>
        <button type="button" onClick={buscarDuelo} disabled={buscando} style={{ ...styles.btnPrimary, width: "100%" }}>
          {buscando ? "Buscando..." : "Buscar duelo"}
        </button>
      </Card>
    );
  }

  if (fase === "esperando") {
    return (
      <Card style={{ textAlign: "center", padding: "36px 24px" }}>
        <Loader2 className="animate-spin" size={30} color="#007AFF" style={{ marginBottom: 16 }} />
        <p style={{ color: "#8E8E93", fontSize: 15, marginBottom: 22 }}>Esperando a un oponente...</p>
        <button type="button" onClick={salirDuelo} style={styles.btnSecondary}>Cancelar</button>
      </Card>
    );
  }

  if (fase === "terminado") {
    const gane = duelo.ganador === user.name;
    const empate = !duelo.ganador;
    return (
      <Card style={{ textAlign: "center", padding: "36px 24px" }}>
        <Swords size={30} color={empate ? "#8E8E93" : gane ? "#34C759" : "#FF3B30"} style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 24, fontWeight: 700, color: "#1C1C1E" }}>
          {empate ? "Empate" : gane ? "¡Has ganado!" : "Has perdido"}
        </div>
        {!empate && <div style={{ color: "#8E8E93", fontSize: 15, marginTop: 6 }}>Ganador: {duelo.ganador}</div>}
        <button type="button" onClick={salirDuelo} style={{ ...styles.btnPrimary, marginTop: 24 }}>Volver al lobby</button>
      </Card>
    );
  }

  const preguntaActual = preguntasDuelo[duelo.indice % preguntasDuelo.length];
  const revelando = !!duelo.revelado_en;
  const miVidas = soyJugador1 ? duelo.vidas1 : duelo.vidas2;
  const suVidas = soyJugador1 ? duelo.vidas2 : duelo.vidas1;

  return (
    <div>
      <Card style={{ padding: 18, marginBottom: 14 }}>
        <div style={styles.vsHeader}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 14, color: "#1C1C1E", fontWeight: 600 }}>{user.name}</div>
            <Corazones vidas={miVidas} />
          </div>
          <div style={{ fontSize: 12, color: "#8E8E93", textAlign: "center", fontWeight: 600 }}>
            <div>VS</div>
            <div style={{ fontWeight: 400, marginTop: 2 }}>Pregunta {duelo.indice + 1}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, color: "#1C1C1E", fontWeight: 600 }}>{oponenteNombre || "..."}</div>
            <Corazones vidas={suVidas} align="right" />
          </div>
        </div>
      </Card>

      {!revelando && (
        <div style={{ textAlign: "center", margin: "4px 0 10px" }}>
          <span style={{ fontSize: 14, color: tiempoRestante <= 10 ? "#FF3B30" : "#8E8E93", fontWeight: 600 }}>
            <Clock size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />{tiempoRestante}s
          </span>
        </div>
      )}

      {preguntaActual && (
        <Card>
          <p style={styles.preguntaTexto}>{preguntaActual.pregunta}</p>
          {preguntaActual.opciones.map((op, i) => {
            let estilo = { ...styles.opcion };
            let badgeEstilo = { ...styles.opcionBadge };
            if (revelando) {
              if (i === preguntaActual.correcta) { estilo = { ...estilo, ...styles.opcionCorrecta }; badgeEstilo = { ...badgeEstilo, ...styles.opcionBadgeCorrecta }; }
              else if (i === respuestas[miClave]) { estilo = { ...estilo, ...styles.opcionIncorrecta }; badgeEstilo = { ...badgeEstilo, ...styles.opcionBadgeIncorrecta }; }
            } else if (miRespuesta === i) {
              estilo = { ...estilo, ...styles.opcionSeleccionada };
              badgeEstilo = { ...badgeEstilo, ...styles.opcionBadgeSeleccionada };
            }
            return (
              <button
                type="button"
                key={i}
                onClick={() => responder(i)}
                disabled={miRespuesta !== null || revelando}
                style={{ ...estilo, opacity: miRespuesta !== null && miRespuesta !== i && !revelando ? 0.55 : 1 }}
              >
                <span style={badgeEstilo}>{String.fromCharCode(65 + i)}</span>
                <span style={{ flex: 1 }}>{op}</span>
                {revelando && i === respuestas[miClave] && i !== preguntaActual.correcta && <span style={{ fontSize: 11, color: "#FF3B30" }}>tú</span>}
                {revelando && respuestas[soyJugador1 ? "jugador2" : "jugador1"] === i && i !== preguntaActual.correcta && i !== respuestas[miClave] && <span style={{ fontSize: 11, color: "#8E8E93" }}>{oponenteNombre}</span>}
              </button>
            );
          })}
          {miRespuesta !== null && !revelando && (
            <p style={{ fontSize: 13, color: "#8E8E93", textAlign: "center", marginTop: 10 }}>Esperando al oponente...</p>
          )}
          {revelando && (
            <p style={{ fontSize: 13, color: "#8E8E93", textAlign: "center", marginTop: 10 }}>
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
    <div style={{ display: "flex", gap: 3, justifyContent: align === "right" ? "flex-end" : "flex-start", marginTop: 4 }}>
      {[0, 1, 2].map((i) => (
        <Heart key={i} size={16} color={i < vidas ? "#FF3B30" : "#E5E5EA"} fill={i < vidas ? "#FF3B30" : "none"} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------
   Temario
--------------------------------------------------------- */
function Temario() {
  return (
    <div>
      {TEMARIO.map((curso, i) => <CursoBlock key={curso.curso} curso={curso} isLast={i === TEMARIO.length - 1} />)}
    </div>
  );
}

function CursoBlock({ curso, isLast }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ marginBottom: isLast ? 0 : 12, padding: 0, overflow: "hidden" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...styles.expandBtn, padding: 18 }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: curso.color, marginRight: 12, flexShrink: 0 }} />
        <div style={{ fontSize: 17, color: "#1C1C1E", fontWeight: 600, flex: 1, textAlign: "left" }}>{curso.curso}</div>
        <ChevronRight size={18} color="#C7C7CC" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && (
        <div style={{ padding: "0 18px 18px" }}>
          {curso.temas.map((t) => (
            <div key={t.nombre} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14.5, color: "#1C1C1E", fontWeight: 600, marginBottom: 3 }}>{t.nombre}</div>
              <p style={{ fontSize: 14, color: "#8E8E93", lineHeight: 1.5, margin: 0 }}>{t.contenido}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------
   Ranking
--------------------------------------------------------- */
function Ranking({ ranking, user }) {
  const sorted = [...ranking].sort((a, b) => b.pct - a.pct);
  return (
    <div>
      {sorted.length === 0 && <EmptyState texto="Haz una autoevaluación para aparecer aquí." />}
      <Group>
        {sorted.map((r, i) => (
          <ListRow key={r.id || i} isLast={i === sorted.length - 1} tinted={r.name === user.name}>
            <span style={{ width: 28, fontSize: 15, fontWeight: 700, color: i === 0 ? "#FF9500" : i === 1 ? "#8E8E93" : i === 2 ? "#CD7F32" : "#C7C7CC" }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 15.5, color: "#1C1C1E", fontWeight: r.name === user.name ? 700 : 400 }}>{r.name}</span>
            <span style={{ fontSize: 13, color: "#8E8E93", marginRight: 10 }}>{r.score}/{r.total}</span>
            <span style={{ fontSize: 15, color: "#34C759", fontWeight: 700, width: 46, textAlign: "right" }}>{r.pct}%</span>
          </ListRow>
        ))}
      </Group>
    </div>
  );
}

/* ---------------------------------------------------------
   Piezas de UI reutilizables (estilo iOS)
--------------------------------------------------------- */
function Card({ children, style }) {
  return <div style={{ ...styles.card, ...style }}>{children}</div>;
}

function Group({ children, style }) {
  return <div style={{ ...styles.card, padding: 0, overflow: "hidden", ...style }}>{children}</div>;
}

function GroupLabel({ children, style }) {
  return <div style={{ fontSize: 13, color: "#8E8E93", fontWeight: 600, marginBottom: 8, ...style }}>{children}</div>;
}

function ListRow({ children, isLast, tinted }) {
  return (
    <div style={{ ...styles.listRow, display: "flex", alignItems: "center", borderBottom: isLast ? "none" : "0.5px solid #E5E5EA", background: tinted ? "#F0F8FF" : "transparent" }}>
      {children}
    </div>
  );
}

function EmptyState({ texto }) {
  return (
    <Card style={{ textAlign: "center", color: "#8E8E93", padding: "32px 20px", fontSize: 15 }}>
      {texto}
    </Card>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={styles.segmentedWrap}>
      {options.map((opt) => (
        <button
          type="button"
          key={opt}
          onClick={() => onChange(opt)}
          style={{ ...styles.segmentedBtn, ...(value === opt ? styles.segmentedBtnActive : {}) }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------
   Estilos — sistema visual iOS
--------------------------------------------------------- */
const styles = {
  app: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
    background: "#F2F2F7",
    minHeight: "100vh",
    color: "#1C1C1E",
    WebkitUserSelect: "none",
    userSelect: "none",
    WebkitTouchCallout: "none",
    display: "flex",
    flexDirection: "column",
  },
  center: { display: "flex", alignItems: "center", justifyContent: "center" },
  appIcon: { width: 76, height: 76, borderRadius: 20, background: "linear-gradient(135deg, #007AFF, #34AADC)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" },
  h1: { fontSize: 30, fontWeight: 700, margin: "0 0 8px", color: "#1C1C1E", letterSpacing: -0.4 },

  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px 10px", background: "#F2F2F7", position: "sticky", top: 0, zIndex: 5 },
  largeTitle: { fontSize: 30, fontWeight: 700, color: "#1C1C1E", margin: 0, letterSpacing: -0.5 },
  avatarBtn: { background: "none", border: "none", cursor: "pointer", padding: 0 },
  avatarCircle: { width: 34, height: 34, borderRadius: 17, background: "#007AFF", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600 },

  tabBar: { display: "flex", background: "rgba(249,249,251,0.94)", backdropFilter: "blur(20px)", borderTop: "0.5px solid #D1D1D6", padding: "8px 4px calc(env(safe-area-inset-bottom, 0px) + 6px)", position: "sticky", bottom: 0, zIndex: 10 },
  tabBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "none", border: "none", padding: "4px 2px", cursor: "pointer" },

  main: { flex: 1, padding: "4px 16px 24px", maxWidth: 640, margin: "0 auto", width: "100%", boxSizing: "border-box" },

  widgetRow: { display: "flex", gap: 12, marginBottom: 16 },
  widget: { flex: 1, background: "#fff", borderRadius: 16, padding: "16px 14px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  widgetAction: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none" },
  widgetNumber: { fontSize: 24, fontWeight: 700, color: "#1C1C1E" },
  widgetLabel: { fontSize: 12.5, color: "#8E8E93", marginTop: 3, fontWeight: 500 },

  card: { background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },

  input: { width: "100%", padding: "13px 15px", borderRadius: 12, border: "1px solid #E5E5EA", fontSize: 16, fontFamily: "inherit", color: "#1C1C1E", boxSizing: "border-box", background: "#F2F2F7" },

  btnPrimary: { background: "#007AFF", color: "#fff", border: "none", borderRadius: 14, padding: "15px 22px", fontSize: 16.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  btnSecondary: { background: "rgba(0,122,255,0.12)", color: "#007AFF", border: "none", borderRadius: 14, padding: "12px 18px", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center" },

  segmentedWrap: { display: "flex", gap: 3, background: "#E5E5EA", borderRadius: 10, padding: 3, overflowX: "auto" },
  segmentedBtn: { flex: "1 0 auto", border: "none", background: "transparent", borderRadius: 8, padding: "8px 12px", fontSize: 14, fontWeight: 500, color: "#1C1C1E", cursor: "pointer", whiteSpace: "nowrap" },
  segmentedBtnActive: { background: "#fff", fontWeight: 600, boxShadow: "0 1px 3px rgba(0,0,0,0.12)" },

  tagCurso: { fontSize: 12, color: "#007AFF", marginBottom: 10, fontWeight: 600 },
  preguntaTexto: { fontFamily: "-apple-system, sans-serif", fontSize: 19, fontWeight: 600, color: "#1C1C1E", lineHeight: 1.45, marginBottom: 18 },

  opcion: { display: "flex", alignItems: "center", gap: 12, width: "100%", boxSizing: "border-box", textAlign: "left", padding: "14px 16px", borderRadius: 14, border: "1px solid #E5E5EA", marginBottom: 10, fontFamily: "-apple-system, sans-serif", fontSize: 16, color: "#1C1C1E", background: "#F9F9FB", cursor: "pointer", WebkitAppearance: "none", appearance: "none", outline: "none" },
  opcionSeleccionada: { borderColor: "#007AFF", background: "#EAF3FF" },
  opcionCorrecta: { borderColor: "#34C759", background: "#EAFBEF" },
  opcionIncorrecta: { borderColor: "#FF3B30", background: "#FDECEB" },
  opcionBadge: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 13, background: "#E5E5EA", color: "#636366", fontSize: 13, fontWeight: 700, flexShrink: 0 },
  opcionBadgeSeleccionada: { background: "#007AFF", color: "#fff" },
  opcionBadgeCorrecta: { background: "#34C759", color: "#fff" },
  opcionBadgeIncorrecta: { background: "#FF3B30", color: "#fff" },

  runHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px" },
  progressTrack: { height: 5, background: "#E5E5EA", borderRadius: 3, marginTop: 8 },
  progressFill: { height: 5, background: "#007AFF", borderRadius: 3, transition: "width .3s" },

  feedback: { fontFamily: "-apple-system, sans-serif", fontSize: 15, fontWeight: 600, padding: "13px 15px", borderRadius: 14, marginTop: 6 },
  feedbackOk: { background: "#EAFBEF", color: "#248A3D" },
  feedbackMal: { background: "#FDECEB", color: "#D70015" },

  resultRing: { width: 100, height: 100, borderRadius: 50, border: "6px solid", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" },

  listRow: { padding: "14px 16px", display: "flex", alignItems: "center" },
  expandBtn: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" },

  vsHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
};
