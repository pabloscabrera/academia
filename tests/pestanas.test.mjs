import { test } from "node:test";
import assert from "node:assert/strict";
import { pestanaVecina, pasoDeDeslizar } from "../src/logica.js";

const ORDEN = ["simulacros", "flashcards", "duelo", "estadisticas", "perfil"];

test("pestanaVecina avanza y retrocede, y se queda en los extremos", () => {
  assert.equal(pestanaVecina(ORDEN, "duelo", 1), "estadisticas");
  assert.equal(pestanaVecina(ORDEN, "duelo", -1), "flashcards");
  assert.equal(pestanaVecina(ORDEN, "perfil", 1), "perfil");
  assert.equal(pestanaVecina(ORDEN, "simulacros", -1), "simulacros");
  assert.equal(pestanaVecina(ORDEN, "otra", 1), "otra");
});

test("pasoDeDeslizar: dedo a la izquierda es la siguiente", () => {
  assert.equal(pasoDeDeslizar({ dx: -120, dy: 10, ms: 250 }), 1);
  assert.equal(pasoDeDeslizar({ dx: 120, dy: -10, ms: 250 }), -1);
});

test("pasoDeDeslizar ignora lo corto, lo vertical y lo lento", () => {
  assert.equal(pasoDeDeslizar({ dx: -40, dy: 0, ms: 200 }), 0);
  assert.equal(pasoDeDeslizar({ dx: -120, dy: 100, ms: 200 }), 0);
  assert.equal(pasoDeDeslizar({ dx: -120, dy: 0, ms: 900 }), 0);
});
