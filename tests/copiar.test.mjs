import { test } from "node:test";
import assert from "node:assert/strict";
import { copiasParaMazo, mensajeDeEscritura } from "../src/logica.js";

const tarjeta = (id, mazo, extra = {}) => ({ id, mazo, frontal: "F" + id, posterior: "D" + id, ...extra });

test("copiar deja el original donde estaba y manda una copia al destino", () => {
  const todas = [tarjeta("a", "Origen"), tarjeta("b", "Origen"), tarjeta("z", "Destino")];
  const filas = copiasParaMazo(todas, "Origen", "Destino");
  assert.equal(filas.length, 2);
  assert.deepEqual(filas.map((f) => f.mazo), ["Destino", "Destino"]);
  // Nada en la lista original se toca: la función solo DICE qué insertar.
  assert.deepEqual(todas.map((f) => f.mazo), ["Origen", "Origen", "Destino"]);
});

test("la copia comparte la memoria del original, que es el punto", () => {
  // El progreso va indexado por `grupo_id || id`: si la copia lleva el grupo
  // del original, las dos apuntan a la misma fila de progreso.
  const filas = copiasParaMazo([tarjeta("a", "Origen")], "Origen", "Destino");
  assert.equal(filas[0].grupo_id, "a");
  const conGrupo = copiasParaMazo([tarjeta("b", "Origen", { grupo_id: "g1" })], "Origen", "Destino");
  assert.equal(conGrupo[0].grupo_id, "g1", "si ya tenía grupo se respeta, no se inventa otro");
});

test("copiar dos veces no duplica: se compara por grupo, no por texto", () => {
  const trasLaPrimera = [
    tarjeta("a", "Origen"),
    tarjeta("copia1", "Destino", { grupo_id: "a" }),
  ];
  assert.deepEqual(copiasParaMazo(trasLaPrimera, "Origen", "Destino"), []);
});

test("una tarjeta con el mismo texto pero otro grupo SÍ se copia", () => {
  const todas = [tarjeta("a", "Origen"), { id: "otra", mazo: "Destino", frontal: "Fa", posterior: "Da" }];
  assert.equal(copiasParaMazo(todas, "Origen", "Destino").length, 1);
});

test("las etiquetas viajan con la copia, y sin etiquetas va un array vacío", () => {
  const filas = copiasParaMazo([tarjeta("a", "Origen", { etiquetas: ["dsm"] }), tarjeta("b", "Origen")], "Origen", "D");
  assert.deepEqual(filas[0].etiquetas, ["dsm"]);
  assert.deepEqual(filas[1].etiquetas, []);
});

test('un mazo sin nombre cuenta como "General"', () => {
  const filas = copiasParaMazo([{ id: "a", frontal: "F", posterior: "D" }], "General", "Destino");
  assert.equal(filas.length, 1);
});

// ---------- Los mensajes de error, que son los que delatan la causa ----------

test("cada fallo dice quién lo arregla, no un código", () => {
  assert.match(mensajeDeEscritura({ code: "42501" }), /permisos|Pablo/i);
  assert.match(mensajeDeEscritura({ message: "new row violates row-level security policy" }), /permisos|Pablo/i);
  assert.match(mensajeDeEscritura({ code: "42P01" }), /falta algo|tabla/i);
  assert.match(mensajeDeEscritura({ code: "42703" }), /falta algo|columna/i);
  assert.match(mensajeDeEscritura({ message: "Failed to fetch" }), /conexión|no contesta/i);
  assert.match(mensajeDeEscritura({ message: "El servidor está tardando demasiado" }), /no contesta/i);
  assert.match(mensajeDeEscritura({ code: "23505" }), /ya estaba/i);
});

test("el aviso dice QUÉ se estaba intentando, que si no no se sabe de qué habla", () => {
  assert.match(mensajeDeEscritura({ code: "42501" }, "Guardar la pregunta"), /^Guardar la pregunta: /);
});

test("un error raro se enseña tal cual en vez de tragárselo", () => {
  assert.match(mensajeDeEscritura({ message: "algo muy raro" }), /algo muy raro/);
  assert.match(mensajeDeEscritura(null), /no se pudo guardar/i);
});

// ---------- Una tarjeta suelta ----------
import { copiaDeTarjeta } from "../src/logica.js";

test("copiar una tarjeta la deja también en su mazo y comparte el grupo", () => {
  const todas = [tarjeta("a", "Origen"), tarjeta("b", "Origen"), tarjeta("z", "Destino")];
  const fila = copiaDeTarjeta(todas, "a", "Destino");
  assert.equal(fila.mazo, "Destino");
  assert.equal(fila.grupo_id, "a", "el grupo del original: así comparten el repaso");
  assert.equal(fila.frontal, "Fa");
  // El original no se toca: esta función solo dice qué insertar.
  assert.equal(todas.find((f) => f.id === "a").mazo, "Origen");
});

test("si ya tenía grupo, la copia lo respeta", () => {
  const fila = copiaDeTarjeta([tarjeta("a", "Origen", { grupo_id: "g9" })], "a", "Destino");
  assert.equal(fila.grupo_id, "g9");
});

test("copiar la misma tarjeta dos veces al mismo mazo no la duplica", () => {
  const todas = [tarjeta("a", "Origen"), tarjeta("copia", "Destino", { grupo_id: "a" })];
  assert.equal(copiaDeTarjeta(todas, "a", "Destino"), null);
});

test("una tarjeta que no existe no inventa una copia", () => {
  assert.equal(copiaDeTarjeta([tarjeta("a", "Origen")], "fantasma", "Destino"), null);
  assert.equal(copiaDeTarjeta(null, "a", "Destino"), null);
});

test("las etiquetas viajan con la copia de una tarjeta suelta", () => {
  const fila = copiaDeTarjeta([tarjeta("a", "Origen", { etiquetas: ["dsm", "pct"] })], "a", "D");
  assert.deepEqual(fila.etiquetas, ["dsm", "pct"]);
});
