// Copiar UNA tarjeta a otro mazo sin que desaparezca de donde estaba.
// NO la ejecuta `npm test`: necesita Playwright y un build hecho.
//
//   npm run build && node tests/copiar-tarjeta.mjs
//
// Por qué hace falta en navegador: el botón de la tarjeta era un "Mover" de
// verdad —un `update` del campo `mazo`—, así que la prueba que vale es mirar
// QUÉ PETICIÓN SALE. Un PATCH sería la mudanza (el fallo); un POST con el
// `grupo_id` del original es la copia con el repaso compartido. `copiaDeTarjeta`
// se prueba aparte en `copiar.test.mjs`; esto cubre el cableado.
//
// Ojo al montar la prueba: los botones Editar/Copiar/Borrar de una tarjeta
// solo aparecen tras tocar su fila, no están en la lista plegada.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
const PUERTO = 4495, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);
const tarjetas = [
  { id: "t0", user_id: "u1", mazo: "Porcentajes", frontal: "Prevalencia del TOC", posterior: "2%", etiquetas: ["pct"], grupo_id: "t0" },
  { id: "t1", user_id: "u1", mazo: "Porcentajes", frontal: "Otra", posterior: "x", etiquetas: [], grupo_id: "t1" },
  { id: "t2", user_id: "u1", mazo: "Young", frontal: "Esquema", posterior: "Dominio", etiquetas: [], grupo_id: "t2" },
];
const peticiones = [];
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const ctx = await navegador.newContext({ viewport: { width: 440, height: 1000 } });
await ctx.addInitScript(() => {
  localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
    access_token: "x", refresh_token: "y", expires_at: 9999999999,
    user: { id: "u1", email: "pabloadmin@ruta-pir.local", user_metadata: { username: "pabloadmin" } },
  }));
});
const pagina = await ctx.newPage();
const errores = [];
pagina.on("pageerror", (e) => errores.push(e.message));
const json = (r, b) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
await pagina.route(`**${SB}/rest/**`, (r) => json(r, []));
await pagina.route(`**${SB}/rest/v1/flashcards?**`, (r) => {
  const m = r.request().method();
  if (m === "GET") return json(r, tarjetas);
  peticiones.push({ metodo: m, cuerpo: r.request().postData() });
  if (m === "PATCH") return json(r, []);        // un "mover" sería esto
  const filas = JSON.parse(r.request().postData() || "[]");
  return json(r, filas.map((f, i) => ({ id: "nueva" + i, user_id: "u1", ...f })));
});
await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
await esperar(5000);
await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
await esperar(1000);
await pagina.getByText("Porcentajes", { exact: false }).first().click();
await esperar(1000);
await pagina.getByRole("button", { name: /Ver, añadir y editar/i }).click();
await esperar(900);
console.log("ANTES, tarjetas de Porcentajes:", (await pagina.locator("body").innerText()).match(/Prevalencia del TOC/g)?.length || 0);
console.log("BOTONES VISIBLES:", JSON.stringify((await pagina.getByRole("button").allInnerTexts()).filter(Boolean).slice(0, 25)));
const tarjetaFila = pagina.getByText("Prevalencia del TOC").first();
await tarjetaFila.click().catch(() => {});
await esperar(800);
console.log("BOTONES TRAS TOCAR LA TARJETA:", JSON.stringify((await pagina.getByRole("button").allInnerTexts()).filter(Boolean).slice(0, 25)));
await pagina.getByRole("button", { name: /^Copiar$/ }).first().click();
await esperar(700);
await pagina.locator("select").last().selectOption("Young").catch(() => {});
await esperar(300);
console.log("PANEL:", JSON.stringify((await pagina.locator("body").innerText()).match(/Copiar esta tarjeta a:[\s\S]{0,180}/)?.[0]));
await pagina.getByRole("button", { name: /^Copiar a "/ }).first().click();
await esperar(2000);
console.log("PETICIONES:", JSON.stringify(peticiones));
const sigue = (await pagina.locator("body").innerText()).includes("Prevalencia del TOC");
console.log("¿la original sigue en Porcentajes?", sigue);
// Y en el otro mazo tiene que estar la copia.
await pagina.getByRole("button", { name: /Mazos/i }).first().click().catch(() => {});
await esperar(900);
const txt = await pagina.locator("body").innerText();
console.log("LISTA DE MAZOS:", JSON.stringify(txt.match(/Porcentajes\n[^\n]*|Young\n[^\n]*/g)));
console.log("ERRORES JS:", errores.length ? errores.join(" | ") : "ninguno");
await navegador.close(); servidor.kill();
