// Al pasar de tarjeta NO se puede ver, ni un instante, la respuesta de la que
// viene. NO la ejecuta `npm test`: necesita Playwright y un build hecho.
//
//   npm run build && node tests/transicion-tarjeta.mjs
//
// Qué se mide y por qué vale: el ángulo real de `.flip-inner`, sacado del
// `transform` calculado por el navegador (el primer valor de la matriz3d es
// el coseno del giro). Con `backface-visibility: hidden` y la cara trasera a
// `rotateY(180deg)`, la trasera mira al usuario EXACTAMENTE cuando el interior
// está cerca de 180 — así que el ángulo no es un proxy, es la respuesta a
// "¿se está viendo el dorso?".
//
// Dos comprobaciones, y la segunda es la que impide "arreglarlo" matando la
// animación entera: al pasar de tarjeta el giro tiene que ser instantáneo, y
// al TOCAR la tarjeta tiene que seguir animándose.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4495, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const tarjetas = Array.from({ length: 6 }, (_, i) => ({
  id: "t" + i, user_id: "u1", mazo: "Porcentajes", frontal: "Frente " + i, posterior: "Dorso " + i,
  etiquetas: [], grupo_id: null,
}));
const progreso = tarjetas.map((t, i) => ({
  id: "p" + i, name: "prueba", user_id: "u1", flashcard_id: t.id, ease_factor: 2.5,
  intervalo_dias: 9, repeticiones: 3, ultima_revision: `2026-10-0${(i % 5) + 1}T10:00:00.000Z`,
  proxima_revision: "2026-10-05",
}));

let fallo = null;
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });

// Grados de giro del interior: 0 = se ve el frente, 180 = se ve el dorso.
const giro = (pagina) => pagina.evaluate(`(() => {
  const el = document.querySelector(".flip-inner");
  if (!el) return null;
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  const n = t.slice(t.indexOf("(") + 1, -1).split(",").map(Number);
  const cos = n.length === 16 ? n[0] : n[0];
  return Math.round((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
})()`);

const textoTarjeta = (pagina) => pagina.evaluate(`document.querySelector(".flip-container").innerText`);

try {
  const ctx = await navegador.newContext({ viewport: { width: 1024, height: 950 } });
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
  await pagina.route(`**${SB}/rest/v1/flashcards_progreso?**`, (r) => {
    if (r.request().method() === "GET") return json(r, progreso);
    let c = []; try { c = JSON.parse(r.request().postData() || "[]"); } catch {}
    return json(r, Array.isArray(c) ? c : [c]);
  });
  await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await esperar(5000);
  await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
  await esperar(800);
  await pagina.getByText("Porcentajes", { exact: false }).first().click();
  await esperar(800);
  await pagina.locator('input[type="number"]').fill("6");
  await pagina.locator('input[type="number"]').blur();
  await esperar(300);
  await pagina.getByRole("button", { name: "Empezar repaso" }).click();
  await esperar(800);

  // --- A) CONTROL: tocar la tarjeta sigue animando el giro ---
  // Si esto deja de cumplirse, el arreglo se ha llevado por delante la
  // animación que sí se quiere.
  const alEmpezar = await giro(pagina);
  await pagina.locator(".flip-container").click();
  await esperar(120);
  const aMitadDelToque = await giro(pagina);
  await esperar(600);
  const trasElToque = await giro(pagina);
  console.log(`A) tocar la tarjeta: ${alEmpezar}° -> ${aMitadDelToque}° (a los 120 ms) -> ${trasElToque}°`);
  if (alEmpezar !== 0) throw new Error(`A) no arranca de cara: ${alEmpezar}°`);
  if (!(aMitadDelToque > 15 && aMitadDelToque < 165)) {
    throw new Error(`A) el toque ya no anima, salta de golpe: ${aMitadDelToque}°`);
  }
  if (trasElToque < 170) throw new Error(`A) no acaba enseñando el dorso: ${trasElToque}°`);

  // --- B) EL FALLO: al pasar de tarjeta NO se puede ver el dorso de la nueva ---
  await pagina.getByRole("button", { name: "Bien", exact: true }).click();
  const muestras = [];
  for (let i = 0; i < 5; i++) { muestras.push(await giro(pagina)); await esperar(45); }
  const maximo = Math.max(...muestras);
  const texto = await textoTarjeta(pagina);
  console.log(`B) al pasar de tarjeta, giro en los primeros ~250 ms: ${muestras.join("°, ")}°`);
  console.log(`B) texto de la tarjeta: ${JSON.stringify(texto.replace(/\n/g, " / "))}`);
  if (maximo > 15) {
    throw new Error(`B) se ve el dorso de la tarjeta que viene: el giro llega a ${maximo}° al pasar (debería ser 0°)`);
  }
  if (!/Frente/.test(texto)) throw new Error("B) no se está enseñando el frente: " + texto);

  // --- C) y la de después sigue pudiendo girar al tocarla ---
  await pagina.locator(".flip-container").click();
  await esperar(120);
  const giroSiguiente = await giro(pagina);
  console.log(`C) la tarjeta siguiente también anima al tocarla: ${giroSiguiente}°`);
  if (!(giroSiguiente > 15 && giroSiguiente < 165)) {
    throw new Error(`C) la tarjeta nueva ya no anima: ${giroSiguiente}°`);
  }

  if (errores.length) throw new Error("errores JS: " + errores.join(" | "));
  await ctx.close();
  console.log("\nOK: al pasar de tarjeta el giro es instantáneo, y tocarla sigue animando");
} catch (e) { fallo = e; } finally { await navegador.close(); servidor.kill(); }

if (fallo) { console.error("\nFALLA:", fallo.message); process.exit(1); }
