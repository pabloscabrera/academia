// Buscador de mazos, en un navegador de verdad.
// NO la ejecuta `npm test` (necesita Playwright y un build hecho):
//
//   npm run build && node tests/buscar-mazos.mjs
//
// Qué se comprueba y por qué:
//  1. Con pocos mazos el buscador NO sale (a partir de MIN_MAZOS_BUSCADOR).
//  2. Buscar sin tildes y en minúsculas encuentra "CLÍNICA (+DATOS)": quien
//     busca no pone la tilde ni recuerda cómo escribió el nombre.
//  3. Dos palabras sueltas y desordenadas encuentran "FASES de la ENTREVISTA".
//  4. **Lo que de verdad importa: un mazo metido en una carpeta CERRADA
//     aparece en los resultados.** Sin esto el buscador no resuelve nada, que
//     es el motivo de enseñar los resultados en lista plana.
//  5. Buscar el nombre de la carpeta saca lo que lleva dentro.
//  6. Sin coincidencias se dice, y no se queda la lista entera ni vacía y muda.
//  7. La X borra la búsqueda y la pantalla vuelve EXACTAMENTE a como estaba
//     (carpetas, "Todas las tarjetas" y todos los mazos).
//  8. Un resultado se puede tocar y abre ese mazo — son filas vivas, no texto.
//  9. A 390 px no se ensancha la página (scrollWidth, no mirar la captura).
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4507, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const NOMBRES = [
  "CLÍNICA (+DATOS)",
  "MODELOS CLINICA",
  "FASES de la ENTREVISTA",
  "Técnicas de entrevista",
  "Big Five Facetas",
  "Modelo cúbico de Guilford",
  "PRUEBAS PROYECTIVAS",
  "Espectro bipolar",
];
const carta = (m, j) => ({
  id: `${m}-${j}`, user_id: "u1", mazo: m, frontal: `F ${m}${j}`, posterior: `D ${j}`,
  etiquetas: [], grupo_id: null,
});
const todas = NOMBRES.map((m) => carta(m, 0));
// "Big Five Facetas" y "Espectro bipolar" viven DENTRO de una carpeta, que al
// empezar está cerrada: son los dos casos del punto 4.
const estilos = [
  { user_id: "u1", mazo: "Big Five Facetas", carpeta: "Personalidad", icono: null, color: null },
  { user_id: "u1", mazo: "Espectro bipolar", carpeta: "Personalidad", icono: null, color: null },
];

let juego = todas; // se cambia para el escenario de "pocos mazos"
const fallos = [];
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => {
  localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
    access_token: "x", refresh_token: "y", expires_at: 9999999999,
    user: { id: "u1", email: "prueba@ruta-pir.local", user_metadata: { username: "prueba" } },
  }));
});
const pagina = await ctx.newPage();
const errores = [];
pagina.on("pageerror", (e) => errores.push(e.message));
const json = (r, b, s = 200) => r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
// Ojo: en Playwright gana la ruta registrada DESPUÉS, así que el comodín va primero.
await pagina.route(`**${SB}/rest/**`, (r) => json(r, []));
await pagina.route(`**${SB}/rest/v1/flashcards?**`, (r) => json(r, juego));
await pagina.route(`**${SB}/rest/v1/mazos_estilo?**`, (r) => json(r, estilos));
await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

const entrar = async () => {
  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await esperar(5000);
  await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
  await esperar(1200);
};
// La lista tal y como se ve. El nombre sale del `div` del título y no de
// partir el textContent del botón, donde van pegados nombre y recuento.
const lista = () => pagina.evaluate(() =>
  [...document.querySelectorAll("button")]
    .filter((b) => /\d+\s*(tarjetas?|mazos?)/.test(b.textContent))
    .map((b) => { const t = b.querySelector("span > div"); return t ? t.textContent.trim() : ""; })
    .filter(Boolean));
const buscar = async (texto) => {
  await pagina.fill("#buscar-mazos", texto);
  await esperar(400);
};
const comprobar = (ok, queFalla) => { if (!ok) fallos.push(queFalla); };

// --- 1. Con pocos mazos no sale el buscador -------------------------------
juego = [carta("Uno", 0), carta("Dos", 0), carta("Tres", 0)];
await entrar();
comprobar(await pagina.locator("#buscar-mazos").count() === 0,
  "con 3 mazos ya sale el buscador, y ahí solo es ruido");

juego = todas;
await entrar();
comprobar(await pagina.locator("#buscar-mazos").count() === 1,
  "con 8 mazos NO sale el buscador");

const inicial = await lista();
comprobar(inicial.includes("Todas las tarjetas"), "no está 'Todas las tarjetas' antes de buscar");
comprobar(inicial.includes("Personalidad"), "no está la carpeta 'Personalidad' antes de buscar");
comprobar(!inicial.includes("Big Five Facetas"),
  "'Big Five Facetas' se ve en la raíz, así que no está dentro de la carpeta y el punto 4 no probaría nada");

// --- 2. Sin tildes y en minúsculas ----------------------------------------
await buscar("clinica");
let r = await lista();
comprobar(r.includes("CLÍNICA (+DATOS)"), `"clinica" no encuentra "CLÍNICA (+DATOS)" (salió: ${r.join(" | ")})`);
comprobar(r.includes("MODELOS CLINICA"), `"clinica" no encuentra "MODELOS CLINICA" (salió: ${r.join(" | ")})`);
comprobar(!r.includes("Todas las tarjetas"), "'Todas las tarjetas' sigue en medio de los resultados");

// --- 3. Dos palabras sueltas y desordenadas -------------------------------
await buscar("entrevista fases");
r = await lista();
comprobar(r.length === 1 && r[0] === "FASES de la ENTREVISTA",
  `"entrevista fases" no encuentra "FASES de la ENTREVISTA" (salió: ${r.join(" | ")})`);

// --- 4. Un mazo dentro de una carpeta CERRADA ------------------------------
await buscar("facetas");
r = await lista();
comprobar(r.includes("Big Five Facetas"),
  `un mazo dentro de una carpeta cerrada no aparece al buscarlo (salió: ${r.join(" | ")})`);

// --- 5. Buscar la carpeta saca lo que lleva dentro -------------------------
await buscar("personalidad");
r = await lista();
comprobar(r.includes("Big Five Facetas") && r.includes("Espectro bipolar") && r.length === 2,
  `buscar la carpeta no saca sus dos mazos (salió: ${r.join(" | ")})`);

// --- 6. Sin coincidencias --------------------------------------------------
await buscar("zzzz");
r = await lista();
comprobar(r.length === 0, `"zzzz" devuelve mazos (salió: ${r.join(" | ")})`);
comprobar((await pagina.locator("text=Ningún mazo").count()) === 1, "sin resultados no se dice nada");

// --- 9. No desborda --------------------------------------------------------
const ancho = await pagina.evaluate(() => ({
  doc: document.documentElement.scrollWidth, win: window.innerWidth,
}));
comprobar(ancho.doc <= ancho.win, `la página se ensancha con el buscador: ${ancho.doc} > ${ancho.win}`);

// --- 7. La X lo borra y todo vuelve ---------------------------------------
await pagina.click('button[title="Borrar la búsqueda"]');
await esperar(500);
comprobar((await pagina.inputValue("#buscar-mazos")) === "", "la X no vacía el campo");
const vuelta = await lista();
comprobar(JSON.stringify(vuelta) === JSON.stringify(inicial),
  `al borrar la búsqueda la lista no vuelve a como estaba\n  antes: ${inicial.join(" | ")}\n  después: ${vuelta.join(" | ")}`);

// --- 8. Un resultado se puede tocar y abre el mazo -------------------------
await buscar("proyectivas");
await pagina.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("PRUEBAS PROYECTIVAS"));
  b.click();
});
await esperar(900);
const dentro = await pagina.evaluate(() => document.body.innerText);
comprobar(/"PRUEBAS PROYECTIVAS"/.test(dentro), "tocar un resultado no abre ese mazo");

comprobar(errores.length === 0, `errores en la página: ${errores.join(" / ")}`);

await navegador.close();
servidor.kill();
if (fallos.length) { console.error("FALLA:\n- " + fallos.join("\n- ")); process.exit(1); }
console.log("OK: el buscador encuentra sin tildes, por varias palabras y dentro de carpetas cerradas; la X lo deshace entero");
