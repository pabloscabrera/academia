// Varios exámenes a la vez: cuántas preguntas toca a cada uno y de dónde salen.
// Va con `npm test` (node --test). Lo que decide el reparto es función pura,
// así que aquí se fija con datos inventados y un azar falso.
import { test } from "node:test";
import assert from "node:assert/strict";
import { repartirEntreExamenes, barajar, tomarPreguntas, filtrarPreguntas } from "../src/logica.js";

test("reparto a partes iguales cuando caben todas", () => {
  assert.deepEqual(repartirEntreExamenes(10, [50, 50]), [5, 5]);
  assert.deepEqual(repartirEntreExamenes(9, [50, 50, 50]), [3, 3, 3]);
});

test("lo que no cabe en un examen pequeño se reparte entre los demás", () => {
  // 10 entre dos, pero el segundo solo tiene 4: el primero absorbe el resto.
  assert.deepEqual(repartirEntreExamenes(10, [6, 4]), [6, 4]);
  assert.deepEqual(repartirEntreExamenes(10, [6, 40]), [5, 5]);
  assert.deepEqual(repartirEntreExamenes(10, [2, 40]), [2, 8]);
});

test("nunca da más de lo que hay ni más de lo pedido", () => {
  assert.deepEqual(repartirEntreExamenes(30, [4, 4]), [4, 4]);      // total = suma
  const r = repartirEntreExamenes(3, [100, 100]);
  assert.equal(r.reduce((a, b) => a + b, 0), 3);
  assert.deepEqual(repartirEntreExamenes(5, []), []);
  assert.deepEqual(repartirEntreExamenes(0, [10, 10]), [0, 0]);
});

test("barajar no toca la lista original y se puede fijar el azar", () => {
  const original = [1, 2, 3, 4];
  const copia = original.slice();
  barajar(original, () => 0.5);
  assert.deepEqual(original, copia);
  // azar que devuelve 1 exacto no debe salirse del array
  assert.equal(barajar([1, 2, 3], () => 1).length, 3);
});

const pregunta = (id, curso) => ({ id, curso, pregunta: `p${id}`, opciones: ["a", "b", "c", "d"], correcta: 0 });

test("tomarPreguntas reparte entre los exámenes elegidos y completa con el sobrante", () => {
  const base = [
    ...[1, 2, 3, 4, 5, 6].map((i) => pregunta(`a${i}`, "PIR 25")),
    ...[1, 2, 3, 4].map((i) => pregunta(`b${i}`, "PIR 24")),
    ...[1, 2].map((i) => pregunta(`c${i}`, "DSM-5-TR")),
  ];
  const salida = tomarPreguntas(base, ["PIR 25", "PIR 24"], 10, () => 0.3);
  assert.equal(salida.length, 10);
  const porCurso = (c) => salida.filter((q) => q.curso === c).length;
  assert.equal(porCurso("PIR 25"), 6);
  assert.equal(porCurso("PIR 24"), 4);
  assert.equal(porCurso("DSM-5-TR"), 0, "un examen no elegido no entra");
  assert.equal(new Set(salida.map((q) => q.id)).size, 10, "sin repetir");
});

test("sin exámenes elegidos sale una tirada normal de todo lo filtrado", () => {
  const base = [pregunta("x1", "PIR 25"), pregunta("x2", "PIR 24"), pregunta("x3", "DSM-5-TR")];
  assert.equal(tomarPreguntas(base, [], 2, () => 0.5).length, 2);
  assert.equal(tomarPreguntas(base, [], 99, () => 0.5).length, 3);
});

test("filtrarPreguntas acepta varios exámenes y sigue aceptando uno solo", () => {
  const base = [pregunta("1", "PIR 25"), pregunta("2", "PIR 24"), pregunta("3", "DSM-5-TR")];
  const vacio = {};
  assert.equal(filtrarPreguntas(base, { cursos: ["PIR 25", "DSM-5-TR"], tema: "Todos", origen: "todas" }, vacio, vacio).length, 2);
  assert.equal(filtrarPreguntas(base, { curso: "PIR 24", tema: "Todos", origen: "todas" }, vacio, vacio).length, 1);
  assert.equal(filtrarPreguntas(base, { cursos: [], curso: "Todos", tema: "Todos", origen: "todas" }, vacio, vacio).length, 3);
});
