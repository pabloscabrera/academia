// Cambiar de pestaña no borra lo que estabas haciendo, la pestaña abierta se
// ve más oscura que la que tiene el ratón encima, y los exámenes salen hacia
// delante al pasar el ratón. NO la ejecuta `npm test`: necesita Playwright y
// un build hecho.
//
//   npm run build && node tests/pestanas-conservan.mjs
//
// Lo que motivó esto: el trackpad a veces pasa de pestaña sin querer, y antes
// cada pestaña se desmontaba al salir — una tirada o un repaso de flashcards
// volvían a cero. Ahora se esconden. Eso abre tres agujeros que esta prueba
// vigila: que una tirada escondida siga BLOQUEANDO los gestos en las demás
// pestañas, que sus atajos de teclado sigan escuchando (el "1" de Flashcards
// contestaría la pregunta escondida), y que su reloj siga corriendo.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4531, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", process.env.DIST || "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const PREGUNTAS = Array.from({ length: 8 }, (_, i) => ({
  id: "q" + i, curso: i < 4 ? "PIR 25" : "PIR 24", tema: "Tema " + i,
  pregunta: `Enunciado número ${i}:`, opciones: ["Correcta", "Mala 1", "Mala 2", "Mala 3"],
  correcta: 0, explicacion: null, inventada: false, created_at: "2026-01-01T00:00:00Z",
}));
const TARJETAS = Array.from({ length: 4 }, (_, i) => ({
  id: "t" + i, user_id: "u1", mazo: "Porcentajes", frontal: "Frente " + i, posterior: "Dorso " + i,
  etiquetas: [], grupo_id: null,
}));

let fallo = null;
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const json = (r, b, h) => r.fulfill({ status: 200, contentType: "application/json", headers: h, body: typeof b === "string" ? b : JSON.stringify(b) });

const pestana = (p, nombre) => p.locator(".nav-app button", { hasText: new RegExp(nombre, "i") });
const textoVisible = (p) => p.evaluate(() => document.querySelector("main").innerText);

try {
  const ctx = await navegador.newContext({ viewport: { width: 1024, height: 900 } });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("pir-pruebas-sin-portada", "1");
    localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
      access_token: "x", refresh_token: "y", expires_at: 9999999999,
      user: { id: "u1", email: "prueba@ruta-pir.local", user_metadata: { username: "prueba" } },
    }));
  });
  await ctx.route(`**${SB}/rest/**`, (r) => json(r, []));
  await ctx.route(`**${SB}/auth/**`, (r) => json(r, {}));
  await ctx.route(`**${SB}/rest/v1/flashcards?**`, (r) => json(r, r.request().method() === "GET" ? TARJETAS : []));
  await ctx.route(`**${SB}/rest/v1/preguntas*`, (r) => {
    const url = r.request().url();
    const tabla = (url.split("/rest/v1/")[1] || "").split("?")[0];
    if (tabla !== "preguntas") return json(r, []);
    if (r.request().method() === "HEAD" || /\bselect=id\b/.test(url)) return json(r, "", { "content-range": `0-0/${PREGUNTAS.length}` });
    if (/select=actualizado_en/.test(url)) return json(r, [{ actualizado_en: null }]);
    return json(r, PREGUNTAS);
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await esperar(5000);

  // --- 1) los exámenes salen hacia delante con el ratón ---
  const fila = p.locator("button.fila-examen", { hasText: "PIR 25" });
  const otra = p.locator("button.fila-examen", { hasText: "PIR 24" });
  const antesFila = await fila.evaluate((b) => getComputedStyle(b).backgroundColor);
  await fila.hover();
  await esperar(600);
  const encimaFila = await fila.evaluate((b) => ({ fondo: getComputedStyle(b).backgroundColor, t: getComputedStyle(b).transform, clase: b.className }));
  const otraAtenuada = await otra.evaluate((b) => ({ op: getComputedStyle(b).opacity, t: getComputedStyle(b).transform }));
  console.log(`1) fila con el ratón: ${JSON.stringify(encimaFila)} (antes ${antesFila}); la otra: ${JSON.stringify(otraAtenuada)}`);
  if (!/encima/.test(encimaFila.clase)) throw new Error("1) la fila no se marcó al pasar el ratón");
  if (encimaFila.fondo === antesFila) throw new Error("1) el fondo no cambió al pasar el ratón");
  const escala = Number((encimaFila.t.match(/matrix\(([^,]+)/) || [])[1]);
  if (!(escala > 1.005 && escala < 1.05)) throw new Error("1) la fila no crece sutilmente: " + encimaFila.t);
  if (!(Number(otraAtenuada.op) < 1)) throw new Error("1) las demás no retroceden");
  // y cambia al pasar a la otra
  await otra.hover();
  await esperar(600);
  const cambio = await p.evaluate(() => [...document.querySelectorAll("button.fila-examen.encima")].map((b) => b.textContent));
  console.log(`   al pasar a la otra: resaltada ${JSON.stringify(cambio)}`);
  if (cambio.length !== 1 || !/PIR 24/.test(cambio[0])) throw new Error("1) el resalte no siguió al ratón");
  // marcada: más oscura que con el ratón encima
  await fila.click();
  await p.mouse.move(5, 880);
  await esperar(600);
  const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  const marcada = await fila.evaluate((b) => getComputedStyle(b).backgroundColor);
  console.log(`   marcada: ${marcada} · con el ratón: ${encimaFila.fondo}`);
  if (!(lum(marcada) < lum(encimaFila.fondo) - 40)) throw new Error("1) la marcada no es claramente más oscura que la resaltada");
  await fila.click(); // desmarcar

  // --- 2) la pestaña abierta, más oscura que la del ratón ---
  await pestana(p, "duelo").hover();
  await esperar(300);
  const tonos = await p.evaluate(() => {
    const bs = [...document.querySelectorAll(".nav-app button")];
    const fondo = (b) => getComputedStyle(b).backgroundColor;
    return { activa: fondo(bs.find((b) => b.classList.contains("activa"))), encima: fondo(bs.find((b) => b.classList.contains("encima"))) };
  });
  console.log(`2) pestaña abierta ${tonos.activa} · con el ratón ${tonos.encima}`);
  if (!(lum(tonos.activa) < lum(tonos.encima) - 8)) throw new Error("2) la pestaña abierta no es más oscura que la sombreada");
  await p.mouse.move(5, 880);

  // --- 3) una tirada a medias sobrevive a cambiar de pestaña ---
  await p.getByLabel("Cuántas preguntas").fill("5");
  await p.getByLabel("Cuántas preguntas").blur();
  await p.getByRole("button", { name: "Empezar", exact: true }).click();
  await esperar(700);
  await p.getByRole("button", { name: /Correcta/ }).first().click();
  await esperar(300);
  await p.getByRole("button", { name: /^Siguiente$/ }).click();
  await esperar(400);
  const enunciado = (await textoVisible(p)).match(/Enunciado número \d/)[0];
  const relojAntes = (await textoVisible(p)).match(/\d+:\d\d/)?.[0];
  await pestana(p, "flashcards").click();
  await esperar(900);
  // --- 4) una tirada escondida no bloquea los gestos ni escucha el teclado ---
  await p.keyboard.press("1");
  await p.keyboard.press("ArrowRight");
  await esperar(900);
  const trasFlecha = await p.evaluate(() => document.querySelector(".nav-app button.activa").textContent.trim());
  console.log(`4) con la tirada escondida, la flecha → lleva a: ${trasFlecha}`);
  if (!/duelo/i.test(trasFlecha)) throw new Error("4) la tirada escondida bloquea los gestos: " + trasFlecha);
  await esperar(2500);
  await pestana(p, "exámenes").click();
  await esperar(900);
  const vuelta = await textoVisible(p);
  const relojDespues = vuelta.match(/\d+:\d\d/)?.[0];
  console.log(`3) al volver: "Pregunta 2 de 5"=${/Pregunta 2 de 5/.test(vuelta)}, enunciado ${enunciado} sigue=${vuelta.includes(enunciado)}, reloj ${relojAntes} -> ${relojDespues}`);
  if (!/Pregunta 2 de 5/.test(vuelta) || !vuelta.includes(enunciado)) throw new Error("3) la tirada volvió a cero al cambiar de pestaña");
  if (/Correcta/.test(vuelta) && (await p.locator("button.opcion-quiz[disabled]").count()) > 0) throw new Error("4) el '1' pulsado en otra pestaña contestó la pregunta escondida");
  // el reloj no corrió mientras estaba escondida (más de 3 s fuera)
  const seg = (t) => { const [m, s] = t.split(":").map(Number); return m * 60 + s; };
  if (relojAntes && relojDespues && seg(relojDespues) - seg(relojAntes) > 2) throw new Error(`3) el reloj siguió corriendo fuera: ${relojAntes} -> ${relojDespues}`);

  // --- 5) un repaso de flashcards también sobrevive ---
  await pestana(p, "flashcards").click();
  await esperar(800);
  await p.getByText("Porcentajes").first().click();
  await esperar(600);
  await p.getByRole("button", { name: "Empezar repaso" }).click();
  await esperar(700);
  await p.keyboard.press("Enter");
  await esperar(600);
  await p.keyboard.press("3");
  await esperar(700);
  const antesRepaso = (await textoVisible(p)).match(/Tarjeta \d+ de \d+/)[0];
  await pestana(p, "perfil").click();
  await esperar(800);
  await p.keyboard.press("Enter"); // no puede revelar la tarjeta escondida
  await esperar(400);
  await pestana(p, "flashcards").click();
  await esperar(800);
  const vueltaRepaso = await textoVisible(p);
  const girada = await p.evaluate(() => !!document.querySelector(".flip-inner.flipped"));
  console.log(`5) repaso: ${antesRepaso} -> sigue=${vueltaRepaso.includes(antesRepaso)}, girada por un Intro de otra pestaña=${girada}`);
  if (!vueltaRepaso.includes(antesRepaso)) throw new Error("5) el repaso volvió a cero al cambiar de pestaña");
  if (girada) throw new Error("5) un Intro en otra pestaña reveló la tarjeta escondida");

  // --- 6) cada pestaña vuelve a la altura en que la dejaste ---
  await pestana(p, "perfil").click();
  await esperar(800);
  await p.evaluate(() => { document.querySelector("main").style.minHeight = "4000px"; window.scrollTo(0, 600); });
  await esperar(200);
  await pestana(p, "estadísticas").click();
  await esperar(800);
  const yOtra = await p.evaluate(() => window.scrollY);
  await pestana(p, "perfil").click();
  await esperar(800);
  const yVuelta = await p.evaluate(() => window.scrollY);
  console.log(`6) scroll: en la otra pestaña ${yOtra}, al volver ${yVuelta}`);
  if (Math.abs(yVuelta - 600) > 2) throw new Error("6) no volvió a la altura en que se dejó: " + yVuelta);

  if (errores.length) throw new Error("errores JS: " + errores.join(" | "));
  await ctx.close();
  console.log("\nOK: las pestañas conservan lo que había, sin bloquear ni escuchar desde escondidas");
} catch (e) { fallo = e; } finally { await navegador.close(); servidor.kill(); }

if (fallo) { console.error("\nFALLA:", fallo.message); process.exit(1); }
