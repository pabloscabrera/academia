import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mezclarTemas, temaDeTarjeta, colaDeRepaso, planHastaObjetivo,
  DIAS_PARA_CONSOLIDAR,
} from "../src/logica.js";

const clave = (x) => x.tema;

test("mezclar separa las del mismo tema", () => {
  const lista = [
    { id: 1, tema: "A" }, { id: 2, tema: "A" }, { id: 3, tema: "A" },
    { id: 4, tema: "B" }, { id: 5, tema: "B" }, { id: 6, tema: "C" },
  ];
  const r = mezclarTemas(lista, clave).map((x) => x.tema);
  let seguidas = 0;
  for (let i = 1; i < r.length; i++) if (r[i] === r[i - 1]) seguidas++;
  assert.ok(seguidas <= 1, `quedan ${seguidas} parejas seguidas: ${r.join("")}`);
});

test("no se pierde ni se duplica ninguna tarjeta", () => {
  const lista = Array.from({ length: 30 }, (_, i) => ({ id: i, tema: "T" + (i % 4) }));
  const r = mezclarTemas(lista, clave);
  assert.equal(r.length, 30);
  assert.equal(new Set(r.map((x) => x.id)).size, 30);
});

test("la urgencia manda: no se baraja, solo se mira un poco por delante", () => {
  // Todo del mismo tema salvo la última: no puede saltar hasta el final.
  const lista = Array.from({ length: 12 }, (_, i) => ({ id: i, tema: i === 11 ? "otro" : "A" }));
  const r = mezclarTemas(lista, clave, 5);
  assert.equal(r[0].id, 0, "la primera sigue siendo la más urgente");
  // Se adelanta en cuanto entra en la ventana de 5, no antes: sale sobre la
  // posición 7 de 12. Ni se queda la última ni salta al principio.
  const posicion = r.findIndex((x) => x.id === 11);
  assert.ok(posicion > 0 && posicion < 11, `posición ${posicion}: ni la primera ni la última`);
});

test("un solo tema no rompe nada", () => {
  const lista = [{ id: 1, tema: "A" }, { id: 2, tema: "A" }];
  assert.deepEqual(mezclarTemas(lista, clave).map((x) => x.id), [1, 2]);
  assert.deepEqual(mezclarTemas([], clave), []);
});

test("el tema de una tarjeta es su etiqueta, y si no, su mazo", () => {
  assert.equal(temaDeTarjeta({ etiquetas: ["dsm"], mazo: "M" }), "dsm");
  assert.equal(temaDeTarjeta({ etiquetas: [], mazo: "M" }), "M");
  assert.equal(temaDeTarjeta({}), "General");
});

// ---------- La cola de repaso ----------

const t = (id) => ({ id });

test("la cola va por turno: lo vencido, luego lo nuevo, luego lo que aún no toca", () => {
  const progreso = {
    vieja: { proxima_revision: "2026-10-01", repeticiones: 3 },
    deAyer: { proxima_revision: "2026-10-06", repeticiones: 2 },
    pronto: { proxima_revision: "2026-10-09", repeticiones: 4 },
    lejos: { proxima_revision: "2026-11-20", repeticiones: 5 },
  };
  const lista = [t("lejos"), t("pronto"), t("nueva"), t("deAyer"), t("vieja")];
  const r = colaDeRepaso(lista, progreso, "2026-10-07").map((x) => x.id);
  assert.deepEqual(r, ["vieja", "deAyer", "nueva", "pronto", "lejos"]);
});

test("sin nada vencido la cola NO queda vacía: sale lo que vuelve antes", () => {
  const progreso = {
    a: { proxima_revision: "2026-10-20", repeticiones: 3 },
    b: { proxima_revision: "2026-10-09", repeticiones: 3 },
  };
  const r = colaDeRepaso([t("a"), t("b")], progreso, "2026-10-07").map((x) => x.id);
  assert.deepEqual(r, ["b", "a"], "ordenadas por cercanía, no un 'vuelve mañana'");
});

test('lo marcado "Otra vez" se pone por delante de lo vencido', () => {
  const progreso = {
    otraVez: { proxima_revision: "2026-10-07", repeticiones: 0, ultima_revision: "2026-10-07" },
    atrasada: { proxima_revision: "2026-09-01", repeticiones: 4 },
  };
  const r = colaDeRepaso([t("atrasada"), t("otraVez")], progreso, "2026-10-07").map((x) => x.id);
  assert.deepEqual(r, ["otraVez", "atrasada"]);
});

test("la cola lleva todas las tarjetas, ninguna se pierde por el camino", () => {
  const lista = [t("a"), t("b"), t("c"), t("d")];
  const progreso = { a: { proxima_revision: "2026-12-01", repeticiones: 2 } };
  const r = colaDeRepaso(lista, progreso, "2026-10-07");
  assert.equal(r.length, 4);
  assert.deepEqual([...r.map((x) => x.id)].sort(), ["a", "b", "c", "d"]);
});

const stats = (o) => ({ nueva: 0, reaprendiendo: 0, joven: 0, madura: 0, ...o });

test("sin fecha objetivo no hay plan", () => {
  assert.equal(planHastaObjetivo(stats({}), "2026-10-01", null), null);
});

test("el plan dice cuántas estrenar al día, contando lo que tarda en cuajar", () => {
  // 60 días hasta el objetivo, 30 de margen para consolidar: quedan 30 para
  // estrenar 60 tarjetas nuevas.
  const p = planHastaObjetivo(stats({ nueva: 60, joven: 10 }), "2026-10-02", "2026-12-01");
  assert.equal(p.dias, 60);
  assert.equal(p.diasParaEstrenar, 60 - DIAS_PARA_CONSOLIDAR);
  assert.equal(p.nuevasPorDia, 2);
  assert.equal(p.sinConsolidar, 70);
  assert.equal(p.llegasConLoEmpezado, true);
});

test("cuando ya no da tiempo a estrenar nada, se dice en vez de pedir imposibles", () => {
  const p = planHastaObjetivo(stats({ nueva: 40, joven: 5 }), "2026-11-20", "2026-12-01");
  assert.equal(p.diasParaEstrenar, 11 - DIAS_PARA_CONSOLIDAR);
  assert.equal(p.nuevasPorDia, null, "pedir 'estrena 4 al día' cuando no cuajan sería mentir");
  assert.equal(p.llegasConLoEmpezado, false);
});

test("una fecha ya pasada se marca como tal", () => {
  const p = planHastaObjetivo(stats({}), "2026-12-05", "2026-12-01");
  assert.equal(p.pasada, true);
  assert.ok(p.dias < 0);
});
