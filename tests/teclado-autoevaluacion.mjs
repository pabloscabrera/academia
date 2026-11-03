// El teclado durante una autoevaluación: 1/2/3/4 eligen opción, Intro pasa.
// NO la ejecuta `npm test` (que solo coge `tests/*.test.mjs`): necesita
// Playwright y un build hecho.
//
//   npm run build && node tests/teclado-autoevaluacion.mjs
//
// `accionDeTecla` se prueba sola en `logica.test.mjs`, así que lo que hace
// falta comprobar en un navegador es otra cosa: que esté ENCHUFADA — que la
// tecla llegue a `elegir`/`next` de verdad, que Intro no se cuele antes de
// contestar (que es lo que se pidió), que un Intro con el foco en el botón
// no pase DOS preguntas de golpe, y que escribir en un campo siga
// escribiendo en vez de contestar.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4491, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

// La correcta SIEMPRE es la A (índice 0), así que el test decide a voluntad
// si acierta (tecla "1") o falla (tecla "3").
const PREGUNTAS = Array.from({ length: 5 }, (_, i) => ({
  id: "q" + i,
  curso: "PIR 25",
  tema: "T" + i,
  pregunta: `Enunciado ${i}:`,
  opciones: ["Correcta", "Mala 1", "Mala 2", "Mala 3"],
  correcta: 0,
  explicacion: null,
  inventada: false,
  created_at: "2026-01-01T00:00:00Z",
}));

let fallo = null;
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });

async function abrir() {
  const ctx = await navegador.newContext({ viewport: { width: 1024, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
      access_token: "x", refresh_token: "y", expires_at: 9999999999,
      user: { id: "u1", email: "prueba@ruta-pir.local", user_metadata: { username: "prueba" } },
    }));
  });
  // El comodín va PRIMERO: en Playwright gana la ruta registrada después.
  await ctx.route(`**${SB}/rest/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route(`**${SB}/rest/v1/preguntas*`, (r) => {
    const url = r.request().url();
    const tabla = (url.split("/rest/v1/")[1] || "").split("?")[0];
    if (tabla !== "preguntas") return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (r.request().method() === "HEAD" || /\bselect=id\b/.test(url)) {
      return r.fulfill({ status: 200, contentType: "application/json",
        headers: { "content-range": `0-0/${PREGUNTAS.length}` }, body: "" });
    }
    if (/select=actualizado_en/.test(url)) {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ actualizado_en: null }]) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PREGUNTAS) });
  });
  const pagina = await ctx.newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(e.message));
  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await esperar(5000);
  return { ctx, pagina, errores };
}

// "Pregunta N de M" — el número de pregunta, que es lo que dice si Intro ha
// pasado o no.
const numeroDePregunta = (pagina) => pagina.evaluate(`(() => {
  const m = document.body.innerText.match(/Pregunta (\\d+) de (\\d+)/);
  return m ? Number(m[1]) : null;
})()`);

// ¿Está revelada? Lo canta el pie de la respuesta.
const revelada = (pagina) => pagina.evaluate(`/¡Correcto!|Incorrecto\\./.test(document.body.innerText)`);

try {
  const { ctx, pagina, errores } = await abrir();
  await pagina.locator('input[type="number"]').first().fill("5");
  await pagina.locator('input[type="number"]').first().blur();
  await esperar(300);
  await pagina.getByRole("button", { name: /Empezar autoevaluación/ }).click();
  await esperar(800);

  // --- A) Intro ANTES de contestar no hace nada (lo que se pidió) ---
  const antes = await numeroDePregunta(pagina);
  await pagina.keyboard.press("Enter");
  await esperar(400);
  const trasIntroEnVacio = await numeroDePregunta(pagina);
  console.log(`A) Intro sin contestar: pregunta ${antes} -> ${trasIntroEnVacio}`);
  if (antes !== 1 || trasIntroEnVacio !== 1) {
    throw new Error(`A) Intro se saltó una pregunta sin contestar: ${antes} -> ${trasIntroEnVacio}`);
  }
  if (await revelada(pagina)) throw new Error("A) Intro reveló la pregunta sin elegir nada");

  // --- B) "1" elige la A, que aquí es la correcta ---
  await pagina.keyboard.press("1");
  await esperar(400);
  const texto1 = await pagina.evaluate("document.body.innerText");
  console.log(`B) tras pulsar "1": ${/¡Correcto!/.test(texto1) ? "¡Correcto!" : "(no revelada)"}`);
  if (!/¡Correcto!/.test(texto1)) throw new Error('B) la tecla "1" no eligió la opción A');

  // --- C) ya revelada, otro número NO cambia la respuesta ---
  await pagina.keyboard.press("3");
  await esperar(300);
  const texto3 = await pagina.evaluate("document.body.innerText");
  if (/Incorrecto\./.test(texto3)) throw new Error('C) la tecla "3" cambió una respuesta ya dada');
  console.log("C) con la pregunta revelada, un número más no cambia nada: bien");

  // --- D) ahora SÍ: Intro pasa de pregunta ---
  await pagina.keyboard.press("Enter");
  await esperar(500);
  const tras = await numeroDePregunta(pagina);
  console.log(`D) Intro tras contestar -> pregunta ${tras}`);
  if (tras !== 2) throw new Error(`D) Intro no pasó de pregunta: ${tras}`);

  // --- E) "3" elige la C, que aquí es una mala ---
  await pagina.keyboard.press("3");
  await esperar(400);
  if (!/Incorrecto\./.test(await pagina.evaluate("document.body.innerText"))) {
    throw new Error('E) la tecla "3" no eligió la opción C');
  }
  console.log('E) la tecla "3" elige la C: bien');

  // --- F) con el foco en el botón, un Intro pasa UNA pregunta, no dos ---
  await pagina.getByRole("button", { name: /^Siguiente$|^Terminar$/ }).first().focus();
  const antesF = await numeroDePregunta(pagina);
  await pagina.keyboard.press("Enter");
  await esperar(600);
  const trasF = await numeroDePregunta(pagina);
  console.log(`F) Intro con el foco en el botón: ${antesF} -> ${trasF}`);
  if (trasF !== antesF + 1) {
    throw new Error(`F) el Intro con foco en el botón saltó ${trasF - antesF} preguntas, no 1`);
  }

  // --- G) escribir en un campo sigue escribiendo, no contesta ---
  // El Banco se abre ENCIMA de la tirada (`pantallaCompleta`), así que el
  // oyente del teclado sigue vivo: escribir "14" en su buscador es el caso
  // real de la guarda, no uno inventado.
  await pagina.getByRole("button", { name: /Banco de preguntas/i }).first().click();
  await esperar(1200);
  const buscador = pagina.getByPlaceholder(/Busca una palabra/i).first();
  await buscador.click();
  await buscador.type("14");
  await esperar(300);
  const escrito = await buscador.inputValue();
  console.log(`G) escrito en el buscador: ${JSON.stringify(escrito)}`);
  if (escrito !== "14") throw new Error(`G) el campo no recibió lo tecleado: ${JSON.stringify(escrito)}`);

  if (errores.length) throw new Error("errores JS: " + errores.join(" | "));
  await ctx.close();
  console.log("\nOK: 1-4 eligen, Intro solo pasa con la pregunta contestada, y los campos siguen siendo campos");
} catch (e) {
  fallo = e;
} finally {
  await navegador.close();
  servidor.kill();
}

if (fallo) { console.error("\nFALLA:", fallo.message); process.exit(1); }
