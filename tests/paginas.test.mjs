import { test } from "node:test";
import assert from "node:assert/strict";
import { traerTodasLasFilas, TAM_PAGINA } from "../src/logica.js";

// Un servidor de mentira que se comporta como PostgREST: devuelve como mucho
// `max` filas por petición aunque se le pidan más.
function servidor(total, max = TAM_PAGINA) {
  const filas = Array.from({ length: total }, (_, i) => ({ id: i }));
  const pedidas = [];
  const pedir = async (desde, hasta) => {
    pedidas.push([desde, hasta]);
    return { data: filas.slice(desde, Math.min(hasta + 1, desde + max)), error: null };
  };
  return { pedir, pedidas };
}

test("trae las 1957 y no solo las 1000 primeras", async () => {
  const s = servidor(1957);
  const r = await traerTodasLasFilas(s.pedir);
  assert.equal(r.error, null);
  assert.equal(r.data.length, 1957);
  assert.equal(new Set(r.data.map((f) => f.id)).size, 1957);
  assert.deepEqual(s.pedidas, [[0, 999], [1000, 1999]]);
});

test("con menos de una página hace una sola petición", async () => {
  const s = servidor(421);
  const r = await traerTodasLasFilas(s.pedir);
  assert.equal(r.data.length, 421);
  assert.equal(s.pedidas.length, 1);
});

test("justo 1000 pide una página más, que llega vacía", async () => {
  const s = servidor(1000);
  const r = await traerTodasLasFilas(s.pedir);
  assert.equal(r.data.length, 1000);
  assert.equal(s.pedidas.length, 2);
});

test("tabla vacía o data null: lista vacía, sin error", async () => {
  const r = await traerTodasLasFilas(async () => ({ data: null, error: null }));
  assert.deepEqual(r, { data: [], error: null });
});

test("si falla una página, falla todo: nada de media lista en silencio", async () => {
  let n = 0;
  const err = { message: "boom" };
  const r = await traerTodasLasFilas(async (desde, hasta) => {
    n++;
    if (n === 2) return { data: null, error: err };
    return { data: Array.from({ length: hasta - desde + 1 }, (_, i) => ({ id: desde + i })), error: null };
  });
  assert.equal(r.data, null);
  assert.equal(r.error, err);
});
