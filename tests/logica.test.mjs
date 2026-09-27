import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esExamen, esTemaReal, temasDisponibles, filtrarPreguntas, indicePorId,
  reconstruirTirada, agruparAciertos, calcularSM2, ordenarPorPrioridad,
  parsearEtiquetas, lunesDeLaSemana,
} from "../src/logica.js";

test("esExamen distingue una edición de examen de una asignatura suelta", () => {
  assert.equal(esExamen("PIR 22"), true);
  assert.equal(esExamen("  pir 15  "), true);
  assert.equal(esExamen("Psicopatología"), false);
  assert.equal(esExamen("Simulacro 01 (AMIR)"), false);
  assert.equal(esExamen("Pirámide de Maslow"), false, "la tilde no puede colar como separador");
  assert.equal(esExamen("PIR"), true);
  assert.equal(esExamen("PIR22"), true);
  assert.equal(esExamen(null), false);
});

test("los temas de relleno de los PDF no cuentan como tema", () => {
  assert.equal(esTemaReal("Psicometría"), true);
  assert.equal(esTemaReal("Pregunta 4"), false);
  assert.equal(esTemaReal("pregunta12"), false);
  assert.equal(esTemaReal("   "), false);
  const temas = temasDisponibles([
    { tema: "Psicometría" }, { tema: "Ansiedad" }, { tema: "Pregunta 7" }, { tema: null },
  ]);
  assert.deepEqual(temas, ["Ansiedad", "Psicometría"], "ordenados en español y sin los de relleno");
});

const banco = [
  { id: "a", curso: "PIR 20", tema: "Ansiedad" },
  { id: "b", curso: "PIR 20", tema: "Ansiedad" },
  { id: "c", curso: "PIR 20", tema: "Psicometría" },
  { id: "d", curso: "PIR 18", tema: "Pregunta 4" },
  { id: "e", curso: "PIR 18", tema: "Ansiedad" },
];
const progreso = [
  { pregunta_id: "a", veces: 3, acertada: true },
  { pregunta_id: "b", veces: 2, acertada: false },
  { pregunta_id: "d", veces: 1, acertada: true },
];
const fallos = [{ pregunta_id: "a", veces: 1 }, { pregunta_id: "b", veces: 2 }];
const acertada = indicePorId(progreso, "pregunta_id", (p) => p.acertada);
const fallada = indicePorId(fallos, "pregunta_id", (f) => (f.veces || 0) > 0);
const ids = (r) => r.map((q) => q.id);

test("'Todas' devuelve el banco entero", () => {
  assert.deepEqual(ids(filtrarPreguntas(banco, { curso: "Todos", tema: "Todos", origen: "todas" }, acertada, fallada)), ["a", "b", "c", "d", "e"]);
});

test("'Sin acertar' incluye lo fallado y lo nunca visto, y excluye lo acertado", () => {
  assert.deepEqual(ids(filtrarPreguntas(banco, { curso: "Todos", tema: "Todos", origen: "sinacertar" }, acertada, fallada)), ["b", "c", "e"]);
});

test("'Falladas' incluye las que acabaste acertando", () => {
  assert.deepEqual(ids(filtrarPreguntas(banco, { curso: "Todos", tema: "Todos", origen: "fallos" }, acertada, fallada)), ["a", "b"]);
});

test("examen, tema y origen se combinan entre sí", () => {
  assert.deepEqual(ids(filtrarPreguntas(banco, { curso: "PIR 20", tema: "Todos", origen: "sinacertar" }, acertada, fallada)), ["b", "c"]);
  assert.deepEqual(ids(filtrarPreguntas(banco, { curso: "PIR 18", tema: "Ansiedad", origen: "sinacertar" }, acertada, fallada)), ["e"]);
  assert.deepEqual(ids(filtrarPreguntas(banco, { curso: "PIR 18", tema: "Psicometría", origen: "todas" }, acertada, fallada)), [],
    "una combinación imposible da 0, y la pantalla desactiva el botón");
});

test("los aciertos salen de los intentos menos los fallos", () => {
  const porId = (filas) => Object.fromEntries(filas.map((f) => [f.pregunta_id, f]));
  const grupos = agruparAciertos(banco, (q) => q.curso, porId(progreso), porId(fallos));
  const pir20 = grupos.find((g) => g.nombre === "PIR 20");
  assert.deepEqual(
    { total: pir20.total, hechas: pir20.hechas, intentos: pir20.intentos, aciertos: pir20.aciertos, pct: pir20.pct },
    { total: 3, hechas: 2, intentos: 5, aciertos: 2, pct: 40 }
  );
});

test("lo que no has empezado queda sin dato, no como un 0%", () => {
  const porId = (filas) => Object.fromEntries(filas.map((f) => [f.pregunta_id, f]));
  const grupos = agruparAciertos(
    [{ id: "z", curso: "PIR 21" }], (q) => q.curso, porId([]), porId([])
  );
  assert.equal(grupos[0].pct, null);
});

test("nunca salen aciertos negativos aunque haya más fallos que intentos", () => {
  const grupos = agruparAciertos(
    [{ id: "y", curso: "X" }], (q) => q.curso,
    { y: { veces: 1 } }, { y: { veces: 5 } }
  );
  assert.equal(grupos[0].aciertos, 0);
  assert.equal(grupos[0].pct, 0);
});

test("SM-2: un fallo reinicia y un acierto encadena 1, 6 y luego por el factor", () => {
  const hoy = new Date("2026-01-10T12:00:00Z");
  const primera = calcularSM2(null, 5, hoy);
  assert.equal(primera.repeticiones, 1);
  assert.equal(primera.intervalo_dias, 1);
  assert.equal(primera.proxima_revision, "2026-01-11");

  const segunda = calcularSM2(primera, 5, hoy);
  assert.equal(segunda.intervalo_dias, 6);

  const tercera = calcularSM2(segunda, 4, hoy);
  assert.equal(tercera.intervalo_dias, Math.round(6 * segunda.ease_factor));

  const fallada = calcularSM2(tercera, 0, hoy);
  assert.equal(fallada.repeticiones, 0, "un 'Muy difícil' vuelve a empezar");
  assert.equal(fallada.intervalo_dias, 1);
});

test("SM-2: el factor de facilidad nunca baja de 1.3", () => {
  let p = null;
  for (let i = 0; i < 20; i++) p = calcularSM2(p, 0);
  assert.ok(p.ease_factor >= 1.3, `bajó a ${p.ease_factor}`);
});

test("el repaso ordena: reiniciadas, luego vencidas, y al final las nuevas", () => {
  const tarjetas = [
    { id: "nueva" },
    { id: "vencida-hace-poco" },
    { id: "reiniciada" },
    { id: "vencida-hace-mucho" },
  ];
  const progresoPorId = {
    "vencida-hace-poco": { repeticiones: 3, proxima_revision: "2026-01-09" },
    "reiniciada": { repeticiones: 0, ultima_revision: "2026-01-01" },
    "vencida-hace-mucho": { repeticiones: 2, proxima_revision: "2025-12-01" },
  };
  assert.deepEqual(
    ordenarPorPrioridad(tarjetas, progresoPorId, () => 0).map((t) => t.id),
    ["reiniciada", "vencida-hace-mucho", "vencida-hace-poco", "nueva"]
  );
});

test("el progreso de una tarjeta se busca por su grupo si lo tiene", () => {
  const tarjetas = [{ id: "t1", grupo_id: "g1" }, { id: "t2" }];
  const orden = ordenarPorPrioridad(tarjetas, { g1: { repeticiones: 0, ultima_revision: "2026-01-01" } }, () => 0);
  assert.equal(orden[0].id, "t1", "la que tiene progreso bajo su grupo va primero");
});

test("las etiquetas se recortan, no se duplican y las vacías se caen", () => {
  assert.deepEqual(parsearEtiquetas("porcentajes, DSM-5"), ["porcentajes", "DSM-5"]);
  assert.deepEqual(parsearEtiquetas("  a ,, b , a "), ["a", "b"]);
  assert.deepEqual(parsearEtiquetas(""), []);
  assert.deepEqual(parsearEtiquetas(null), []);
});

test("la semana de la liga empieza en lunes, y el domingo aún es de la anterior", () => {
  assert.equal(lunesDeLaSemana("2026-01-14"), "2026-01-12", "miércoles");
  assert.equal(lunesDeLaSemana("2026-01-12"), "2026-01-12", "el propio lunes");
  assert.equal(lunesDeLaSemana("2026-01-18"), "2026-01-12", "domingo: cierra la semana, no abre la siguiente");
});

// ---- Retomar una autoevaluación ----

const preguntas = ["a", "b", "c", "d"].map((id) => ({ id, pregunta: `¿${id}?`, correcta: 1 }));
const guardada = {
  guardadoEn: Date.now(),
  poolIds: ["a", "b", "c", "d"],
  poolOriginalIds: null,
  idx: 2,
  answers: [{ qId: "a", selected: 1, correct: true }, { qId: "b", selected: 0, correct: false }],
  resultados: [],
};

test("se retoma en la pregunta correcta y con las respuestas ya dadas", () => {
  const r = reconstruirTirada(guardada, preguntas);
  assert.equal(r.idx, 2);
  assert.equal(r.pool.length, 4);
  assert.deepEqual(r.answers.map((a) => a.qId), ["a", "b"]);
  assert.equal(r.answers[0].pregunta.pregunta, "¿a?", "se rehidratan contra el banco actual");
  assert.equal(r.poolOriginal.length, 4, "sin poolOriginalIds se cae de vuelta en poolIds");
});

test("si una pregunta del pool ya no existe, se descarta la tirada entera", () => {
  assert.equal(reconstruirTirada(guardada, preguntas.filter((q) => q.id !== "c")), null);
});

test("una tirada de hace más de una semana no se ofrece", () => {
  const vieja = { ...guardada, guardadoEn: Date.now() - 8 * 24 * 60 * 60 * 1000 };
  assert.equal(reconstruirTirada(vieja, preguntas), null);
  const anteayer = { ...guardada, guardadoEn: Date.now() - 2 * 24 * 60 * 60 * 1000 };
  assert.ok(reconstruirTirada(anteayer, preguntas));
});

test("con el banco aún cargando no se decide nada", () => {
  assert.equal(reconstruirTirada(guardada, []), null);
});

test("un índice fuera de rango descarta la tirada en vez de reventar", () => {
  assert.equal(reconstruirTirada({ ...guardada, idx: 9 }, preguntas), null);
  assert.equal(reconstruirTirada({ ...guardada, idx: -1 }, preguntas), null);
});
