import { test } from "node:test";
import assert from "node:assert/strict";
import { pestanaVecina, conResistencia, decidirPaso, umbralTrackpad, RESISTENCIA_BORDE } from "../src/logica.js";

const ORDEN = ["simulacros", "flashcards", "duelo", "estadisticas", "perfil"];

test("pestanaVecina avanza y retrocede, y se queda en los extremos", () => {
  assert.equal(pestanaVecina(ORDEN, "duelo", 1), "estadisticas");
  assert.equal(pestanaVecina(ORDEN, "duelo", -1), "flashcards");
  assert.equal(pestanaVecina(ORDEN, "perfil", 1), "perfil");
  assert.equal(pestanaVecina(ORDEN, "simulacros", -1), "simulacros");
  assert.equal(pestanaVecina(ORDEN, "otra", 1), "otra");
});

test("conResistencia: libre si hay vecina, frenada si no", () => {
  assert.equal(conResistencia(-100, true, true), -100);
  assert.equal(conResistencia(100, false, true), 100 * RESISTENCIA_BORDE);
  assert.equal(conResistencia(-100, true, false), -100 * RESISTENCIA_BORDE);
});

const base = { ancho: 400, hayAnterior: true, haySiguiente: true };

test("decidirPaso: arrastrar lejos pasa; poco, vuelve", () => {
  assert.equal(decidirPaso({ ...base, dx: -120 }), 1);
  assert.equal(decidirPaso({ ...base, dx: 120 }), -1);
  assert.equal(decidirPaso({ ...base, dx: -40 }), 0);
});

test("decidirPaso: un golpe rápido pasa aunque sea corto", () => {
  assert.equal(decidirPaso({ ...base, dx: -40, velocidad: -0.8 }), 1);
  // Arrepentirse al final (el dedo vuelve) no cuenta como golpe.
  assert.equal(decidirPaso({ ...base, dx: -40, velocidad: 0.8 }), 0);
  // Demasiado corto para ser un gesto, por rápido que sea.
  assert.equal(decidirPaso({ ...base, dx: -10, velocidad: -2 }), 0);
});

test("decidirPaso: sin vecina por ese lado no pasa", () => {
  assert.equal(decidirPaso({ ...base, dx: -300, haySiguiente: false }), 0);
  assert.equal(decidirPaso({ ...base, dx: 300, hayAnterior: false }), 0);
});

test("umbralTrackpad: una fracción del ancho, con techo", () => {
  assert.equal(umbralTrackpad(400), 72);
  assert.equal(umbralTrackpad(1200), 140);
});
