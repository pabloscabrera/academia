// La rejilla de mazos y las carpetas, en un navegador de verdad.
// NO la ejecuta `npm test` (necesita Playwright y un build hecho):
//
//   npm run build && node tests/mazos-carpetas.mjs
//
// Qué se comprueba, y por qué cada cosa:
//  1. A 390 px (un iPhone) la rejilla tiene EXACTAMENTE tres columnas y la
//     página no se ensancha. Lo segundo ya pasó una vez con la cabecera y la
//     comprobación que vale es `scrollWidth`, no mirar la captura.
//  2. Los cuadros son cuadrados, con esquinas muy redondeadas, y miden lo
//     bastante para tocarlos con el dedo.
//  3. Una carpeta se abre y dentro están SUS mazos, no todos.
//  4. Guardar una carpeta manda `carpeta` a `mazos_estilo` SIN perder el icono
//     ni el color que ya tenía: van en la misma fila, y mandar solo uno los
//     borraría. Por eso el test mira el cuerpo de la petición y no la pantalla.
//  5. En un iPad (820 px) siguen siendo tres columnas y no se desmadran de
//     tamaño ("grandes tmp excesivo").
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4498, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const MAZOS = ["Porcentajes", "Young", "TDC", "TBM", "ACT dolor", "Proyectivas", "Big Five"];
const tarjetas = MAZOS.flatMap((m, i) => [0, 1].map((j) => ({
  id: `t${i}${j}`, user_id: "u1", mazo: m, frontal: `Frente ${m} ${j}`, posterior: `Dorso ${j}`,
  etiquetas: [], grupo_id: null,
})));
// Dos mazos ya colocados en carpetas; el resto sueltos.
const estilos = [
  { user_id: "u1", mazo: "Young", carpeta: "Psicoterapias", icono: null, color: null },
  { user_id: "u1", mazo: "TDC", carpeta: "Psicoterapias", icono: "Brain", color: "acento" },
  { user_id: "u1", mazo: "Big Five", carpeta: "Personalidad", icono: null, color: null },
];

const fallos = [];
const enviados = [];
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
await pagina.route(`**${SB}/rest/**`, (r) => json(r, []));
await pagina.route(`**${SB}/rest/v1/flashcards?**`, (r) => json(r, tarjetas));
await pagina.route(`**${SB}/rest/v1/mazos_estilo?**`, (r) => {
  if (r.request().method() === "GET") return json(r, estilos);
  enviados.push({ metodo: r.request().method(), cuerpo: r.request().postData() });
  return json(r, []);
});
await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
await esperar(5000);
await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
await esperar(1200);

// ---------- 1 y 2: la rejilla a 390 px ----------
const rejilla = pagina.locator("div").filter({ hasText: /^/ }).locator("css=div").first();
const medidas = await pagina.evaluate(() => {
  const g = [...document.querySelectorAll("div")].find((d) => getComputedStyle(d).display === "grid"
    && getComputedStyle(d).gridTemplateColumns.split(" ").length === 3);
  if (!g) return null;
  const cs = getComputedStyle(g);
  const cuadro = g.querySelector("button");
  const r = cuadro.getBoundingClientRect();
  const rc = getComputedStyle(cuadro);
  return {
    columnas: cs.gridTemplateColumns.split(" ").length,
    hijos: g.children.length,
    ancho: Math.round(r.width), alto: Math.round(r.height),
    radio: rc.borderRadius,
    desbordaPagina: document.documentElement.scrollWidth > window.innerWidth,
  };
});
console.log("1) rejilla a 390 px ->", JSON.stringify(medidas));
if (!medidas) fallos.push("[390] no se encontró ninguna rejilla de 3 columnas");
else {
  if (medidas.columnas !== 3) fallos.push(`[390] la rejilla tiene ${medidas.columnas} columnas, no 3`);
  if (medidas.desbordaPagina) fallos.push("[390] la página se ensancha con la rejilla puesta");
  if (Math.abs(medidas.ancho - medidas.alto) > 2) fallos.push(`[390] los cuadros no son cuadrados: ${medidas.ancho}x${medidas.alto}`);
  if (medidas.ancho < 80) fallos.push(`[390] los cuadros miden ${medidas.ancho} px, demasiado poco`);
  if (parseInt(medidas.radio, 10) < 14) fallos.push(`[390] las esquinas no están redondeadas: ${medidas.radio}`);
}

// Siete mazos, de los que TRES están en carpetas (Young y TDC en
// "Psicoterapias", Big Five en "Personalidad"): en la raíz se ven 2 carpetas +
// 4 sueltos = 6 cuadros. Lo que importa aquí es que los que están dentro de
// una carpeta NO aparecen además sueltos.
if (medidas && medidas.hijos !== 6) fallos.push(`[raíz] se esperaban 6 cuadros (2 carpetas + 4 sueltos) y hay ${medidas.hijos}`);

// ---------- 3: abrir una carpeta ----------
await pagina.getByRole("button", { name: /Psicoterapias/ }).first().click();
await esperar(700);
const dentro = await pagina.evaluate(() => {
  const g = [...document.querySelectorAll("div")].find((d) => getComputedStyle(d).display === "grid"
    && getComputedStyle(d).gridTemplateColumns.split(" ").length === 3);
  return g ? [...g.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => t) : [];
});
console.log("3) dentro de la carpeta ->", JSON.stringify(dentro));
if (!(dentro.some((t) => t.includes("Young")) && dentro.some((t) => t.includes("TDC")))) {
  fallos.push(`[carpeta] no están sus dos mazos dentro: ${JSON.stringify(dentro)}`);
}
if (dentro.some((t) => t.includes("Porcentajes"))) fallos.push("[carpeta] dentro se ve un mazo que no es suyo");

// ---------- 4: guardar la carpeta sin perder icono ni color ----------
await pagina.getByRole("button", { name: /Opciones de TDC/ }).first().click();
await esperar(500);
await pagina.getByRole("button", { name: /^Carpeta$/ }).first().click();
await esperar(500);
await pagina.locator('input[placeholder*="carpeta nueva"], input[placeholder*="Nombre de la carpeta"]').first().fill("Terapias de tercera ola");
await esperar(200);
await pagina.getByRole("button", { name: /Mover a "/ }).first().click();
await esperar(1500);
console.log("4) enviado a mazos_estilo ->", JSON.stringify(enviados));
const ultimo = enviados.length ? JSON.parse(enviados[enviados.length - 1].cuerpo || "{}") : null;
if (!ultimo || ultimo.carpeta !== "Terapias de tercera ola") fallos.push(`[guardar] no se mandó la carpeta: ${JSON.stringify(ultimo)}`);
if (ultimo && (ultimo.icono !== "Brain" || ultimo.color !== "acento")) {
  fallos.push(`[guardar] cambiar la carpeta se llevó por delante el icono o el color: ${JSON.stringify(ultimo)}`);
}

// ---------- 5: en un iPad ----------
await pagina.setViewportSize({ width: 820, height: 1100 });
await esperar(800);
const iPad = await pagina.evaluate(() => {
  const g = [...document.querySelectorAll("div")].find((d) => getComputedStyle(d).display === "grid"
    && getComputedStyle(d).gridTemplateColumns.split(" ").length === 3);
  if (!g) return null;
  const r = g.querySelector("button").getBoundingClientRect();
  return { columnas: 3, ancho: Math.round(r.width), desborda: document.documentElement.scrollWidth > window.innerWidth };
});
console.log("5) a 820 px ->", JSON.stringify(iPad));
if (!iPad) fallos.push("[820] desapareció la rejilla");
else {
  if (iPad.ancho > 220) fallos.push(`[820] los cuadros se van a ${iPad.ancho} px, demasiado grandes`);
  if (iPad.desborda) fallos.push("[820] la página se ensancha");
}

await pagina.setViewportSize({ width: 390, height: 844 });
await esperar(500);
await pagina.screenshot({ path: "/tmp/claude-0/-home-user-academia/0947b359-e7dd-5296-82b5-d7a3a69581c4/scratchpad/rejilla.png" });

console.log("ERRORES JS:", errores.length ? errores.join(" | ") : "ninguno");
await navegador.close(); servidor.kill();
if (errores.length) fallos.push("errores de JavaScript: " + errores.join(" | "));
if (fallos.length) { console.error("\nFALLA:\n- " + fallos.join("\n- ")); process.exit(1); }
console.log("\nOK: tres columnas, cuadros cuadrados y redondeados, carpetas que se abren y ajustes que no se pisan.");
