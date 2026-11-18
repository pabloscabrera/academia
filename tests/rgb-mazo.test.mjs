// Conversión de color de mazo a rgb, para el lavado de la fila de mazos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rgbDeHex } from "../src/logica.js";

test("convierte un hex de seis dígitos", () => {
  assert.equal(rgbDeHex("#A6362B"), "166,54,43");
  assert.equal(rgbDeHex("#000000"), "0,0,0");
});

test("acepta tres dígitos y rechaza lo que no es un color", () => {
  assert.equal(rgbDeHex("#fff"), "255,255,255");
  assert.equal(rgbDeHex(null), null);
  assert.equal(rgbDeHex("rojo"), null);
});
