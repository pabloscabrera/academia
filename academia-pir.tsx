import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Compass, BookOpen, ListChecks, Trophy, Clock, ChevronRight, ChevronDown,
  Plus, Check, X, Loader2, User, LogOut, RotateCcw, Flag
} from "lucide-react";

/* ---------------------------------------------------------
   Datos semilla — banco de preguntas y temario de ejemplo.
   Todo esto lo podés ampliar desde la propia interfaz.
--------------------------------------------------------- */
const SEED_QUESTIONS = [
  {
    id: "q1", curso: "Psicopatología", tema: "Trastornos del estado de ánimo",
    pregunta: "Según los criterios diagnósticos clásicos, ¿cuál es la duración mínima de un episodio depresivo mayor?",
    opciones: ["1 semana", "2 semanas", "1 mes", "6 meses"],
    correcta: 1,
    explicacion: "El episodio depresivo mayor requiere síntomas presentes durante al menos dos semanas consecutivas."
  },
  {
    id: "q2", curso: "Psicopatología", tema: "Trastornos de ansiedad",
    pregunta: "El miedo intenso y súbito que alcanza su máxima expresión en minutos, acompañado de síntomas somáticos, define:",
    opciones: ["Fobia específica", "Crisis de angustia", "Trastorno de ansiedad generalizada", "Ansiedad de separación"],
    correcta: 1,
    explicacion: "La crisis de angustia (ataque de pánico) se caracteriza por un pico de maledad intensa en minutos."
  },
  {
    id: "q3", curso: "Evaluación psicológica", tema: "Instrumentos de evaluación",
    pregunta: "¿Qué mide fundamentalmente el MMPI en su versión clásica?",
    opciones: ["Inteligencia general", "Rasgos de personalidad y psicopatología", "Memoria de trabajo", "Funciones ejecutivas"],
    correcta: 1,
    explicacion: "El MMPI es un inventario multifásico de personalidad orientado a detectar patrones psicopatológicos."
  },
  {
    id: "q4", curso: "Evaluación psicológica", tema: "Fiabilidad y validez",
    pregunta: "La consistencia interna de un test se estima habitualmente mediante:",
    opciones: ["Validez de constructo", "Alfa de Cronbach", "Curva ROC", "Percentil"],
    correcta: 1,
    explicacion: "El alfa de Cronbach es el estadístico más usado para estimar consistencia interna."
  },
  {
    id: "q5", curso: "Psicología clínica", tema: "Terapias de tercera generación",
    pregunta: "La Terapia de Aceptación y Compromiso (ACT) tiene como objetivo central:",
    opciones: [
      "Eliminar por completo los pensamientos negativos",
      "Aumentar la flexibilidad psicológica",
      "Reestructurar creencias irracionales",
      "Extinguir respuestas condicionadas"
    ],
    correcta: 1,
    explicacion: "ACT busca la flexibilidad psicológica: aceptar lo interno y actuar según valores."
  },
  {
    id: "q6", curso: "Psicología clínica", tema: "Terapia cognitivo-conductual",
    pregunta: "En la reestructuración cognitiva de Beck, los 'pensamientos automáticos' se caracterizan por ser:",
    opciones: ["Deliberados y reflexivos", "Involuntarios y creíbles para la persona", "Siempre conscientes", "Ajenos al estado de ánimo"],
    correcta: 1,
    explicacion: "Son pensamientos que surgen de forma involuntaria y se aceptan como verdaderos sin cuestionarlos."
  },
  {
    id: "q7", curso: "Psicología clínica", tema: "Trastornos de la conducta alimentaria",
    pregunta: "Un criterio distintivo entre anorexia nerviosa y bulimia nerviosa es:",
    opciones: [
      "La presencia de atracones",
      "El peso corporal significativamente bajo",
      "La preocupación por la imagen corporal",
      "El uso de purgas"
    ],
    correcta: 1,
    explicacion: "El peso significativamente bajo para la edad y talla es criterio central de anorexia, no de bulimia."
  },
  {
    id: "q8", curso: "Neuropsicología", tema: "Funciones cognitivas",
    pregunta: "La incapacidad para reconocer caras familiares pese a una percepción visual conservada se denomina:",
    opciones: ["Afasia", "Apraxia", "Prosopagnosia", "Agnosia auditiva"],
    correcta: 2,
    explicacion: "La prosopagnosia es un déficit selectivo en el reconocimiento de rostros."
  },
  {
    id: "q9", curso: "Psicología social", tema: "Procesos grupales",
    pregunta: "La tendencia de un grupo a tomar decisiones más extremas que las que tomaría cada individuo por separado se llama:",
    opciones: ["Pensamiento grupal", "Polarización grupal", "Facilitación social", "Difusión de responsabilidad"],
    correcta: 1,
    explicacion: "La polarización grupal describe ese desplazamiento hacia posturas más extremas tras la deliberación."
  },
  {
    id: "q10", curso: "Psicología social", tema: "Influencia social",
    pregunta: "En el experimento clásico de Asch sobre conformidad, la variable manipulada principal era:",
    opciones: [
      "La intensidad del castigo",
      "El tamaño y unanimidad del grupo mayoritario",
      "El nivel de inteligencia del sujeto",
      "El tipo de tarea motriz"
    ],
    correcta: 1,
    explicacion: "Asch variaba el tamaño del grupo y si había disidentes, para medir presión hacia la conformidad."
  }
];

const SEED_TEMARIO = [
  {
    curso: "Psicopatología",
    color: "#2E7D6B",
    temas: [
      { nombre: "Trastornos del estado de ánimo", contenido: "Episodio depresivo mayor, trastorno bipolar tipo I y II, ciclotimia, distimia. Criterios diagnósticos, curso y diagnóstico diferencial." },
      { nombre: "Trastornos de ansiedad", contenido: "Trastorno de pánico, TAG, fobia específica, fobia social, agorafobia. Modelos explicativos cognitivo-conductuales." },
      { nombre: "Trastornos psicóticos", contenido: "Esquizofrenia, trastorno esquizoafectivo, trastorno delirante. Síntomas positivos y negativos, criterios temporales." }
    ]
  },
  {
    curso: "Evaluación psicológica",
    color: "#3B6FA0",
    temas: [
      { nombre: "Instrumentos de evaluación", contenido: "Tests de personalidad (MMPI, 16PF), tests de inteligencia (WAIS, WISC), entrevistas estructuradas." },
      { nombre: "Fiabilidad y validez", contenido: "Consistencia interna, fiabilidad test-retest, validez de contenido, de constructo y de criterio." }
    ]
  },
  {
    curso: "Psicología clínica",
    color: "#C89B3C",
    temas: [
      { nombre: "Terapia cognitivo-conductual", contenido: "Modelo ABC, reestructuración cognitiva, técnicas conductuales de exposición y activación." },
      { nombre: "Terapias de tercera generación", contenido: "ACT, terapia dialéctico-conductual, mindfulness aplicado a clínica." },
      { nombre: "Trastornos de la conducta alimentaria", contenido: "Anorexia, bulimia, trastorno por atracón. Criterios diferenciales y abordaje terapéutico." }
    ]
  },
  {
    curso: "Neuropsicología",
    color: "#8A5A9E",
    temas: [
      { nombre: "Funciones cognitivas", contenido: "Atención, memoria, funciones ejecutivas, lenguaje. Síndromes neuropsicológicos principales (afasias, apraxias, agnosias)." }
    ]
  },
  {
    curso: "Psicología social",
    color: "#B0533E",
    temas: [
      { nombre: "Procesos grupales", contenido: "Pensamiento grupal, polarización, facilitación social, dinámica de roles." },
      { nombre: "Influencia social", contenido: "Conformidad (Asch), obediencia (Milgram), persuasión y cambio de actitudes." }
    ]
  }
];

/* ---------------------------------------------------------
   Utilidades de almacenamiento
--------------------------------------------------------- */
async function loadShared(key, fallback) {
  try {
    const res = await window.storage.get(key, true);
    return res ? JSON.parse(res.value) : fallback;
  } catch {
    return fallback;
  }
}
async function saveShared(key, value) {
  await window.storage.set(key, JSON.stringify(value), true);
}
async function loadPersonal(key, fallback) {
  try {
    const res = await window.storage.get(key, false);
    return res ? JSON.parse(res.value) : fallback;
  } catch {
    return fallback;
  }
}
async function savePersonal(key, value) {
  await window.storage.set(key, JSON.stringify(value), false);
}

/* ---------------------------------------------------------
   Componente principal
--------------------------------------------------------- */
export default function AcademiaPIR() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [section, setSection] = useState("simulacros");
  const [questions, setQuestions] = useState(SEED_QUESTIONS);
  const [temario, setTemario] = useState(SEED_TEMARIO);
  const [ranking, setRanking] = useState([]);

  useEffect(() => {
    (async () => {
      const [u, q, t, r] = await Promise.all([
        loadPersonal("pir-user", null),
        loadShared("pir-questions", SEED_QUESTIONS),
        loadShared("pir-temario", SEED_TEMARIO),
        loadShared("pir-ranking", [])
      ]);
      setUser(u);
      setQuestions(q);
      setTemario(t);
      setRanking(r);
      setReady(true);
    })();
  }, []);

  const handleLogin = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    const u = { name: trimmed };
    setUser(u);
    await savePersonal("pir-user", u);
  };

  const handleLogout = async () => {
    setUser(null);
    await savePersonal("pir-user", null);
  };

  const addQuestion = async (q) => {
    const next = [...questions, { ...q, id: `q${Date.now()}` }];
    setQuestions(next);
    await saveShared("pir-questions", next);
  };

  const submitScore = async (entry) => {
    const next = [...ranking, entry].sort((a, b) => b.pct - a.pct).slice(0, 100);
    setRanking(next);
    await saveShared("pir-ranking", next);
  };

  if (!ready) {
    return (
      <div style={{ ...styles.center, height: "100%", minHeight: 400 }}>
        <Loader2 className="animate-spin" size={28} color="#2E7D6B" />
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        nameInput={nameInput}
        setNameInput={setNameInput}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <div style={styles.app}>
      <Header user={user} onLogout={handleLogout} />
      <Nav section={section} setSection={setSection} />
      <main style={styles.main}>
        {section === "simulacros" && (
          <Simulacros questions={questions} user={user} onFinish={submitScore} />
        )}
        {section === "banco" && (
          <BancoPreguntas questions={questions} onAdd={addQuestion} />
        )}
        {section === "temario" && <Temario temario={temario} />}
        {section === "ranking" && <Ranking ranking={ranking} user={user} />}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------
   Pantalla de login
--------------------------------------------------------- */
function LoginScreen({ nameInput, setNameInput, onSubmit }) {
  return (
    <div style={{ ...styles.app, ...styles.center, minHeight: 520 }}>
      <div style={{ maxWidth: 340, width: "100%", padding: "0 24px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <Compass size={34} color="#2E7D6B" strokeWidth={1.6} />
        </div>
        <h1 style={styles.h1}>Ruta PIR</h1>
        <p style={{ color: "#5B6472", fontSize: 15, lineHeight: 1.5, marginBottom: 28 }}>
          Simulacros, banco de preguntas, temario y ranking en un mismo sitio.
          Decinos cómo te llamás para empezar.
        </p>
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="Tu nombre"
          style={styles.input}
          autoFocus
        />
        <button onClick={onSubmit} style={{ ...styles.btnPrimary, width: "100%", marginTop: 12 }}>
          Entrar
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Header y navegación
--------------------------------------------------------- */
function Header({ user, onLogout }) {
  return (
    <header style={styles.header}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Compass size={20} color="#2E7D6B" strokeWidth={1.8} />
        <span style={{ fontFamily: "Georgia, serif", fontSize: 18, color: "#14213D" }}>Ruta PIR</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: "#5B6472", display: "flex", alignItems: "center", gap: 4 }}>
          <User size={14} /> {user.name}
        </span>
        <button onClick={onLogout} style={styles.iconBtn} title="Salir">
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
    { id: "ranking", label: "Ranking", icon: Trophy }
  ];
  return (
    <nav style={styles.nav}>
      {items.map((it) => {
        const Icon = it.icon;
        const active = section === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setSection(it.id)}
            style={{
              ...styles.navBtn,
              color: active ? "#14213D" : "#8A93A3",
              borderBottom: active ? "2px solid #2E7D6B" : "2px solid transparent"
            }}
          >
            <Icon size={15} />
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ---------------------------------------------------------
   Simulacros
--------------------------------------------------------- */
function Simulacros({ questions, user, onFinish }) {
  const cursos = useMemo(() => ["Todos", ...new Set(questions.map((q) => q.curso))], [questions]);
  const [curso, setCurso] = useState("Todos");
  const [numPreguntas, setNumPreguntas] = useState(5);
  const [state, setState] = useState("config"); // config | running | done
  const [pool, setPool] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let timer;
    if (state === "running") {
      timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [state]);

  const start = () => {
    const filtered = curso === "Todos" ? questions : questions.filter((q) => q.curso === curso);
    const shuffled = [...filtered].sort(() => Math.random() - 0.5).slice(0, Math.min(numPreguntas, filtered.length));
    setPool(shuffled);
    setIdx(0);
    setAnswers([]);
    setSelected(null);
    setSeconds(0);
    setState("running");
  };

  const choose = (i) => setSelected(i);

  const next = async () => {
    const current = pool[idx];
    const nextAnswers = [...answers, { qId: current.id, selected, correct: selected === current.correcta }];
    setAnswers(nextAnswers);
    setSelected(null);
    if (idx + 1 < pool.length) {
      setIdx(idx + 1);
    } else {
      const correctCount = nextAnswers.filter((a) => a.correct).length;
      const pct = Math.round((correctCount / pool.length) * 100);
      await onFinish({
        name: user.name,
        score: correctCount,
        total: pool.length,
        pct,
        seconds,
        date: new Date().toISOString()
      });
      setState("done");
    }
  };

  if (state === "config") {
    return (
      <div>
        <SectionTitle title="Simulacros" subtitle="Elegí curso y cantidad de preguntas para empezar." />
        <Card>
          <FieldLabel>Curso</FieldLabel>
          <select value={curso} onChange={(e) => setCurso(e.target.value)} style={styles.select}>
            {cursos.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <FieldLabel style={{ marginTop: 16 }}>Cantidad de preguntas</FieldLabel>
          <div style={{ display: "flex", gap: 8 }}>
            {[5, 10, 20].map((n) => (
              <button
                key={n}
                onClick={() => setNumPreguntas(n)}
                style={{
                  ...styles.chip,
                  background: numPreguntas === n ? "#14213D" : "transparent",
                  color: numPreguntas === n ? "#fff" : "#14213D",
                  borderColor: "#14213D"
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <button onClick={start} style={{ ...styles.btnPrimary, width: "100%", marginTop: 22 }}>
            Empezar simulacro
          </button>
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
          <span style={{ fontSize: 13, color: "#5B6472", display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={13} /> {mm}:{ss}
          </span>
        </div>
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${((idx) / pool.length) * 100}%` }} />
        </div>
        <Card style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: "#2E7D6B", marginBottom: 8 }}>{q.curso} · {q.tema}</div>
          <p style={{ fontSize: 16, color: "#14213D", lineHeight: 1.5, marginBottom: 18 }}>{q.pregunta}</p>
          {q.opciones.map((op, i) => (
            <button
              key={i}
              onClick={() => choose(i)}
              style={{
                ...styles.option,
                borderColor: selected === i ? "#14213D" : "#E4E1D8",
                background: selected === i ? "#EEF3F1" : "#fff"
              }}
            >
              {op}
            </button>
          ))}
          <button
            onClick={next}
            disabled={selected === null}
            style={{
              ...styles.btnPrimary,
              width: "100%",
              marginTop: 18,
              opacity: selected === null ? 0.4 : 1
            }}
          >
            {idx + 1 === pool.length ? "Terminar" : "Siguiente"}
          </button>
        </Card>
      </div>
    );
  }

  // done
  const correctCount = answers.filter((a) => a.correct).length;
  const pct = Math.round((correctCount / pool.length) * 100);
  return (
    <div>
      <SectionTitle title="Resultado" />
      <Card style={{ textAlign: "center", padding: "32px 20px" }}>
        <Flag size={26} color="#2E7D6B" style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 40, fontFamily: "Georgia, serif", color: "#14213D" }}>{pct}%</div>
        <div style={{ color: "#5B6472", fontSize: 14, marginTop: 4 }}>
          {correctCount} de {pool.length} correctas · {Math.floor(seconds / 60)} min {seconds % 60}s
        </div>
        <button onClick={() => setState("config")} style={{ ...styles.btnSecondary, marginTop: 22 }}>
          <RotateCcw size={14} style={{ marginRight: 6 }} /> Repetir simulacro
        </button>
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

/* ---------------------------------------------------------
   Banco de preguntas
--------------------------------------------------------- */
function BancoPreguntas({ questions, onAdd }) {
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
          <button onClick={() => setShowForm((s) => !s)} style={styles.btnSecondary}>
            <Plus size={14} style={{ marginRight: 4 }} /> Añadir
          </button>
        }
      />
      {showForm && <NuevaPregunta onAdd={(q) => { onAdd(q); setShowForm(false); }} cursos={cursos.filter(c => c !== "Todos")} />}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "4px 0 14px" }}>
        {cursos.map((c) => (
          <button
            key={c}
            onClick={() => setFiltro(c)}
            style={{
              ...styles.chip,
              whiteSpace: "nowrap",
              background: filtro === c ? "#14213D" : "transparent",
              color: filtro === c ? "#fff" : "#14213D",
              borderColor: "#14213D"
            }}
          >
            {c}
          </button>
        ))}
      </div>
      {filtered.map((q) => (
        <PreguntaCard key={q.id} q={q} />
      ))}
    </div>
  );
}

function PreguntaCard({ q }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ marginBottom: 10 }}>
      <button onClick={() => setOpen((o) => !o)} style={styles.expandBtn}>
        <div style={{ textAlign: "left", flex: 1 }}>
          <div style={{ fontSize: 11, color: "#2E7D6B", marginBottom: 4 }}>{q.curso} · {q.tema}</div>
          <div style={{ fontSize: 14, color: "#14213D", lineHeight: 1.4 }}>{q.pregunta}</div>
        </div>
        {open ? <ChevronDown size={16} color="#8A93A3" /> : <ChevronRight size={16} color="#8A93A3" />}
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          {q.opciones.map((op, i) => (
            <div
              key={i}
              style={{
                ...styles.option,
                cursor: "default",
                borderColor: i === q.correcta ? "#2E7D6B" : "#E4E1D8",
                background: i === q.correcta ? "#EEF3F1" : "#fff",
                display: "flex",
                alignItems: "center",
                gap: 8
              }}
            >
              {i === q.correcta && <Check size={13} color="#2E7D6B" />}
              {op}
            </div>
          ))}
          {q.explicacion && (
            <p style={{ fontSize: 13, color: "#5B6472", marginTop: 10, lineHeight: 1.5 }}>{q.explicacion}</p>
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
    onAdd({ curso, tema, pregunta, opciones, correcta, explicacion });
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <FieldLabel>Curso</FieldLabel>
      <input value={curso} onChange={(e) => setCurso(e.target.value)} style={styles.input} placeholder="Ej: Psicopatología" />
      <FieldLabel style={{ marginTop: 12 }}>Tema</FieldLabel>
      <input value={tema} onChange={(e) => setTema(e.target.value)} style={styles.input} placeholder="Ej: Trastornos de ansiedad" />
      <FieldLabel style={{ marginTop: 12 }}>Pregunta</FieldLabel>
      <textarea value={pregunta} onChange={(e) => setPregunta(e.target.value)} style={{ ...styles.input, minHeight: 60 }} />
      <FieldLabel style={{ marginTop: 12 }}>Opciones (marcá la correcta)</FieldLabel>
      {opciones.map((op, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <input
            type="radio"
            checked={correcta === i}
            onChange={() => setCorrecta(i)}
          />
          <input
            value={op}
            onChange={(e) => {
              const next = [...opciones];
              next[i] = e.target.value;
              setOpciones(next);
            }}
            style={{ ...styles.input, flex: 1 }}
            placeholder={`Opción ${i + 1}`}
          />
        </div>
      ))}
      <FieldLabel style={{ marginTop: 8 }}>Explicación (opcional)</FieldLabel>
      <textarea value={explicacion} onChange={(e) => setExplicacion(e.target.value)} style={{ ...styles.input, minHeight: 44 }} />
      <button onClick={submit} style={{ ...styles.btnPrimary, width: "100%", marginTop: 14 }}>Guardar pregunta</button>
    </Card>
  );
}

/* ---------------------------------------------------------
   Temario
--------------------------------------------------------- */
function Temario({ temario }) {
  return (
    <div>
      <SectionTitle title="Temario por cursos" subtitle={`${temario.length} cursos`} />
      {temario.map((curso) => (
        <CursoBlock key={curso.curso} curso={curso} />
      ))}
    </div>
  );
}

function CursoBlock({ curso }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ marginBottom: 10, borderLeft: `3px solid ${curso.color}` }}>
      <button onClick={() => setOpen((o) => !o)} style={styles.expandBtn}>
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

/* ---------------------------------------------------------
   Ranking
--------------------------------------------------------- */
function Ranking({ ranking, user }) {
  const sorted = [...ranking].sort((a, b) => b.pct - a.pct);
  return (
    <div>
      <SectionTitle title="Ranking" subtitle="Mejores puntuaciones de la comunidad" />
      {sorted.length === 0 && (
        <Card style={{ textAlign: "center", color: "#8A93A3", padding: "28px 16px" }}>
          Todavía no hay resultados. Hacé un simulacro para aparecer acá.
        </Card>
      )}
      {sorted.map((r, i) => (
        <div
          key={i}
          style={{
            ...styles.rankRow,
            background: r.name === user.name ? "#EEF3F1" : "#fff"
          }}
        >
          <span style={{ width: 26, fontSize: 13, color: i < 3 ? "#C89B3C" : "#8A93A3", fontFamily: "Georgia, serif" }}>
            {i + 1}
          </span>
          <span style={{ flex: 1, fontSize: 14, color: "#14213D" }}>{r.name}</span>
          <span style={{ fontSize: 13, color: "#5B6472" }}>{r.score}/{r.total}</span>
          <span style={{ fontSize: 14, color: "#2E7D6B", fontWeight: 600, width: 44, textAlign: "right" }}>{r.pct}%</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------
   Piezas de UI reutilizables
--------------------------------------------------------- */
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

/* ---------------------------------------------------------
   Estilos
--------------------------------------------------------- */
const styles = {
  app: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    background: "#FBF9F4",
    minHeight: "100%",
    color: "#14213D"
  },
  center: { display: "flex", alignItems: "center", justifyContent: "center" },
  h1: { fontFamily: "Georgia, serif", fontSize: 26, margin: "0 0 10px", color: "#14213D" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 18px",
    borderBottom: "1px solid #E4E1D8"
  },
  nav: {
    display: "flex",
    gap: 4,
    padding: "0 12px",
    borderBottom: "1px solid #E4E1D8",
    overflowX: "auto"
  },
  navBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    padding: "12px 10px",
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap"
  },
  main: { padding: "18px 16px 40px", maxWidth: 640, margin: "0 auto" },
  card: {
    background: "#fff",
    border: "1px solid #E4E1D8",
    borderRadius: 8,
    padding: 18
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid #D9D5C9",
    fontSize: 14,
    fontFamily: "inherit",
    color: "#14213D",
    boxSizing: "border-box"
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid #D9D5C9",
    fontSize: 14,
    fontFamily: "inherit",
    color: "#14213D",
    background: "#fff"
  },
  btnPrimary: {
    background: "#14213D",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "11px 18px",
    fontSize: 14,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center"
  },
  btnSecondary: {
    background: "transparent",
    color: "#14213D",
    border: "1px solid #14213D",
    borderRadius: 6,
    padding: "9px 14px",
    fontSize: 13,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center"
  },
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4
  },
  chip: {
    border: "1px solid",
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 13,
    cursor: "pointer"
  },
  option: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "11px 14px",
    borderRadius: 6,
    border: "1px solid #E4E1D8",
    marginBottom: 8,
    fontSize: 14,
    cursor: "pointer",
    color: "#14213D"
  },
  runHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  progressTrack: { height: 3, background: "#E4E1D8", borderRadius: 2, marginTop: 8 },
  progressFill: { height: 3, background: "#2E7D6B", borderRadius: 2, transition: "width .3s" },
  reviewRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #F0EEE6" },
  expandBtn: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    textAlign: "left"
  },
  rankRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    border: "1px solid #E4E1D8",
    borderRadius: 6,
    marginBottom: 6
  }
};
