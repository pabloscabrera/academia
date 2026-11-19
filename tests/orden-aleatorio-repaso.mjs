// Dentro de la misma dificultad, el orden de las tarjetas cambia cada vez.
// NO la ejecuta `npm test` (necesita Playwright y un build hecho):
//
//   npm run build && node tests/orden-aleatorio-repaso.mjs
//
// La queja: "no me gusta que las que haya acertado bien desde el principio
// salgan estático, el patrón de respuesta es siempre igual: a a a a b b b b;
// me gustaría que saliera b b a b a a a b, cada vez aleatorio dentro de la
// misma dificultad, para no aprenderme el orden y sí sea memoria".
//
// Por qué hace falta un navegador y no basta `plan.test.mjs`: la función que
// baraja se prueba sola allí, pero quien la llama es `empezar()`, que vive en
// `App.jsx` y `npm test` no alcanza. Esta prueba abre la sesión SEIS veces y
// mira qué tarjeta sale la primera.
//
// Con el código viejo falla siempre: el desempate era `ultima_revision`, un
// instante exacto que no empata nunca, así que la primera era SIEMPRE la
// misma. Con seis arranques, que salgan las seis iguales por azar teniendo
// seis tarjetas es 1 entre 7.776, así que un fallo aquí es un fallo de verdad
// y no mala suerte.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4506, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const hoy = new Date().toISOString().slice(0, 10);
// Seis tarjetas EXACTAMENTE al mismo nivel: todas vencen hoy y todas llevan
// varios repasos. Lo único que las distingue es `ultima_revision`, que es lo
// que las dejaba clavadas en el mismo orden.
const nombres = ["uno", "dos", "tres", "cuatro", "cinco", "seis"];
const tarjetas = nombres.map((n, i) => ({
  id: `t${i}`, user_id: "u1", mazo: "Prueba", frontal: `Frente ${n}`, posterior: `Dorso ${n}`,
  etiquetas: [], grupo_id: null,
}));
const progreso = nombres.map((_, i) => ({
  id: `p${i}`, name: "prueba", flashcard_id: `t${i}`, ease_factor: 2.5, intervalo_dias: 3,
  repeticiones: 4, proxima_revision: hoy, ultima_revision: `2026-10-0${i + 1}T10:00:00Z`,
}));

const fallos = [];
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const ctx = await navegador.newContext({ viewport: { width: 420, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
    access_token: "x", refresh_token: "y", expires_at: 9999999999,
    user: { id: "u1", email: "prueba@ruta-pir.local", user_metadata: { username: "prueba" } },
  }));
});
const pagina = await ctx.newPage();
const errores = [];
pagina.on("pageerror", (e) => errores.push(e.message));
const json = (r, b) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
await pagina.route(`**${SB}/rest/**`, (r) => json(r, []));
await pagina.route(`**${SB}/rest/v1/flashcards?**`, (r) => json(r, tarjetas));
await pagina.route(`**${SB}/rest/v1/flashcards_progreso?**`, (r) => json(r, progreso));
await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
const abrirMazo = async () => {
  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await esperar(3500);
  await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
  await esperar(900);
  await pagina.getByRole("button", { name: /Prueba/ }).first().click();
  await esperar(700);
};
const frenteALaVista = () => pagina.evaluate(() => {
  const cara = document.querySelector(".flip-face");
  return cara ? cara.innerText.trim().split("\n").find((l) => l.startsWith("Frente")) || "" : "";
});

// Durante la sesión no hay botón de volver, así que cada vuelta recarga la
// página. De paso comprueba que el orden tampoco se queda fijo entre cargas.
const primeras = [];
for (let i = 0; i < 6; i++) {
  await abrirMazo();
  await pagina.getByRole("button", { name: /Empezar repaso/i }).first().click();
  await esperar(500);
  primeras.push(await frenteALaVista());
}

console.log("1) primera tarjeta en 6 arranques ->", JSON.stringify(primeras));
const distintas = new Set(primeras.filter(Boolean));
if (primeras.some((p) => !p)) fallos.push(`alguna vuelta no enseñó tarjeta: ${JSON.stringify(primeras)}`);
if (distintas.size < 2) {
  fallos.push(`la primera tarjeta es SIEMPRE la misma (${[...distintas][0]}): el orden sigue siendo fijo`);
}
console.log("   distintas ->", distintas.size, "de 6");

// Y las seis tienen que seguir saliendo: barajar no puede perder ninguna.
// Se sigue en la sesión que dejó abierta la última vuelta del bucle.
const vistas = [];
for (let i = 0; i < 6; i++) {
  const frente = await frenteALaVista();
  if (frente) vistas.push(frente);
  await pagina.locator(".flip-container").first().click();
  await esperar(250);
  await pagina.getByRole("button", { name: /^Bien$/ }).first().click();
  await esperar(400);
}
console.log("2) la sesión entera ->", JSON.stringify(vistas));
if (new Set(vistas).size !== 6) {
  fallos.push(`la sesión no enseñó las seis distintas: ${JSON.stringify(vistas)}`);
}

console.log("ERRORES JS:", errores.length ? errores.join(" | ") : "ninguno");
await navegador.close();
servidor.kill();
if (errores.length) fallos.push(`errores de JS: ${errores.join(" | ")}`);
if (fallos.length) {
  console.error("\nFALLOS:\n- " + fallos.join("\n- "));
  process.exit(1);
}
console.log("\nOK: el orden dentro del mismo nivel cambia en cada sesión y no se pierde ninguna tarjeta.");
