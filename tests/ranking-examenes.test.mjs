import { test } from "node:test";
import assert from "node:assert/strict";
import { rankingExamenes } from "../src/logica.js";

const g = (nombre, hechas, pct) => ({ nombre, hechas, pct });

test("los peores y los mejores, con el mínimo de preguntas hechas", () => {
  const r = rankingExamenes([g("PIR 21", 14, 41), g("PIR 15", 1, 100), g("FONSECA", 12, 79), g("PIR 20", 30, 60)], 10, 2);
  assert.deepEqual(r.peores.map((x) => x.nombre), ["PIR 21", "PIR 20"]);
  assert.deepEqual(r.mejores.map((x) => x.nombre), ["FONSECA", "PIR 20"]);
  assert.equal(r.conBase, 3, "PIR 15 con 1 hecha no entra");
});

test("sin empezar no cuenta y los empates van por nombre", () => {
  const r = rankingExamenes([g("B", 20, 50), g("A", 20, 50), g("C", 0, null)]);
  assert.deepEqual(r.peores.map((x) => x.nombre), ["A", "B"]);
  assert.equal(r.conBase, 2);
});
