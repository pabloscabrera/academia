// El teclado califica una flashcard: 1 Otra vez, 2 Difícil, 3 Bien, 4 Fácil,
// con una animación de pulsado para saber que no te has equivocado de tecla.
// NO la ejecuta `npm test` (que solo coge `tests/*.test.mjs`): necesita
// Playwright y un build hecho.
//
//   npm run build && node tests/teclado-flashcards.mjs
//
// `calificacionDeTecla` se prueba sola en `logica.test.mjs`, así que lo que
// hace falta comprobar en un navegador es otra cosa: que la tecla llegue de
// verdad a `calificar` y CON QUÉ calidad (se mira el cuerpo de la petición a
// `flashcards_repasos`, no lo que se lea en pantalla), que la animación se
// vea de verdad antes de que la tarjeta cambie —que es lo que se pidió—, que
// un número sin revelar no califique, y que escribir en el formulario de
// corrección siga escribiendo.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4493, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
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

// Lo que de verdad demuestra qué calificación se registró.
const calidades = [];

const numeroDeTarjeta = (pagina) => pagina.evaluate(`(() => {
  const m = document.body.innerText.match(/Tarjeta (\\d+) de (\\d+)/);
  return m ? Number(m[1]) : null;
})()`);

// El botón que lleva la clase de la animación, por su texto.
const botonPulsado = (pagina) => pagina.evaluate(`(() => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.className || "").includes("tecla-pulsada"));
  return b ? b.textContent.trim() : null;
})()`);

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
  // El comodín va PRIMERO: en Playwright gana la ruta registrada después.
  await pagina.route(`**${SB}/rest/**`, (r) => json(r, []));
  await pagina.route(`**${SB}/rest/v1/flashcards?**`, (r) => json(r, tarjetas));
  await pagina.route(`**${SB}/rest/v1/flashcards_progreso?**`, (r) => {
    if (r.request().method() === "GET") return json(r, progreso);
    let c = []; try { c = JSON.parse(r.request().postData() || "[]"); } catch {}
    return json(r, Array.isArray(c) ? c : [c]);
  });
  await pagina.route(`**${SB}/rest/v1/flashcards_repasos?**`, (r) => {
    if (r.request().method() !== "GET") {
      let c = []; try { c = JSON.parse(r.request().postData() || "[]"); } catch {}
      for (const f of (Array.isArray(c) ? c : [c])) calidades.push(f.calidad);
    }
    return json(r, []);
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

  // --- A) un número SIN revelar no califica ---
  const antes = await numeroDeTarjeta(pagina);
  await pagina.keyboard.press("3");
  await esperar(500);
  const trasNumeroEnVacio = await numeroDeTarjeta(pagina);
  console.log(`A) "3" sin revelar: tarjeta ${antes} -> ${trasNumeroEnVacio}, repasos enviados ${calidades.length}`);
  if (antes !== 1 || trasNumeroEnVacio !== 1) throw new Error(`A) calificó sin revelar: ${antes} -> ${trasNumeroEnVacio}`);
  if (calidades.length !== 0) throw new Error("A) se registró un repaso sin haber visto el dorso: " + calidades.join(","));

  // --- B) la animación se VE antes de que la tarjeta cambie (lo que se pidió) ---
  await pagina.locator(".flip-container").click();
  await esperar(600);
  await pagina.keyboard.down("3");
  await esperar(40);
  const pulsado = await botonPulsado(pagina);
  await pagina.keyboard.up("3");
  console.log(`B) botón con la animación de pulsado -> ${JSON.stringify(pulsado)}`);
  if (pulsado !== "Bien") throw new Error(`B) la animación no marcó "Bien", marcó ${JSON.stringify(pulsado)}`);

  // --- C) y después califica de verdad, con la calidad de ESE botón ---
  await esperar(700);
  const trasBien = await numeroDeTarjeta(pagina);
  console.log(`C) tras "3": tarjeta ${trasBien}, calidades ${JSON.stringify(calidades)}`);
  if (trasBien !== 2) throw new Error(`C) no pasó de tarjeta: ${trasBien}`);
  if (calidades.length !== 1 || calidades[0] !== 4) throw new Error("C) 'Bien' no mandó calidad 4: " + JSON.stringify(calidades));

  // --- D) "1" es Otra vez (calidad 0) y "4" es Fácil (calidad 5) ---
  await pagina.locator(".flip-container").click();
  await esperar(600);
  await pagina.keyboard.press("1");
  await esperar(700);
  await pagina.locator(".flip-container").click();
  await esperar(600);
  await pagina.keyboard.press("4");
  await esperar(700);
  console.log(`D) calidades acumuladas -> ${JSON.stringify(calidades)}`);
  if (calidades.length !== 3) throw new Error("D) no se registraron las tres: " + JSON.stringify(calidades));
  if (calidades[1] !== 0) throw new Error('D) "1" no fue Otra vez (0): ' + calidades[1]);
  if (calidades[2] !== 5) throw new Error('D) "4" no fue Fácil (5): ' + calidades[2]);

  // --- E) escribir en el formulario de corrección sigue escribiendo ---
  await pagina.locator(".flip-container").click();
  await esperar(600);
  await pagina.getByRole("button", { name: /Corregir esta tarjeta/i }).click();
  await esperar(500);
  const campo = pagina.locator("textarea, input[type='text']").first();
  await campo.click();
  await campo.fill("");
  await campo.type("13");
  await esperar(300);
  const escrito = await campo.inputValue();
  const repasosTrasEscribir = calidades.length;
  console.log(`E) escrito en el campo: ${JSON.stringify(escrito)}, repasos ${repasosTrasEscribir}`);
  if (escrito !== "13") throw new Error(`E) el campo no recibió lo tecleado: ${JSON.stringify(escrito)}`);
  if (repasosTrasEscribir !== 3) throw new Error("E) teclear en el campo calificó la tarjeta: " + JSON.stringify(calidades));

  if (errores.length) throw new Error("errores JS: " + errores.join(" | "));
  await ctx.close();
  console.log("\nOK: 1-4 califican, la animación se ve antes de pasar, y los campos siguen siendo campos");
} catch (e) { fallo = e; } finally { await navegador.close(); servidor.kill(); }

if (fallo) { console.error("\nFALLA:", fallo.message); process.exit(1); }
