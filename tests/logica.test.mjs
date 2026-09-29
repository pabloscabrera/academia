import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esExamen, esTemaReal, temasDisponibles, filtrarPreguntas, indicePorId,
  reconstruirTirada, agruparAciertos, calcularSM2, ordenarPorPrioridad,
  parsearEtiquetas, lunesDeLaSemana, aplicarFiltroPedido,
  conTiempoLimite, mensajeDeCarga, textoIntervalo, MAX_INTERVALO, dentroDelHorizonte,
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

test("los cuatro botones dan cuatro días distintos, que es su razón de ser", () => {
  const hoy = new Date("2026-10-01T12:00:00Z");
  const asentada = { ease_factor: 2.5, repeticiones: 5, intervalo_dias: 30 };
  const dias = [0, 3, 4, 5].map((q) => calcularSM2(asentada, q, hoy).intervalo_dias);
  assert.equal(new Set(dias).size, 4, `los cuatro deben diferir, salieron ${dias.join(", ")}`);
  const [otraVez, dificil, bien, facil] = dias;
  assert.equal(otraVez, 1, "fallar la devuelve al primer peldaño");
  assert.ok(dificil < bien, "Difícil tiene que traerla antes que Bien");
  assert.ok(facil > bien, "Fácil tiene que ahorrarte repasos");
});

test("fallar reinicia las repeticiones, acertar las encadena", () => {
  const hoy = new Date("2026-10-01T12:00:00Z");
  const primera = calcularSM2(null, 4, hoy);
  assert.deepEqual({ r: primera.repeticiones, i: primera.intervalo_dias }, { r: 1, i: 3 });
  const segunda = calcularSM2(primera, 4, hoy);
  assert.deepEqual({ r: segunda.repeticiones, i: segunda.intervalo_dias }, { r: 2, i: 9 });
  const tercera = calcularSM2(segunda, 4, hoy);
  assert.equal(tercera.intervalo_dias, 27);
  const fallada = calcularSM2(tercera, 0, hoy);
  assert.deepEqual({ r: fallada.repeticiones, i: fallada.intervalo_dias }, { r: 0, i: 1 });
});

test("cada botón multiplica el intervalo por 1, 2, 3 o 4", () => {
  const hoy = new Date("2026-10-01T12:00:00Z");
  // Una nueva arranca en el primer peldaño, así que se leen los factores
  // tal cual: 1, 2, 3, 4 días.
  assert.deepEqual([0, 3, 4, 5].map((q) => calcularSM2(null, q, hoy).intervalo_dias), [1, 2, 3, 4]);

  const nueve = { ease_factor: 2.5, repeticiones: 2, intervalo_dias: 9 };
  assert.deepEqual([0, 3, 4, 5].map((q) => calcularSM2(nueve, q, hoy).intervalo_dias), [1, 18, 27, 36]);

  // Dos tarjetas con facilidades opuestas: el mismo botón da el mismo día.
  // Eso es lo que se ganó al quitar el factor de facilidad del cálculo.
  const facil = { ease_factor: 2.8, repeticiones: 3, intervalo_dias: 9 };
  const dura = { ease_factor: 1.3, repeticiones: 3, intervalo_dias: 9 };
  assert.equal(calcularSM2(facil, 4, hoy).intervalo_dias, calcularSM2(dura, 4, hoy).intervalo_dias);
});

test("fallar la devuelve al primer peldaño, aunque llevara meses aguantando", () => {
  const hoy = new Date("2026-10-01T12:00:00Z");
  const asentada = { ease_factor: 2.5, repeticiones: 8, intervalo_dias: 45 };
  const fallada = calcularSM2(asentada, 0, hoy);
  assert.equal(fallada.intervalo_dias, 1, "x1 es volver a empezar, no repetir el mismo aplazamiento");
  assert.equal(fallada.repeticiones, 0);
});

test("la facilidad se sigue guardando aunque ya no decida el intervalo", () => {
  const hoy = new Date("2026-10-01T12:00:00Z");
  // De ella salen las "atascadas" de la pantalla de estadísticas.
  const p = { ease_factor: 2.5, repeticiones: 3, intervalo_dias: 9 };
  assert.ok(calcularSM2(p, 3, hoy).ease_factor < 2.5, "Difícil la baja");
  assert.ok(calcularSM2(p, 5, hoy).ease_factor > 2.5, "Fácil la sube");
  assert.equal(calcularSM2(p, 4, hoy).ease_factor, 2.5, "Bien la deja donde está");
});

test("de un mal día se puede volver: la facilidad se recupera", () => {
  const hoy = new Date("2026-10-01T12:00:00Z");
  let p = null;
  for (let i = 0; i < 5; i++) p = calcularSM2(p, 0, hoy);
  const hundida = p.ease_factor;
  assert.ok(hundida > 1.3, "cinco fallos no pueden dejarla clavada en el suelo para siempre");
  for (let i = 0; i < 4; i++) p = calcularSM2(p, 5, hoy);
  assert.ok(p.ease_factor > hundida, "acertarla varias veces la devuelve arriba");
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

// ---- "Practicar" desde "Dónde fallas" ----

test("practicar un tema lo deja elegido en la autoevaluación", () => {
  const listas = { cursos: ["Todos", "PIR 22", "PIR 20"], temas: ["Todos", "Ansiedad", "Psicometría"] };
  assert.deepEqual(
    aplicarFiltroPedido({ tema: "Psicometría" }, listas),
    { curso: "Todos", tema: "Psicometría", origen: "todas" }
  );
  assert.deepEqual(
    aplicarFiltroPedido({ curso: "PIR 22" }, listas),
    { curso: "PIR 22", tema: "Todos", origen: "todas" }
  );
});

test("un examen o tema que no está en su desplegable cae a 'Todos'", () => {
  const listas = { cursos: ["Todos", "PIR 22"], temas: ["Todos", "Ansiedad"] };
  // "Psicopatología" es una etiqueta de curso que el desplegable de exámenes
  // no lista, y el tema puede venir de una pregunta inventada.
  assert.deepEqual(
    aplicarFiltroPedido({ curso: "Psicopatología" }, listas),
    { curso: "Todos", tema: "Todos", origen: "todas" }
  );
  assert.deepEqual(
    aplicarFiltroPedido({ tema: "Tema raro" }, listas).tema, "Todos"
  );
  assert.deepEqual(aplicarFiltroPedido(null, listas), { curso: "Todos", tema: "Todos", origen: "todas" });
});

// ---- Que no se quede colgada ----

test("una petición que no vuelve se corta y da un mensaje", async () => {
  const colgada = new Promise(() => {}); // nunca resuelve, como un servidor inalcanzable
  await assert.rejects(
    conTiempoLimite(colgada, 30, "El servidor está tardando demasiado."),
    /tardando demasiado/
  );
});

test("si responde a tiempo, el límite no estorba", async () => {
  const rapida = new Promise((r) => setTimeout(() => r("datos"), 5));
  assert.equal(await conTiempoLimite(rapida, 200, "tarde"), "datos");
});

test("el error que ve el usuario está en castellano y dice qué hacer", () => {
  assert.match(mensajeDeCarga(new Error("Failed to fetch")), /conexión a internet/);
  assert.match(mensajeDeCarga(new Error("El servidor está tardando demasiado.")), /conexión a internet/);
  assert.match(mensajeDeCarga({ message: "Invalid API key" }), /rechazado la conexión/);
  assert.equal(mensajeDeCarga(null), "No se pudo cargar la aplicación.");
});

test("el intervalo se escribe en la unidad que se entiende", () => {
  assert.equal(textoIntervalo(0), "hoy");
  assert.equal(textoIntervalo(1), "1 día");
  assert.equal(textoIntervalo(36), "36 días");
  assert.equal(textoIntervalo(60), "60 días", "el techo se dice en días, que es como se compara");
  assert.equal(textoIntervalo(61), "2 meses");
  assert.equal(textoIntervalo(365), "1 año");
  assert.equal(textoIntervalo(550), "1,5 años");
});

test("la previsión de cada botón es la que se aplica al pulsarlo", () => {
  const hoy = new Date("2026-10-01T12:00:00Z");
  const asentada = { ease_factor: 2.5, repeticiones: 5, intervalo_dias: 30 };
  // Lo que el botón enseña sale de la MISMA función que luego guarda, así
  // que no pueden discrepar.
  for (const q of [0, 3, 4, 5]) {
    const previsto = calcularSM2(asentada, q, hoy).intervalo_dias;
    const aplicado = calcularSM2(asentada, q, hoy).intervalo_dias;
    assert.equal(previsto, aplicado);
  }
  assert.deepEqual(
    [0, 3, 4, 5].map((q) => textoIntervalo(calcularSM2(asentada, q, hoy).intervalo_dias)),
    ["1 día", "30 días", "45 días", "60 días"]
  );
});

// ---------- El horizonte de estudio ----------

test("ninguna tarjeta se aplaza más allá del techo", () => {
  const hoy = new Date("2026-10-01T12:00:00Z");
  let p = null;
  // Acertándola siempre "Fácil", que es lo que más la estira.
  for (let i = 0; i < 30; i++) p = calcularSM2(p, 5, hoy);
  assert.ok(
    p.intervalo_dias <= MAX_INTERVALO,
    `se fue a ${p.intervalo_dias} días: una tarjeta que vuelve después del examen es una tarjeta perdida`
  );
});

test("con el techo apretando, los botones SIGUEN dando días distintos", () => {
  const hoy = new Date("2026-10-01T12:00:00Z");
  const asentada = { ease_factor: 2.5, repeticiones: 5, intervalo_dias: 30 };
  // Es la trampa de recortar por las bravas: con Math.min, "Difícil", "Bien"
  // y "Fácil" se quedarían los tres en el techo y volverían a ser el mismo
  // botón. Encogiendo la escalera entera se mantienen separados hasta con
  // cinco días por delante.
  for (const techo of [60, 30, 15, 5]) {
    const dias = [0, 3, 4, 5].map((q) => calcularSM2(asentada, q, hoy, techo).intervalo_dias);
    assert.equal(new Set(dias).size, 4, `con techo ${techo} salieron ${dias.join(", ")}`);
    assert.ok(dias[1] < dias[2] && dias[2] < dias[3], `con techo ${techo} se desordenaron: ${dias.join(", ")}`);
    assert.ok(Math.max(...dias) <= techo, `con techo ${techo} se pasó: ${dias.join(", ")}`);
  }
});

test("lo ya aplazado a meses vista se adelanta al techo, y lo demás no se toca", () => {
  const progreso = [
    { flashcard_id: "lejos", proxima_revision: "2027-01-15", intervalo_dias: 103 },
    { flashcard_id: "cerca", proxima_revision: "2026-10-20", intervalo_dias: 19 },
    { flashcard_id: "nueva", proxima_revision: null },
  ];
  const [lejos, cerca, nueva] = dentroDelHorizonte(progreso, "2026-10-01", 60);
  assert.equal(lejos.proxima_revision, "2026-11-30", "si no, esa tarjeta no vuelve antes del examen");
  assert.equal(lejos.intervalo_dias, 103, "solo se adelanta la fecha; el historial de la tarjeta no se falsea");
  assert.equal(cerca.proxima_revision, "2026-10-20", "lo que ya cabe en el plazo se queda como está");
  assert.equal(nueva.proxima_revision, null);
});

test("la escalera se estabiliza dentro del techo en vez de dispararse", () => {
  const hoy = new Date("2026-10-01T12:00:00Z");
  // x3 cada vez llega a 81 días en cuatro aciertos; el techo lo para.
  let p = null;
  const dias = [];
  for (let i = 0; i < 6; i++) {
    p = calcularSM2(p, 4, hoy);
    dias.push(p.intervalo_dias);
  }
  assert.deepEqual(dias, [3, 9, 27, 45, 45, 45]);
});
