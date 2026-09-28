import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mezclarTemas, temaDeTarjeta, sugerirAdelanto, planHastaObjetivo,
  PICO_MINIMO, DIAS_PARA_CONSOLIDAR,
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

const dia = (f, n) => ({ fecha: f, cuantas: n });

test("se avisa del pico y se propone bajarlo a la media", () => {
  const s = sugerirAdelanto([dia("d0", 10), dia("d1", 8), dia("d2", 60), dia("d3", 9), dia("d4", 7)]);
  assert.equal(s.fecha, "d2");
  assert.equal(s.cuantas, 60);
  assert.ok(s.adelantar > 0 && s.quedarian < 60);
  assert.ok(s.adelantar <= 25, "no se propone adelantar media sesión de golpe");
});

test("no se molesta al usuario por tres tarjetas de más", () => {
  assert.equal(sugerirAdelanto([dia("d0", 5), dia("d1", 6), dia("d2", 9), dia("d3", 5)]), null,
    `el pico no llega al mínimo de ${PICO_MINIMO}`);
  assert.equal(sugerirAdelanto([dia("d0", 30), dia("d1", 30), dia("d2", 32), dia("d3", 30)]), null,
    "carga alta pero repartida: no hay nada que repartir");
});

test("hoy no cuenta como pico: lo que toca hoy no se adelanta", () => {
  const s = sugerirAdelanto([dia("hoy", 90), dia("d1", 5), dia("d2", 6), dia("d3", 5)]);
  assert.equal(s, null);
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
