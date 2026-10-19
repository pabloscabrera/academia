// La barra roja de aviso, en un móvil estrecho. NO la ejecuta `npm test`
// (que solo coge `tests/*.test.mjs`): necesita Playwright y un build hecho.
//
//   npm run build && node tests/aviso-recargar.mjs
//
// Lo que reportó el usuario, con captura: al irse la conexión sale la barra
// pegada al borde de arriba y "tampoco me deja interactuar con la x para
// quitar la alerta" — porque desde el icono de la pantalla de inicio ese
// borde es la hora y la batería de iOS, dibujadas encima de la barra. Y
// cerrar el aviso tampoco arreglaba nada: lo que hacía falta era volver a
// cargar.
//
// Aquí se comprueba lo que se puede comprobar en un navegador de escritorio:
//  A) con el servidor MUDO sale el aviso de conexión, el botón es "Recargar"
//     (ya no hay X), un toque en su centro LE LLEGA A ÉL (`elementFromPoint`,
//     no mirar la captura), la barra no desborda a 390 px, y pulsarlo recarga
//     de verdad la página.
//  B) al volver la red, el aviso de conexión se retira solo.
//  C) un rechazo del servidor (42501) NO se retira al volver la red —eso no
//     lo arregla reconectar— y sí se retira en cuanto una escritura sale
//     bien.
// El `env(safe-area-inset-top)` no se puede provocar desde aquí (Chromium de
// escritorio lo da en 0), así que lo que se comprueba es que el navegador
// ACEPTA esa declaración: un valor inválido lo tiraría y `style.paddingTop`
// volvería vacío.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4497, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const preguntas = [{ id: "q0", pregunta: "¿Pregunta cero?", opciones: ["a", "b", "c", "d"], correcta: 0,
  explicacion: "x", tema: "T", curso: "PIR 25", inventada: false,
  created_at: "2026-01-01T00:00:00Z", actualizado_en: "2026-01-01T00:00:00Z" }];

let modo = "mudo";              // mudo | rechaza | bien
const fallos = [];
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
// 390 px es un iPhone, que es donde pasó.
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
await pagina.route(`**${SB}/rest/**`, (r) => json(r, []));
await pagina.route(`**${SB}/rest/v1/preguntas?**`, (r) => json(r, preguntas));
await pagina.route(`**${SB}/rest/v1/favoritos?**`, (r) => {
  if (r.request().method() === "GET") return json(r, []);
  if (modo === "mudo") return new Promise(() => {});
  if (modo === "rechaza") return json(r, { code: "42501", message: 'new row violates row-level security policy for table "favoritos"' }, 403);
  return json(r, [{ id: "f1", name: "prueba", pregunta_id: "q0" }]);
});
await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

const barra = pagina.locator('[role="alert"]');
const textoBarra = async () => ((await barra.count()) ? (await barra.first().innerText()).replace(/\s+/g, " ").trim() : null);
const pulsarEstrella = async () => {
  await pagina.getByRole("button", { name: /Banco/i }).first().click();
  await esperar(1200);
  await pagina.locator('button[title*="favorita"]').first().click();
};
const abrir = async () => {
  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await esperar(5000);
};

// ---------- A) servidor mudo: el aviso, el botón y el toque ----------
await abrir();
await pulsarEstrella();
await esperar(11500);                      // el plazo de escritura son 10 s
const avisoRed = await textoBarra();
if (!avisoRed || !/conexi/i.test(avisoRed)) fallos.push(`[mudo] no salió el aviso de conexión, salió: ${JSON.stringify(avisoRed)}`);
console.log("A) aviso ->", JSON.stringify(avisoRed));

if (await pagina.locator('[role="alert"] button[aria-label="Cerrar aviso"]').count() > 0) fallos.push("[mudo] sigue habiendo una X de cerrar");
const recargar = barra.first().locator('button[aria-label="Recargar la página"]');
if (await recargar.count() !== 1) fallos.push("[mudo] no hay botón de recargar");

const medidas = await barra.first().evaluate((el) => {
  const b = el.querySelector("button").getBoundingClientRect();
  const centro = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return {
    desbordaBarra: el.scrollWidth > el.clientWidth,
    desbordaPagina: document.documentElement.scrollWidth > window.innerWidth,
    reservaArriba: el.style.paddingTop,
    altoBoton: Math.round(b.height),
    anchoBoton: Math.round(b.width),
    tocaElBoton: !!(centro && centro.closest("button") === el.querySelector("button")),
    iconoDentro: !!el.querySelector("svg"),
  };
});
console.log("A) medidas ->", JSON.stringify(medidas));
if (medidas.desbordaBarra) fallos.push("[mudo] la barra desborda a 390 px");
if (medidas.desbordaPagina) fallos.push("[mudo] la página entera se ensancha con la barra puesta");
if (!/env\(safe-area-inset-top\)/.test(medidas.reservaArriba)) fallos.push(`[mudo] la barra no reserva el hueco del sistema: ${JSON.stringify(medidas.reservaArriba)}`);
if (!medidas.tocaElBoton) fallos.push("[mudo] un toque en el centro del botón NO le llega al botón");
if (medidas.altoBoton < 38) fallos.push(`[mudo] el botón mide ${medidas.altoBoton} px de alto, demasiado poco para un dedo`);
if (!medidas.iconoDentro) fallos.push("[mudo] el botón no lleva icono");

// Recargar tiene que recargar de verdad. Con el código viejo no hay botón que
// pulsar, así que esto se salta en vez de esperar 30 s a un clic imposible.
if (await recargar.count() === 1) {
  await pagina.evaluate(() => { window.__marca = 1; });
  await recargar.click();
  await esperar(4000);
  if (await pagina.evaluate(() => window.__marca) === 1) fallos.push("[mudo] pulsar Recargar no recargó la página");
  console.log("A) tras pulsar Recargar, ¿queda la marca anterior?", await pagina.evaluate(() => window.__marca ?? null));
}

// ---------- B) al volver la red, el aviso de conexión se va ----------
await abrir();
await pulsarEstrella();
await esperar(11500);
if (!await textoBarra()) fallos.push("[red] no salió el aviso antes de reconectar");
await pagina.evaluate(() => window.dispatchEvent(new Event("online")));
await esperar(600);
const trasVolverLaRed = await textoBarra();
console.log("B) tras volver la red ->", JSON.stringify(trasVolverLaRed));
if (trasVolverLaRed) fallos.push(`[red] el aviso de conexión sigue ahí tras reconectar: ${JSON.stringify(trasVolverLaRed)}`);

// ---------- C) un rechazo del servidor es otra cosa ----------
modo = "rechaza";
await abrir();
await pulsarEstrella();
await esperar(2000);
const avisoPermisos = await textoBarra();
console.log("C) aviso ->", JSON.stringify(avisoPermisos));
if (!avisoPermisos || !/permisos/i.test(avisoPermisos)) fallos.push(`[permisos] no salió el aviso de permisos, salió: ${JSON.stringify(avisoPermisos)}`);
await pagina.evaluate(() => window.dispatchEvent(new Event("online")));
await esperar(600);
if (!await textoBarra()) fallos.push("[permisos] reconectar borró un aviso que reconectar no arregla");

modo = "bien";
await pagina.locator('button[title*="favorita"]').first().click();
await esperar(2000);
const trasAcertar = await textoBarra();
console.log("C) tras una escritura que SÍ sale bien ->", JSON.stringify(trasAcertar));
if (trasAcertar) fallos.push(`[permisos] el aviso no se retiró al guardar bien: ${JSON.stringify(trasAcertar)}`);

console.log("ERRORES JS:", errores.length ? errores.join(" | ") : "ninguno");
await navegador.close(); servidor.kill();
if (errores.length) fallos.push("errores de JavaScript: " + errores.join(" | "));
if (fallos.length) { console.error("\nFALLA:\n- " + fallos.join("\n- ")); process.exit(1); }
console.log("\nOK: la barra reserva el hueco de arriba, el toque llega al botón de recargar, y el aviso se retira cuando vuelve la red o cuando se guarda bien.");
