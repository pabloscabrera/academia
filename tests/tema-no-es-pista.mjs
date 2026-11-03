// El `tema` de una pregunta no puede salir encima del enunciado: es una pista.
// NO la ejecuta `npm test` (que solo coge `tests/*.test.mjs`): necesita
// Playwright y un build hecho.
//
//   npm run build && node tests/tema-no-es-pista.mjs
//
// `etiquetaOrigen` se prueba sola en `logica.test.mjs`, pero quien la dibuja
// son `Simulacros`, `PreguntaCard` y compañía, que viven en `App.jsx` y ahí
// `npm test` no llega. Lo que hay que comprobar en un navegador es que el
// tema no se lea en pantalla en los dos sitios donde contestas sin saber la
// respuesta — la tirada y el Banco —, y que el curso SÍ se siga leyendo,
// porque eso es lo que se pidió conservar.
//
// Las dos preguntas de prueba llevan de tema su propia respuesta, igual que
// los casos reales de la captura ("BELLOCH · Trastorno de ansiedad social"
// sobre una pregunta que pregunta qué es el TAS).
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4486, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const TEMA_DELATOR = "Trastorno de ansiedad social";
const PREGUNTAS = Array.from({ length: 4 }, (_, i) => ({
  id: "q" + i,
  curso: "PIR 25",
  tema: TEMA_DELATOR,
  pregunta: `Enunciado número ${i}:`,
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
    // `preguntas*` también pilla `preguntas_progreso`: hay que mirar la tabla
    // exacta o se contesta con el banco a una consulta que no lo pedía.
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

// La etiqueta que se dibuja encima del enunciado: se busca por el ENUNCIADO
// y se sube a su tarjeta, en vez de fiarse de una captura o de un selector
// de posición.
// La etiqueta que se dibuja encima del enunciado: se busca por el ENUNCIADO
// (el que haya salido — el pool se baraja) y se sube a su tarjeta, en vez de
// fiarse de una captura o de un selector de posición.
const leerEtiqueta = (pagina) => pagina.evaluate(`(() => {
  const nodos = [...document.querySelectorAll("div, p, span")]
    .filter((e) => /^Enunciado número \\d+:$/.test((e.textContent || "").trim()));
  const enun = nodos[nodos.length - 1];
  if (!enun) return null;
  // La etiqueta es el último bloque de texto que hay ANTES del enunciado
  // dentro de la misma tarjeta.
  let nodo = enun, antes = null;
  while (nodo && !antes) {
    for (let p = nodo.previousElementSibling; p; p = p.previousElementSibling) {
      const t = (p.innerText || "").trim();
      if (t) { antes = t; break; }
    }
    nodo = nodo.parentElement;
  }
  return antes;
})()`);

const textoVisible = (pagina) => pagina.evaluate("document.body.innerText");

try {
  const { ctx, pagina, errores } = await abrir();

  // --- A) La tarjeta de la tirada: lo de la captura ---
  await pagina.locator('input[type="number"]').first().fill("4");
  await pagina.locator('input[type="number"]').first().blur();
  await esperar(300);
  await pagina.getByRole("button", { name: /Empezar autoevaluación/ }).click();
  await esperar(800);

  const etiqueta = await leerEtiqueta(pagina);
  console.log("A) etiqueta encima del enunciado ->", JSON.stringify(etiqueta));
  if (etiqueta === null) throw new Error("A) no encuentro la tarjeta de la pregunta");
  if (etiqueta.includes(TEMA_DELATOR)) {
    throw new Error(`A) el tema sigue saliendo encima del enunciado: ${JSON.stringify(etiqueta)}`);
  }
  if (!etiqueta.includes("PIR 25")) {
    throw new Error(`A) se ha perdido el curso, que SÍ tenía que quedarse: ${JSON.stringify(etiqueta)}`);
  }

  // Y no está escondido en otro rincón de la pantalla de la tirada.
  const enPantalla = await textoVisible(pagina);
  if (enPantalla.includes(TEMA_DELATOR)) {
    throw new Error("A) el tema se lee en algún sitio de la pantalla de la tirada");
  }

  // --- B) El repaso posterior, cuando la respuesta ya está a la vista ---
  for (let i = 0; i < 4; i += 1) {
    await pagina.getByRole("button", { name: /Correcta/ }).first().click();
    await esperar(300);
    await pagina.getByRole("button", { name: /^Siguiente$|^Terminar$/ }).first().click();
    await esperar(400);
  }
  const trasTerminar = await textoVisible(pagina);
  console.log("B) ¿sale el tema al terminar? ->", trasTerminar.includes(TEMA_DELATOR));
  if (trasTerminar.includes(TEMA_DELATOR)) {
    throw new Error("B) el tema sale en la pantalla de resultados");
  }

  // --- C) El Banco, donde la correcta está escondida tras un botón ---
  await pagina.getByRole("button", { name: /Banco de preguntas/i }).first().click();
  await esperar(1200);
  const enBanco = await textoVisible(pagina);
  const etiquetaBanco = await leerEtiqueta(pagina);
  console.log("C) etiqueta en el Banco ->", JSON.stringify(etiquetaBanco));
  if (!enBanco.includes("PIR 25")) throw new Error("C) no se ve el curso en el Banco");
  if (enBanco.includes(TEMA_DELATOR)) {
    throw new Error("C) el tema sigue saliendo en las tarjetas del Banco");
  }

  if (errores.length) throw new Error("errores JS: " + errores.join(" | "));
  await ctx.close();
  console.log("\nOK: el curso se ve, el tema no — ni en la tirada, ni al terminar, ni en el Banco");
} catch (e) {
  fallo = e;
} finally {
  await navegador.close();
  servidor.kill();
}

if (fallo) { console.error("\nFALLA:", fallo.message); process.exit(1); }
