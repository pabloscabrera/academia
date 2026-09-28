import { test } from "node:test";
import assert from "node:assert/strict";
import {
  retencionGlobal, retencionPorSemana, retencionPorIntervalo, repasosPorDia, RETENCION_OBJETIVO,
} from "../src/logica.js";

const HOY = "2026-03-11"; // miércoles
const r = (fecha, acierto, intervalo_antes = 5) => ({ creado_en: fecha + "T10:00:00Z", acierto, intervalo_antes });

test("sin repasos todavía no se inventa un número", () => {
  assert.equal(retencionGlobal([]), null);
  assert.equal(retencionGlobal(null), null);
});

test("la retención global es aciertos entre repasos", () => {
  const g = retencionGlobal([r(HOY, true), r(HOY, true), r(HOY, false), r(HOY, true)]);
  assert.deepEqual(g, { repasos: 4, aciertos: 3, pct: 75 });
});

test("las semanas se agrupan de lunes a domingo", () => {
  const filas = retencionPorSemana([
    r("2026-03-09", true),  // lunes de esta semana
    r("2026-03-11", false), // miércoles
    r("2026-03-08", true),  // domingo: cierra la semana anterior
  ], HOY, 2);
  assert.deepEqual(filas.map((f) => f.semana), ["2026-03-02", "2026-03-09"]);
  assert.deepEqual({ n: filas[0].repasos, pct: filas[0].pct }, { n: 1, pct: 100 }, "el domingo cuenta en la semana que empezó el lunes 2");
  assert.deepEqual({ n: filas[1].repasos, pct: filas[1].pct }, { n: 2, pct: 50 });
});

test("una semana sin repasar queda sin dato, no como un 0%", () => {
  const filas = retencionPorSemana([r("2026-03-11", true)], HOY, 3);
  assert.equal(filas[0].pct, null, "no repasar no es fallar");
  assert.equal(filas[0].repasos, 0);
  assert.equal(filas[2].pct, 100);
});

test("la última semana siempre es la de hoy", () => {
  const filas = retencionPorSemana([], HOY, 4);
  assert.equal(filas.length, 4);
  assert.equal(filas[3].semana, "2026-03-09", "el lunes de la semana de hoy");
});

test("por intervalo: cada repaso cae en su tramo", () => {
  const filas = retencionPorIntervalo([
    r(HOY, true, 1), r(HOY, false, 1),
    r(HOY, true, 3),
    r(HOY, true, 7),
    r(HOY, false, 20),
    r(HOY, true, 45), r(HOY, false, 60),
  ]);
  assert.deepEqual(filas.map((f) => f.repasos), [2, 1, 1, 1, 2]);
  assert.equal(filas[0].pct, 50, "a un día");
  assert.equal(filas[3].pct, 0, "a tres semanas se te olvidó");
  assert.equal(filas[4].pct, 50);
});

test("un intervalo enorme no se sale de la tabla", () => {
  const filas = retencionPorIntervalo([r(HOY, true, 9999)]);
  assert.equal(filas[4].repasos, 1);
});

test("un tramo sin repasos no dice 0%", () => {
  const filas = retencionPorIntervalo([r(HOY, true, 1)]);
  assert.equal(filas[0].pct, 100);
  assert.equal(filas[4].pct, null);
});

test("los repasos por día cubren todos los días, también los vacíos", () => {
  const dias = repasosPorDia([r("2026-03-11", true), r("2026-03-11", false), r("2026-03-09", true)], HOY, 4);
  assert.deepEqual(dias.map((d) => d.fecha), ["2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11"]);
  assert.deepEqual(dias.map((d) => d.cuantas), [0, 1, 0, 2]);
});

test("el objetivo de referencia es el 90% que usa Anki", () => {
  assert.equal(RETENCION_OBJETIVO, 90);
});
