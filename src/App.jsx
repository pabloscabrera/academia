import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Compass, BookOpen, ListChecks, Trophy, Clock, ChevronRight, ChevronDown,
  Plus, Check, X, Loader2, User, LogOut, RotateCcw, Flag, Pencil, Trash2,
  Zap, Heart, Swords
} from "lucide-react";
import { supabase } from "./supabaseClient";

const ADMIN_NAME = "pabloadmin";

const TEMARIO = [
  { curso: "Psicopatología", color: "#2E7D6B", temas: [
    { nombre: "Trastornos del estado de ánimo", contenido: "Episodio depresivo mayor, trastorno bipolar tipo I y II, ciclotimia, distimia. Criterios diagnósticos, curso y diagnóstico diferencial." },
    { nombre: "Trastornos de ansiedad", contenido: "Trastorno de pánico, TAG, fobia específica, fobia social, agorafobia. Modelos explicativos cognitivo-conductuales." },
    { nombre: "Trastornos psicóticos", contenido: "Esquizofrenia, trastorno esquizoafectivo, trastorno delirante. Síntomas positivos y negativos, criterios temporales." }
  ]},
  { curso: "Evaluación psicológica", color: "#3B6FA0", temas: [
    { nombre: "Instrumentos de evaluación", contenido: "Tests de personalidad (MMPI, 16PF), tests de inteligencia (WAIS, WISC), entrevistas estructuradas." },
    { nombre: "Fiabilidad y validez", contenido: "Consistencia interna, fiabilidad test-retest, validez de contenido, de constructo y de criterio." }
  ]},
  { curso: "Psicología clínica", color: "#C89B3C", temas: [
    { nombre: "Terapia cognitivo-conductual", contenido: "Modelo ABC, reestructuración cognitiva, técnicas conductuales de exposición y activación." },
    { nombre: "Terapias de tercera generación", contenido: "ACT, terapia dialéctico-conductual, mindfulness aplicado a clínica." },
    { nombre: "Trastornos de la conducta alimentaria", contenido: "Anorexia, bulimia, trastorno por atracón. Criterios diferenciales y abordaje terapéutico." }
  ]},
  { curso: "Neuropsicología", color: "#8A5A9E", temas: [
    { nombre: "Funciones cognitivas", contenido: "Atención, memoria, funciones ejecutivas, lenguaje. Síndromes neuropsicológicos principales (afasias, apraxias, agnosias)." }
  ]},
  { curso: "Psicología social", color: "#B0533E", temas: [
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
    return <div style={{ ...styles.center, height: "100%", minHeight: 400 }}><Loader2 className="animate-spin" size={28} color="#2E7D6B" /></div>;
  }

  if (loadError) {
    return (
      <div style={{ ...styles.app, padding: 24 }}>
        <h2 style={{ fontFamily: "Georgia, serif", color: "#B0533E" }}>No se pudo conectar</h2>
        <p style={{ color: "#5B6472", fontSize: 14, lineHeight: 1.5 }}>{loadError}</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen nameInput={nameInput} setNameInput={setNameInput} onSubmit={handleLogin} />;
  }

  return (
    <div style={styles.app}>
      <Header user={user} onLogout={handleLogout} />
      <Nav section={section} setSection={setSection} />
      <main style={styles.main}>
        {section === "simulacros" && <Simulacros questions={questions} user={user} onFinish={submitScore} />}
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
    </div>
  );
}

function LoginScreen({ nameInput, setNameInput, onSubmit }) {
  return (
    <div style={{ ...styles.app, ...styles.center, minHeight: 520 }}>
      <div style={{ maxWidth: 340, width: "100%", padding: "0 24px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <Compass size={34} color="#2E7D6B" strokeWidth={1.6} />
        </div>
        <h1 style={styles.h1}>Ruta PIR</h1>
        <p style={{ color: "#5B6472", fontSize: 15, lineHeight: 1.5, marginBottom: 28 }}>
          Simulacros, banco de preguntas, duelos 1v1 y ranking en un mismo sitio.
        </p>
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="Tu nombre"
          style={styles.input}
          autoFocus
        />
        <button type="button" onClick={onSubmit} style={{ ...styles.btnPrimary, width: "100%", marginTop: 12 }}>
          Entrar
        </button>
      </div>
    </div>
  );
}

function Header({ user, onLogout }) {
  return (
    <header style={styles.header}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Compass size={20} color="#2E7D6B" strokeWidth={1.8} />
        <span style={{ fontFamily: "Georgia, serif", fontSize: 18, color: "#14213D" }}>Ruta PIR</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: "#5B6472", display: "flex", alignItems: "center", gap: 4 }}>
          <User size={14} /> {user.name}{user.isAdmin ? " · admin" : ""}
        </span>
        <button type="button" onClick={onLogout} style={styles.iconBtn} title="Salir">
          <LogOut size={15} color="#5B6472" />
        </button>
      </div>
    </header>
  );
}

function Nav({ section, setSection }) {
  const items = [
    { id: "simulacros", label: "Simulacros", icon: Clock },
    { id: "banco", label: "Banco de preguntas", icon: ListChecks },
    { id: "temario", label: "Temario", icon: BookOpen },
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
            style={{ ...styles.navBtn, color: active ? "#14213D" : "#8A93A3", borderBottom: active ? "2px solid #2E7D6B" : "2px solid transparent" }}
          >
            <Icon size={15} />
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Simulacros({ questions, user, onFinish }) {
  const cursos = useMemo(() => ["Todos", ...new Set(questions.map((q) => q.curso))], [questions]);
  const [curso, setCurso] = useState("Todos");
  const [numPreguntas, setNumPreguntas] = useState(10);
  const [state, setState] = useState("config");
  const [pool, setPool] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let timer;
    if (state === "running") timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  const start = () => {
    const filtered = curso === "Todos" ? questions : questions.filter((q) => q.curso === curso);
    const shuffled = [...filtered].sort(() => Math.random() - 0.5).slice(0, Math.min(numPreguntas, filtered.length));
    setPool(shuffled); setIdx(0); setAnswers([]); setSelected(null); setSeconds(0); setState("running");
  };

  const choose = (i) => { if (!submitting) setSelected(i); };

  const next = async () => {
    if (submitting) return;
    const current = pool[idx];
    const nextAnswers = [...answers, { qId: current.id, selected, correct: selected === current.correcta }];
    setAnswers(nextAnswers); setSelected(null);
    if (idx + 1 < pool.length) { setIdx(idx + 1); }
    else {
      setSubmitting(true);
      const correctCount = nextAnswers.filter((a) => a.correct).length;
      const pct = Math.round((correctCount / pool.length) * 100);
      try {
        await onFinish({ name: user.name, score: correctCount, total: pool.length, pct, seconds, date: new Date().toISOString() });
      } catch {}
      setState("done");
      setSubmitting(false);
    }
  };

  if (questions.length === 0) {
    return (
      <div>
        <SectionTitle title="Simulacros" subtitle="Todavía no hay preguntas en el banco." />
        <Card style={{ textAlign: "center", color: "#8A93A3", padding: "28px 16px" }}>
          Añade preguntas desde "Banco de preguntas" para poder hacer un simulacro.
        </Card>
      </div>
    );
  }

  if (state === "config") {
    return (
      <div>
        <SectionTitle title="Simulacros" subtitle="Elige curso y cantidad de preguntas para empezar." />
        <Card>
          <FieldLabel>Curso</FieldLabel>
          <select value={curso} onChange={(e) => setCurso(e.target.value)} style={styles.select}>
            {cursos.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <FieldLabel style={{ marginTop: 16 }}>Cantidad de preguntas</FieldLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[5, 10, 20, 50].map((n) => (
              <button type="button" key={n} onClick={() => setNumPreguntas(n)} style={{ ...styles.chip, background: numPreguntas === n ? "#14213D" : "transparent", color: numPreguntas === n ? "#fff" : "#14213D", borderColor: "#14213D" }}>{n}</button>
            ))}
          </div>
          <button type="button" onClick={start} style={{ ...styles.btnPrimary, width: "100%", marginTop: 22 }}>Empezar simulacro</button>
        </Card>
      </div>
    );
  }

  if (state === "running") {
    const q = pool[idx];
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return (
      <div>
        <div style={styles.runHeader}>
          <span style={{ fontSize: 13, color: "#5B6472" }}>Pregunta {idx + 1} de {pool.length}</span>
          <span style={{ fontSize: 13, color: "#5B6472", display: "flex", alignItems: "center", gap: 4 }}><Clock size={13} /> {mm}:{ss}</span>
        </div>
        <div style={styles.progressTrack}><div style={{ ...styles.progressFill, width: `${(idx / pool.length) * 100}%` }} /></div>
        <Card style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: "#2E7D6B", marginBottom: 8 }}>{q.curso} · {q.tema}</div>
          <p style={{ fontSize: 16, color: "#14213D", lineHeight: 1.5, marginBottom: 18 }}>{q.pregunta}</p>
          {q.opciones.map((op, i) => (
            <button type="button" key={i} onClick={() => choose(i)} style={{ ...styles.option, borderColor: selected === i ? "#14213D" : "#E4E1D8", background: selected === i ? "#EEF3F1" : "#fff" }}>{op}</button>
          ))}
          <button type="button" onClick={next} disabled={selected === null} style={{ ...styles.btnPrimary, width: "100%", marginTop: 18, opacity: selected === null ? 0.4 : 1 }}>
            {idx + 1 === pool.length ? "Terminar" : "Siguiente"}
          </button>
        </Card>
      </div>
    );
  }

  const correctCount = answers.filter((a) => a.correct).length;
  const pct = Math.round((correctCount / pool.length) * 100);
  return (
    <div>
      <SectionTitle title="Resultado" />
      <Card style={{ textAlign: "center", padding: "32px 20px" }}>
        <Flag size={26} color="#2E7D6B" style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 40, fontFamily: "Georgia, serif", color: "#14213D" }}>{pct}%</div>
        <div style={{ color: "#5B6472", fontSize: 14, marginTop: 4 }}>{correctCount} de {pool.length} correctas · {Math.floor(seconds / 60)} min {seconds % 60}s</div>
        <button type="button" onClick={() => setState("config")} style={{ ...styles.btnSecondary, marginTop: 22 }}><RotateCcw size={14} style={{ marginRight: 6 }} /> Repetir simulacro</button>
      </Card>
      <div style={{ marginTop: 20 }}>
        <FieldLabel>Repaso</FieldLabel>
        {pool.map((q, i) => {
          const a = answers[i];
          return (
            <div key={q.id} style={styles.reviewRow}>
              {a.correct ? <Check size={15} color="#2E7D6B" /> : <X size={15} color="#B0533E" />}
              <span style={{ fontSize: 13, color: "#14213D", flex: 1 }}>{q.pregunta}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BancoPreguntas({ questions, user, onAdd, onUpdate, onDelete }) {
  const [filtro, setFiltro] = useState("Todos");
  const [showForm, setShowForm] = useState(false);
  const cursos = useMemo(() => ["Todos", ...new Set(questions.map((q) => q.curso))], [questions]);
  const filtered = filtro === "Todos" ? questions : questions.filter((q) => q.curso === filtro);

  return (
    <div>
      <SectionTitle
        title="Banco de preguntas"
        subtitle={`${questions.length} preguntas disponibles`}
        action={
          <button type="button" onClick={() => setShowForm((s) => !s)} style={styles.btnSecondary}>
            <Plus size={14} style={{ marginRight: 4 }} /> Añadir
          </button>
        }
      />
      {showForm && <NuevaPregunta onAdd={(q) => { onAdd(q); setShowForm(false); }} cursos={cursos.filter(c => c !== "Todos")} />}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "4px 0 14px" }}>
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
      {filtered.map((q) => (
        <PreguntaCard key={q.id} q={q} isAdmin={user.isAdmin} onUpdate={onUpdate} onDelete={onDelete} />
      ))}
    </div>
  );
}

function PreguntaCard({ q, isAdmin, onUpdate, onDelete }) {
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
    <Card style={{ marginBottom: 10 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={styles.expandBtn}>
        <div style={{ textAlign: "left", flex: 1 }}>
          <div style={{ fontSize: 11, color: "#2E7D6B", marginBottom: 4 }}>{q.curso} · {q.tema}</div>
          <div style={{ fontSize: 14, color: "#14213D", lineHeight: 1.4 }}>{q.pregunta}</div>
        </div>
        {open ? <ChevronDown size={16} color="#8A93A3" /> : <ChevronRight size={16} color="#8A93A3" />}
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          {q.opciones.map((op, i) => (
            <div key={i} style={{ ...styles.option, cursor: "default", borderColor: i === q.correcta ? "#2E7D6B" : "#E4E1D8", background: i === q.correcta ? "#EEF3F1" : "#fff", display: "flex", alignItems: "center", gap: 8 }}>
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
const PREGUNTAS_POR_DUELO = 10;

function Duelo({ user, questions }) {
  const [fase, setFase] = useState("lobby");
  const [duelo, setDuelo] = useState(null);
  const [preguntasDuelo, setPreguntasDuelo] = useState([]);
  const [miRespuesta, setMiRespuesta] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [tiempoRestante, setTiempoRestante] = useState(DURACION_PREGUNTA);
  const [cuentaRevelacion, setCuentaRevelacion] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const channelRef = useRef(null);
  const avanzadoRef = useRef(null);

  const soyJugador1 = duelo && user.name === duelo.jugador1;
  const miClave = soyJugador1 ? "jugador1" : "jugador2";
  const oponenteNombre = duelo ? (soyJugador1 ? duelo.jugador2 : duelo.jugador1) : null;

  useEffect(() => {
    if (!duelo || !duelo.id) return;
    const channel = supabase
      .channel(`duelo-${duelo.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "duelos", filter: `id=eq.${duelo.id}` }, (payload) => {
        setDuelo(payload.new);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "duelo_respuestas", filter: `duelo_id=eq.${duelo.id}` }, (payload) => {
        const r = payload.new;
        setRespuestas((prev) => {
          if (r.indice !== (duelo ? duelo.indice : -1)) return prev;
          const key = r.jugador === duelo.jugador1 ? "jugador1" : "jugador2";
          return { ...prev, [key]: r.opcion };
        });
      })
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelo && duelo.id]);

  useEffect(() => {
    if (!duelo) return;
    setMiRespuesta(null);
    setRespuestas({});
    setTiempoRestante(DURACION_PREGUNTA);
    avanzadoRef.current = null;
    if (duelo.estado === "jugando") setFase("jugando");
    if (duelo.estado === "terminado") setFase("terminado");
    if (duelo.estado === "esperando") setFase("esperando");
    (async () => {
      const { data } = await supabase.from("duelo_respuestas").select("*").eq("duelo_id", duelo.id).eq("indice", duelo.indice);
      if (data) {
        const r = {};
        data.forEach((row) => { r[row.jugador === duelo.jugador1 ? "jugador1" : "jugador2"] = row.opcion; });
        setRespuestas(r);
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
      const barajadas = [...questions].sort(() => Math.random() - 0.5).slice(0, PREGUNTAS_POR_DUELO);
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
    setRespuestas((prev) => ({ ...prev, [miClave]: opcion }));
    await supabase.from("duelo_respuestas").insert([{ duelo_id: duelo.id, jugador: user.name, indice: duelo.indice, opcion }]);
  };

  const resolverPregunta = async () => {
    if (!duelo || duelo.revelado_en) return;
    const preguntaActual = preguntasDuelo[duelo.indice];
    if (!preguntaActual) return;
    const r1 = respuestas.jugador1 !== undefined ? respuestas.jugador1 : -1;
    const r2 = respuestas.jugador2 !== undefined ? respuestas.jugador2 : -1;
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
    if (duelo.indice + 1 >= duelo.preguntas_ids.length) {
      const ganador = vidas1 === vidas2 ? null : (vidas1 > vidas2 ? duelo.jugador1 : duelo.jugador2);
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
    setFase("lobby");
  };

  if (fase === "lobby" || !duelo) {
    if (questions.length < 4) {
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
        <SectionTitle title="Duelo 1v1" subtitle="Reta a otra persona en tiempo real. 3 vidas, 60 segundos por pregunta." />
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

  const preguntaActual = preguntasDuelo[duelo.indice];
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
          <div>{duelo.indice + 1}/{duelo.preguntas_ids.length}</div>
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
          <p style={{ fontSize: 16, color: "#14213D", lineHeight: 1.5, marginBottom: 18 }}>{preguntaActual.pregunta}</p>
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

function Temario() {
  return (
    <div>
      <SectionTitle title="Temario por cursos" subtitle={`${TEMARIO.length} cursos`} />
      {TEMARIO.map((curso) => (<CursoBlock key={curso.curso} curso={curso} />))}
    </div>
  );
}

function CursoBlock({ curso }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ marginBottom: 10, borderLeft: `3px solid ${curso.color}` }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={styles.expandBtn}>
        <div style={{ fontSize: 15, color: "#14213D", fontFamily: "Georgia, serif" }}>{curso.curso}</div>
        {open ? <ChevronDown size={16} color="#8A93A3" /> : <ChevronRight size={16} color="#8A93A3" />}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {curso.temas.map((t) => (
            <div key={t.nombre} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, color: "#14213D", fontWeight: 600, marginBottom: 3 }}>{t.nombre}</div>
              <p style={{ fontSize: 13, color: "#5B6472", lineHeight: 1.5, margin: 0 }}>{t.contenido}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Ranking({ ranking, user }) {
  const sorted = [...ranking].sort((a, b) => b.pct - a.pct);
  return (
    <div>
      <SectionTitle title="Ranking" subtitle="Mejores puntuaciones de la comunidad" />
      {sorted.length === 0 && (
        <Card style={{ textAlign: "center", color: "#8A93A3", padding: "28px 16px" }}>
          Todavía no hay resultados. Haz un simulacro para aparecer aquí.
        </Card>
      )}
      {sorted.map((r, i) => (
        <div key={r.id || i} style={{ ...styles.rankRow, background: r.name === user.name ? "#EEF3F1" : "#fff" }}>
          <span style={{ width: 26, fontSize: 13, color: i < 3 ? "#C89B3C" : "#8A93A3", fontFamily: "Georgia, serif" }}>{i + 1}</span>
          <span style={{ flex: 1, fontSize: 14, color: "#14213D" }}>{r.name}</span>
          <span style={{ fontSize: 13, color: "#5B6472" }}>{r.score}/{r.total}</span>
          <span style={{ fontSize: 14, color: "#2E7D6B", fontWeight: 600, width: 44, textAlign: "right" }}>{r.pct}%</span>
        </div>
      ))}
    </div>
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
  app: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#FBF9F4", minHeight: "100%", color: "#14213D", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" },
  center: { display: "flex", alignItems: "center", justifyContent: "center" },
  h1: { fontFamily: "Georgia, serif", fontSize: 26, margin: "0 0 10px", color: "#14213D" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #E4E1D8" },
  nav: { display: "flex", gap: 4, padding: "0 12px", borderBottom: "1px solid #E4E1D8", overflowX: "auto" },
  navBtn: { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: "12px 10px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" },
  main: { padding: "18px 16px 40px", maxWidth: 640, margin: "0 auto" },
  card: { background: "#fff", border: "1px solid #E4E1D8", borderRadius: 8, padding: 18 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #D9D5C9", fontSize: 14, fontFamily: "inherit", color: "#14213D", boxSizing: "border-box" },
  select: { width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #D9D5C9", fontSize: 14, fontFamily: "inherit", color: "#14213D", background: "#fff" },
  btnPrimary: { background: "#14213D", color: "#fff", border: "none", borderRadius: 6, padding: "11px 18px", fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  btnSecondary: { background: "transparent", color: "#14213D", border: "1px solid #14213D", borderRadius: 6, padding: "9px 14px", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: 4 },
  chip: { border: "1px solid", borderRadius: 20, padding: "6px 14px", fontSize: 13, cursor: "pointer" },
  option: { display: "block", width: "100%", textAlign: "left", padding: "11px 14px", borderRadius: 6, border: "1px solid #E4E1D8", marginBottom: 8, fontSize: 14, cursor: "pointer", color: "#14213D" },
  runHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  progressTrack: { height: 3, background: "#E4E1D8", borderRadius: 2, marginTop: 8 },
  progressFill: { height: 3, background: "#2E7D6B", borderRadius: 2, transition: "width .3s" },
  reviewRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #F0EEE6" },
  expandBtn: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" },
  rankRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid #E4E1D8", borderRadius: 6, marginBottom: 6 },
  vsHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 4px", borderBottom: "1px solid #E4E1D8" },
};
