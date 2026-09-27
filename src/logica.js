// La lógica que se puede comprobar sin pintar nada.
//
// Vivía dentro de App.jsx, mezclada con los componentes. Un fichero .jsx no
// se puede importar desde Node, así que cada comprobación acababa siendo una
// copia del código en un borrador que se tiraba al terminar: servía para
// pensar, no para enterarse de si un cambio de mañana rompe lo de hoy.
//
// Aquí solo entra lo que no toca React, ni Supabase, ni el navegador: se le
// dan datos y devuelve datos. Lo que dependa del entorno se queda fuera (o
// se le pasa como argumento, como `ahora` en reconstruirTirada).

// ---------- Exámenes ----------

// El `curso` de una pregunta es texto libre y mezcla etiquetas de examen
// ("PIR 22") con nombres de asignatura sueltos de importaciones antiguas.
// Ojo con `\b`: se apoya en [A-Za-z0-9_], así que una tilde cuenta como
// separador y /^pir\b/i daba por examen cosas como "Pirámide de Maslow".
export function esExamen(curso) {
  return typeof curso === "string" && /^pir(?:[\s\d]|$)/i.test(curso.trim());
}

// Los exámenes oficiales transcritos del PDF no traían tema, así que se les
// puso "Pregunta N" de relleno. No es un tema y no debe salir en las listas.
export const TEMA_PLACEHOLDER = /^pregunta\s*\d+$/i;

export function esTemaReal(tema) {
  const t = (tema || "").trim();
  return !!t && !TEMA_PLACEHOLDER.test(t);
}

export function temasDisponibles(preguntas) {
  const nombres = [...new Set(preguntas.map((q) => (q.tema || "").trim()).filter(esTemaReal))];
  return nombres.sort((a, b) => a.localeCompare(b, "es"));
}

// ---------- Elegir qué preguntas entran en una autoevaluación ----------

// origen: "todas" | "sinacertar" | "fallos".
// "sinacertar" incluye lo que no se ha visto nunca; "fallos", lo que consta
// como fallado alguna vez aunque después se acertara.
export function filtrarPreguntas(base, { curso, tema, origen }, acertadaPorId, falladaPorId) {
  return base.filter((q) => {
    if (curso && curso !== "Todos" && q.curso !== curso) return false;
    if (tema && tema !== "Todos" && (q.tema || "").trim() !== tema) return false;
    if (origen === "sinacertar" && acertadaPorId[q.id]) return false;
    if (origen === "fallos" && !falladaPorId[q.id]) return false;
    return true;
  });
}

export function indicePorId(filas, campo, condicion) {
  const m = {};
  (filas || []).forEach((f) => { if (!condicion || condicion(f)) m[f[campo]] = true; });
  return m;
}

// ---------- Retomar una autoevaluación a medias ----------

export const MAX_EDAD_TIRADA_MS = 7 * 24 * 60 * 60 * 1000;

// Todo o nada: si falta una sola pregunta del pool, o el índice guardado no
// cae dentro, se descarta. Rellenar huecos descuadraría los índices contra
// las respuestas ya dadas.
export function reconstruirTirada(guardada, questions, ahora = Date.now()) {
  if (!guardada || !Array.isArray(guardada.poolIds) || questions.length === 0) return null;
  if (ahora - (guardada.guardadoEn || 0) > MAX_EDAD_TIRADA_MS) return null;
  const porId = new Map(questions.map((q) => [q.id, q]));
  const pool = guardada.poolIds.map((id) => porId.get(id));
  if (pool.length === 0 || pool.some((q) => !q)) return null;
  const poolOriginal = (guardada.poolOriginalIds || guardada.poolIds).map((id) => porId.get(id));
  if (poolOriginal.some((q) => !q)) return null;
  if (!(guardada.idx >= 0 && guardada.idx < pool.length)) return null;
  const answers = (guardada.answers || []).map((a) => ({ ...a, pregunta: porId.get(a.qId) }));
  if (answers.some((a) => !a.pregunta)) return null;
  const resultados = {};
  (guardada.resultados || []).forEach((a) => {
    const pregunta = porId.get(a.qId);
    if (pregunta) resultados[a.qId] = { ...a, pregunta };
  });
  return { ...guardada, pool, poolOriginal, answers, resultados };
}

// ---------- Aciertos por examen y por tema ----------

// No hay un contador de aciertos en ninguna tabla: se deduce de los intentos
// (`preguntas_progreso.veces`) menos los fallos (`fallos.veces`).
export function agruparAciertos(preguntas, clave, progresoPorId, fallosPorId) {
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
  // `pct: null` y no 0 en lo que no se ha empezado: es ausencia de dato, no
  // un mal resultado, y así no encabeza la lista de "lo que peor llevas".
  return [...grupos.values()].map((g) => ({
    ...g,
    pct: g.intentos > 0 ? Math.round((g.aciertos / g.intentos) * 100) : null,
  }));
}

// ---------- Flashcards ----------

// Repetición espaciada estilo Anki (SM-2). calidad: 0 = Muy difícil (fallo,
// se reinicia), 3 = Difícil, 4 = Fácil, 5 = Muy fácil.
export function calcularSM2(progresoPrevio, calidad, hoy = new Date()) {
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

  const proxima = new Date(hoy.getTime() + intervalo * 86400000);
  return {
    ease_factor: Math.round(ease * 100) / 100,
    intervalo_dias: intervalo,
    repeticiones,
    proxima_revision: proxima.toISOString().slice(0, 10),
    ultima_revision: hoy.toISOString(),
  };
}

// Primero lo que se marcó "Muy difícil" (queda con repeticiones = 0), luego
// el resto de pendientes por antigüedad de vencimiento, y al final lo nunca
// visto. Así el orden reacciona a la dificultad ya declarada, no solo a la
// fecha de vencimiento.
export function ordenarPorPrioridad(lista, progresoPorId, azar = Math.random) {
  const conPrioridad = lista.map((f) => {
    const p = progresoPorId[f.grupo_id || f.id];
    if (!p) return { f, prioridad: 2, orden: azar() };
    if (p.repeticiones === 0) return { f, prioridad: 0, orden: p.ultima_revision || "" };
    return { f, prioridad: 1, orden: p.proxima_revision || "" };
  });
  conPrioridad.sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
    if (a.prioridad === 2) return a.orden - b.orden;
    return String(a.orden).localeCompare(String(b.orden));
  });
  return conPrioridad.map((x) => x.f);
}

export const parsearEtiquetas = (texto) => [
  ...new Set((texto || "").split(",").map((e) => e.trim()).filter(Boolean)),
];

// ---------- Fechas ----------

// Lunes de la semana de `fecha`, en YYYY-MM-DD. La liga semanal se reinicia
// ahí, y el domingo cuenta como final de la semana que empezó el lunes, no
// como principio de la siguiente.
export function lunesDeLaSemana(fecha) {
  const d = new Date(fecha);
  const dia = d.getDay();
  const diff = (dia === 0 ? -6 : 1) - dia;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
