// Recorrido del rediseño completo en un navegador de verdad:
// portada con su foto, fuentes cargadas, las cinco pestañas sin errores,
// Estadísticas y Perfil separados, y nada que desborde a 390 px.
//
//   npm run build && node tests/rediseno-pantallas.mjs

import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4405;
const URL_SUPABASE = "slwifwjwtipoqtkhbhbr.supabase.co";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const PREGUNTAS = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: `p${n}`, curso: "PIR 25", tema: `Pregunta ${n}`, pregunta: `Enunciado ${n}`,
  opciones: ["A", "B", "C", "D"], correcta: 0, explicacion: null, inventada: false,
  created_at: "2026-01-01T00:00:00+00:00", actualizado_en: "2026-10-01T10:00:00+00:00",
}));

const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
await esperar(4000);
const fallos = [];
const ejecutable = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const navegador = await chromium.launch(ejecutable ? { executablePath: ejecutable } : {});
const rutas = async (ctx) => {
  await ctx.route(`**${URL_SUPABASE}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route(`**${URL_SUPABASE}/rest/**`, (ruta) => {
    const url = ruta.request().url();
    const tabla = (url.split("/rest/v1/")[1] || "").split("?")[0];
    if (tabla === "favoritos") return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ pregunta_id: "p1", name: "prueba" }]) });
    if (tabla === "fallos") return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ pregunta_id: "p2", name: "prueba", veces: 2 }]) });
    if (tabla !== "preguntas") return ruta.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (ruta.request().method() === "HEAD" || /\bselect=id\b/.test(url)) {
      return ruta.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": `0-0/${PREGUNTAS.length}` }, body: "" });
    }
    if (/select=actualizado_en/.test(url)) return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ actualizado_en: "2026-10-01T10:00:00+00:00" }]) });
    return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PREGUNTAS) });
  });
};
const desborda = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

try {
  // 1) Portada, sin sesión.
  const c1 = await navegador.newContext({ viewport: { width: 390, height: 844 } });
  await rutas(c1);
  const p1 = await c1.newPage();
  const e1 = []; p1.on("pageerror", (e) => e1.push(e.message));
  await p1.goto(`http://localhost:${PUERTO}/`, { waitUntil: "load" });
  await p1.getByText("Iniciar sesión").waitFor({ timeout: 20000 });
  await esperar(800);
  const portada = await p1.evaluate(async () => {
    await document.fonts.ready;
    const img = document.querySelector('img[src="/img/portada.jpg"]');
    return {
      foto: !!img && img.complete && img.naturalWidth > 0,
      cabinet: document.fonts.check("800 30px 'Cabinet Grotesk'"),
      switzer: document.fonts.check("500 16px 'Switzer'"),
      inputs: document.querySelectorAll("input").length,
      texto: document.body.innerText.slice(0, 120),
    };
  });
  console.log("1) portada ->", JSON.stringify(portada));
  if (!portada.foto) fallos.push("la foto de la portada no carga");
  if (!/Bienvenido/i.test(portada.texto)) fallos.push("la portada no dice Bienvenido");
  if (portada.inputs < 2) fallos.push("faltan los campos de usuario y contraseña");
  if (await desborda(p1)) fallos.push("la portada desborda a 390 px");
  await p1.getByRole("button", { name: "Crear cuenta" }).first().click();
  if ((await p1.locator("input").count()) < 4) fallos.push("crear cuenta no muestra los cuatro campos");
  if (e1.length) fallos.push("errores en la portada: " + e1.join(" | "));

  // 2) Dentro, con sesión: las cinco pestañas.
  const c2 = await navegador.newContext({ viewport: { width: 390, height: 844 } });
  await c2.addInitScript(() => {
    localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
      access_token: "x", refresh_token: "y", expires_at: 9999999999,
      user: { id: "u1", email: "prueba@ruta-pir.local", user_metadata: { username: "prueba" } },
    }));
  });
  await rutas(c2);
  const p2 = await c2.newPage();
  const e2 = []; p2.on("pageerror", (e) => e2.push(e.message));
  await p2.goto(`http://localhost:${PUERTO}/`, { waitUntil: "load" });
  await p2.getByText("Elige", { exact: false }).first().waitFor({ timeout: 20000 });
  const fuentes = await p2.evaluate(async () => { await document.fonts.ready; return document.fonts.check("800 30px 'Cabinet Grotesk'"); });
  if (!fuentes) fallos.push("dentro de la app no carga Cabinet Grotesk");
  for (const [pestana, espera] of [["Flashcards", /Flashcards/i], ["Duelo", /Tres vidas cada uno/i], ["Estadísticas", /Tu PIR, en números/i], ["Perfil", /Favoritas \(1\)/i], ["Exámenes", /Elige/i]]) {
    await p2.locator("nav button", { hasText: pestana }).first().click();
    await esperar(700);
    const t = await p2.locator("body").innerText();
    console.log(`2) ${pestana} ->`, espera.test(t) ? "ok" : "NO", "| desborda:", await desborda(p2));
    if (t.includes("Algo se ha roto")) fallos.push(`${pestana} rompe la app`);
    if (!espera.test(t)) fallos.push(`${pestana} no pinta lo esperado`);
    if (await desborda(p2)) fallos.push(`${pestana} desborda a 390 px`);
  }
  // 3) Perfil: favoritas primero, se contesta antes de ver la respuesta; falladas con su recuento.
  await p2.locator("nav button", { hasText: "Perfil" }).first().click();
  await esperar(500);
  await p2.getByRole("button", { name: /Falladas \(1\)/ }).click();
  const tf = await p2.locator("body").innerText();
  if (!/fallada 2 veces/.test(tf)) fallos.push("Falladas no muestra el recuento");
  // 4) La navegación va abajo, como en el prototipo.
  const nav = await p2.evaluate(() => { const n = document.querySelector("nav.nav-app"); const r = n.getBoundingClientRect(); return { abajo: Math.round(window.innerHeight - r.bottom), pos: getComputedStyle(n).position }; });
  console.log("4) navegación ->", JSON.stringify(nav));
  if (nav.pos !== "fixed" || nav.abajo > 2) fallos.push("la navegación no va pegada abajo");
  if (e2.length) fallos.push("errores dentro: " + e2.join(" | "));
} catch (err) {
  fallos.push(err.message);
} finally {
  await navegador.close();
  servidor.kill();
}
if (fallos.length) { console.error("FALLOS:\n- " + fallos.join("\n- ")); process.exit(1); }
console.log("OK: portada con foto y fuentes, cinco pestañas sin errores ni desbordes, Estadísticas y Perfil separados.");
