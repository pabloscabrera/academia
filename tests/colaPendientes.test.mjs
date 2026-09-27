import { test } from "node:test";
import assert from "node:assert/strict";
import {
  colaVacia, esFalloDeRed, contarCola, conFila, sinFila, filasPendientes, CONFLICTO,
} from "../src/colaPendientes.js";

test("solo se encola lo que falla por red, no lo que rechaza el servidor", () => {
  assert.equal(esFalloDeRed({ message: "Failed to fetch" }), true);
  assert.equal(esFalloDeRed({ message: "Load failed" }), true, "el mensaje de Safari");
  assert.equal(esFalloDeRed({ message: "NetworkError when attempting to fetch resource" }), true);
  assert.equal(esFalloDeRed({ message: "new row violates row-level security policy" }), false);
  assert.equal(esFalloDeRed({ message: "duplicate key value" }), false);
  assert.equal(esFalloDeRed(null), false);
});

test("dos respuestas a la misma pregunta dejan una sola fila acumulada", () => {
  let cola = colaVacia();
  cola = conFila(cola, "fallos", "q1", { pregunta_id: "q1", veces: 1 });
  cola = conFila(cola, "fallos", "q1", { pregunta_id: "q1", veces: 2 });
  assert.equal(contarCola(cola), 1);
  assert.equal(cola.fallos.q1.veces, 2, "gana el último cálculo, que ya lleva lo anterior");
});

test("rachas funde campos en vez de sustituir la fila", () => {
  let cola = colaVacia();
  cola = conFila(cola, "rachas", "rachas", { name: "Pablo", total_respondidas: 10, racha_actual: 3 });
  cola = conFila(cola, "rachas", "rachas", { name: "Pablo", total_respondidas: 11 });
  assert.deepEqual(cola.rachas, { name: "Pablo", total_respondidas: 11, racha_actual: 3 },
    "si sustituyera, se perdería racha_actual");
  assert.equal(contarCola(cola), 1, "sigue siendo una sola fila");
});

test("cada tabla pendiente sabe por qué columnas resolver el conflicto", () => {
  let cola = colaVacia();
  cola = conFila(cola, "fallos", "q1", { pregunta_id: "q1" });
  cola = conFila(cola, "preguntas_progreso", "q1", { pregunta_id: "q1" });
  cola = conFila(cola, "flashcards_progreso", "f9", { flashcard_id: "f9" });
  cola = conFila(cola, "rachas", "rachas", { name: "Pablo" });
  const filas = filasPendientes(cola);
  assert.equal(filas.length, 4);
  filas.forEach((f) => assert.ok(CONFLICTO[f.tabla], `falta el onConflict de ${f.tabla}`));
});

test("si la red se corta a mitad, no se pierde ni se repite nada", () => {
  let cola = colaVacia();
  ["q1", "q2", "q3"].forEach((id) => { cola = conFila(cola, "fallos", id, { pregunta_id: id }); });
  const filas = filasPendientes(cola);
  cola = sinFila(cola, filas[0].tabla, filas[0].claveFila);   // sube la primera
  // y aquí se cae la red: las otras dos se quedan
  assert.equal(contarCola(cola), 2);
  assert.ok(!cola.fallos.q1, "la que sí subió no se reintenta");
});

test("la cola se vacía del todo", () => {
  let cola = colaVacia();
  cola = conFila(cola, "fallos", "q1", { pregunta_id: "q1" });
  cola = conFila(cola, "rachas", "rachas", { name: "Pablo" });
  filasPendientes(cola).forEach((f) => { cola = sinFila(cola, f.tabla, f.claveFila); });
  assert.equal(contarCola(cola), 0);
});
