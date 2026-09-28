import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clasificarTarjeta, estadisticasFlashcards, agruparEstadisticas,
  DIAS_MADURA, EASE_ATASCADA,
} from "../src/logica.js";

const HOY = "2026-03-10";

test("una tarjeta sin tocar es nueva, no una que vas mal", () => {
  assert.equal(clasificarTarjeta(null), "nueva");
  assert.equal(clasificarTarjeta({ repeticiones: 0 }), "nueva");
});

test("acabar de fallarla la deja en reaprendiendo, no en nueva", () => {
  assert.equal(
    clasificarTarjeta({ repeticiones: 0, ultima_revision: "2026-03-09T10:00:00Z", intervalo_dias: 1 }),
    "reaprendiendo"
  );
});

test("madura es aguantar 21 días sin verla, no haberla visto muchas veces", () => {
  assert.equal(clasificarTarjeta({ repeticiones: 9, intervalo_dias: DIAS_MADURA - 1 }), "joven");
  assert.equal(clasificarTarjeta({ repeticiones: 9, intervalo_dias: DIAS_MADURA }), "madura");
  assert.equal(clasificarTarjeta({ repeticiones: 2, intervalo_dias: 60 }), "madura",
    "el criterio es el intervalo, no el número de repasos");
});

const tarjetas = [
  { id: "n1" }, { id: "n2" },                      // nuevas
  { id: "r1" },                                     // reaprendiendo, atascada
  { id: "j1" }, { id: "j2" },                       // jóvenes
  { id: "m1" },                                     // madura
];
const prog = {
  r1: { ease_factor: 1.5, repeticiones: 0, intervalo_dias: 1, ultima_revision: HOY + "T09:00:00Z", proxima_revision: "2026-03-11" },
  j1: { ease_factor: 2.3, repeticiones: 3, intervalo_dias: 10, ultima_revision: "2026-03-01T09:00:00Z", proxima_revision: "2026-03-11" },
  j2: { ease_factor: 2.5, repeticiones: 2, intervalo_dias: 6, ultima_revision: "2026-02-20T09:00:00Z", proxima_revision: "2026-03-08" }, // atrasada
  m1: { ease_factor: 2.7, repeticiones: 6, intervalo_dias: 45, ultima_revision: "2026-02-01T09:00:00Z", proxima_revision: "2026-04-01" },
};

test("el resumen cuadra los estados", () => {
  const e = estadisticasFlashcards(tarjetas, prog, HOY);
  assert.deepEqual(
    { total: e.total, nueva: e.nueva, reaprendiendo: e.reaprendiendo, joven: e.joven, madura: e.madura },
    { total: 6, nueva: 2, reaprendiendo: 1, joven: 2, madura: 1 }
  );
});

test("el % de maduras se mide sobre lo visto, no sobre el total", () => {
  const e = estadisticasFlashcards(tarjetas, prog, HOY);
  assert.equal(e.vistas, 4);
  assert.equal(e.pctMaduras, 25, "1 madura de 4 vistas; contar las nuevas lo hundiría por estudiar más");
  // Añadir 10 tarjetas nuevas no puede empeorar el dato.
  const conNuevas = [...tarjetas, ...Array.from({ length: 10 }, (_, i) => ({ id: "x" + i }))];
  assert.equal(estadisticasFlashcards(conNuevas, prog, HOY).pctMaduras, 25);
});

test("lo atrasado cuenta como pendiente de hoy y se avisa aparte", () => {
  const e = estadisticasFlashcards(tarjetas, prog, HOY);
  assert.equal(e.atrasadas, 1, "j2 vencía el día 8");
  assert.equal(e.pendientesHoy, 3, "las 2 nuevas + la atrasada");
});

test("se señalan las que se atragantan, las peores primero", () => {
  const e = estadisticasFlashcards(tarjetas, prog, HOY);
  assert.equal(e.atascadas.length, 1);
  assert.equal(e.atascadas[0].tarjeta.id, "r1");
  assert.ok(e.atascadas[0].ease <= EASE_ATASCADA);
  const varias = estadisticasFlashcards(
    [{ id: "a" }, { id: "b" }], { a: { ease_factor: 1.7, repeticiones: 1, intervalo_dias: 3 }, b: { ease_factor: 1.3, repeticiones: 1, intervalo_dias: 2 } }, HOY
  );
  assert.deepEqual(varias.atascadas.map((x) => x.tarjeta.id), ["b", "a"]);
});

test("la previsión reparte por día y mete hoy lo atrasado y lo nuevo", () => {
  const e = estadisticasFlashcards(tarjetas, prog, HOY, 5);
  assert.equal(e.prevision.length, 5);
  assert.equal(e.prevision[0].fecha, HOY);
  assert.equal(e.prevision[0].cuantas, 3, "1 atrasada + 2 nuevas");
  assert.equal(e.prevision[1].fecha, "2026-03-11");
  assert.equal(e.prevision[1].cuantas, 2, "r1 y j1");
  assert.equal(e.prevision[4].cuantas, 0, "un día sin nada es 0, no un hueco");
});

test("cuenta lo repasado hoy aunque la fecha venga con hora", () => {
  assert.equal(estadisticasFlashcards(tarjetas, prog, HOY).repasadasHoy, 1);
});

test("por mazo: primero lo que peor llevas", () => {
  const conMazo = [
    { id: "r1", mazo: "Psicofármacos" },
    { id: "j1", mazo: "Psicofármacos" },
    { id: "m1", mazo: "Estadística" },
  ];
  const g = agruparEstadisticas(conMazo, prog, (f) => [f.mazo], HOY);
  assert.deepEqual(g.map((x) => x.nombre), ["Psicofármacos", "Estadística"]);
  assert.equal(g[0].total, 2);
  assert.equal(g[0].easeMedio, 1.9, "(1.5 + 2.3) / 2");
});

test("por etiqueta: una tarjeta con dos etiquetas cuenta en las dos", () => {
  const conEtiquetas = [
    { id: "r1", etiquetas: ["ansiedad", "dsm"] },
    { id: "m1", etiquetas: ["dsm"] },
  ];
  const g = agruparEstadisticas(conEtiquetas, prog, (f) => f.etiquetas || [], HOY);
  const dsm = g.find((x) => x.nombre === "dsm");
  const ansiedad = g.find((x) => x.nombre === "ansiedad");
  assert.equal(dsm.total, 2);
  assert.equal(ansiedad.total, 1);
  assert.equal(g[0].nombre, "ansiedad", "1.5 de media va antes que 2.1");
});

test("un grupo sin nada estrenado no se cuela arriba como si fuera lo peor", () => {
  const g = agruparEstadisticas(
    [{ id: "r1", mazo: "Difícil" }, { id: "z1", mazo: "Sin empezar" }],
    prog, (f) => [f.mazo], HOY
  );
  assert.deepEqual(g.map((x) => x.nombre), ["Difícil", "Sin empezar"]);
  assert.equal(g[1].easeMedio, null);
});
