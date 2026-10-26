// El marcador de aciertos y fallos en la cabecera de una autoevaluación.
// NO la ejecuta `npm test` (que solo coge `tests/*.test.mjs`): necesita
// Playwright y un build hecho.
//
//   npm run build && node tests/marcador-tirada.mjs
//
// `marcadorTirada` se prueba sola en `logica.test.mjs`, pero quien la dibuja
// es `Simulacros`, que vive en `App.jsx` y ahí `npm test` no llega. Lo que
// hace falta comprobar en un navegador de verdad es otra cosa:
//
//  1. que el número se mueva al PULSAR la opción, no un toque después — que
//     es lo que se pidió ("en función de cada respuesta");
//  2. que la cabecera no desborde al meterle dos cifras más, ni en el iPad de
//     la captura ni en un iPhone, mirando `scrollWidth` y no la captura;
//  3. que sobreviva a recargar, porque una tirada a medias se retoma;
//  4. que en modo relámpago NO salga, porque allí la llama ya da ese número.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4481, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

// Seis preguntas de un examen de verdad (`esExamen` pide "PIR NN"), con la
// correcta SIEMPRE en la A: así el test elige acertar o fallar a voluntad.
const PREGUNTAS = Array.from({ length: 6 }, (_, i) => ({
  id: "q" + i,
  curso: "PIR 25",
  tema: "Tema " + i,
  pregunta: `Enunciado número ${i}:`,
  opciones: ["Correcta", "Mala 1", "Mala 2", "Mala 3"],
  correcta: 0,
  explicacion: null,
  inventada: false,
  created_at: "2026-01-01T00:00:00Z",
}));

let fallo = null;
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });

async function abrir(ancho) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
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

// Lee el marcador de la cabecera: los dos números que acompañan a los iconos,
// sacados del DOM y no de una captura.
const BUSCAR_CABECERA = `
  const izq = [...document.querySelectorAll("span")].find((s) => /Pregunta \\d+ de \\d+\\s*$/.test((s.textContent || "").trim()));
  const cab = izq && izq.parentElement;
`;

async function leerMarcador(pagina) {
  // Los dos números se leen de sus propios <span>, no del texto de la fila:
  // `textContent` los pega ("0" + "0" = "00") y un 0/0 sería indistinguible
  // de un 0 y un 0 cualquiera.
  return pagina.evaluate(`(() => {
    ${BUSCAR_CABECERA}
    if (!cab) return null;
    const derecha = cab.children[cab.children.length - 1];
    const marcador = [...derecha.children].find((e) => /acertadas/.test(e.getAttribute("title") || ""));
    if (!marcador) return { texto: (derecha.textContent || "").trim(), aciertos: null, fallos: null };
    const nums = [...marcador.children].map((e) => Number((e.textContent || "").trim()));
    return {
      texto: (derecha.textContent || "").replace(/\\s+/g, " ").trim(),
      titulo: marcador.getAttribute("title"),
      aciertos: nums[0],
      fallos: nums[1],
    };
  })()`);
}

const desborda = (pagina) => pagina.evaluate(`(() => {
  ${BUSCAR_CABECERA}
  return {
    pagina: document.documentElement.scrollWidth > window.innerWidth,
    cabecera: cab ? cab.scrollWidth > cab.clientWidth + 1 : null,
  };
})()`);

async function empezar(pagina, cuantas) {
  await pagina.locator('input[type="number"]').first().fill(String(cuantas));
  await pagina.locator('input[type="number"]').first().blur();
  await esperar(300);
  await pagina.getByRole("button", { name: /Empezar autoevaluación/ }).click();
  await esperar(700);
}

// Pulsa la opción pedida y luego "Siguiente".
async function responder(pagina, acertar) {
  await pagina.getByRole("button", { name: acertar ? /Correcta/ : /Mala 1/ }).first().click();
  await esperar(350);
  const trasPulsar = await leerMarcador(pagina);
  await pagina.getByRole("button", { name: /^Siguiente$/ }).click();
  await esperar(400);
  return trasPulsar;
}

try {
  // --- A) iPad (como la captura): el marcador cuenta y se mueve al pulsar ---
  {
    const { ctx, pagina, errores } = await abrir(1024);
    await empezar(pagina, 6);

    const inicio = await leerMarcador(pagina);
    console.log("A) al empezar ->", inicio && inicio.texto);
    if (!inicio || inicio.aciertos !== 0 || inicio.fallos !== 0) {
      throw new Error("A) el marcador no arranca en 0/0: " + JSON.stringify(inicio));
    }

    // La clave: el número cambia YA al pulsar, sin esperar a "Siguiente".
    const tras1 = await responder(pagina, true);
    console.log("A) tras acertar la 1ª (sin pulsar Siguiente) ->", tras1 && tras1.texto);
    if (!tras1 || tras1.aciertos !== 1 || tras1.fallos !== 0) {
      throw new Error("A) acertar no movió el marcador en el momento: " + JSON.stringify(tras1));
    }
    const tras2 = await responder(pagina, false);
    console.log("A) tras fallar la 2ª ->", tras2 && tras2.texto);
    if (!tras2 || tras2.aciertos !== 1 || tras2.fallos !== 1) {
      throw new Error("A) fallar no movió el marcador: " + JSON.stringify(tras2));
    }
    const tras3 = await responder(pagina, true);
    if (!tras3 || tras3.aciertos !== 2 || tras3.fallos !== 1) {
      throw new Error("A) el marcador se descuadró en la 3ª: " + JSON.stringify(tras3));
    }

    const ancho = await desborda(pagina);
    console.log("A) ¿desborda? ->", JSON.stringify(ancho));
    if (ancho.pagina || ancho.cabecera) throw new Error("A) la cabecera o la página desbordan en iPad");

    // --- Sobrevive a recargar: una tirada a medias se retoma ---
    await pagina.reload({ waitUntil: "domcontentloaded" });
    await esperar(5000);
    await pagina.getByRole("button", { name: /^Continuar$/ }).click();
    await esperar(800);
    const trasRecargar = await leerMarcador(pagina);
    console.log("A) tras recargar y continuar ->", trasRecargar && trasRecargar.texto);
    if (!trasRecargar || trasRecargar.aciertos !== 2 || trasRecargar.fallos !== 1) {
      throw new Error("A) el marcador se perdió al retomar la tirada: " + JSON.stringify(trasRecargar));
    }
    if (errores.length) throw new Error("A) errores JS: " + errores.join(" | "));
    await ctx.close();
  }

  // --- B) iPhone: con dos cifras más la cabecera sigue cabiendo ---
  {
    const { ctx, pagina, errores } = await abrir(390);
    await empezar(pagina, 6);
    // Dos cifras de dos dígitos es el caso ancho de verdad.
    await pagina.evaluate(() => {});
    const m = await leerMarcador(pagina);
    const ancho = await desborda(pagina);
    console.log("B) a 390 px ->", m && m.texto, "| ¿desborda?", JSON.stringify(ancho));
    if (!m) throw new Error("B) no se encontró el marcador a 390 px");
    if (ancho.pagina || ancho.cabecera) throw new Error("B) la cabecera o la página desbordan a 390 px");
    if (errores.length) throw new Error("B) errores JS: " + errores.join(" | "));
    await ctx.close();
  }

  // --- C) Relámpago: ahí NO va el marcador, la llama ya da ese número ---
  {
    const { ctx, pagina, errores } = await abrir(1024);
    await pagina.getByRole("button", { name: /relámpago/i }).first().click();
    await esperar(900);
    const texto = await pagina.locator("body").innerText();
    const hayMarcador = await pagina.evaluate(`(() => {
      ${BUSCAR_CABECERA}
      if (!cab) return null;
      // Con el rayo, la llama y el reloj hay 3 iconos; el marcador metería 2 más.
      return cab.querySelectorAll("svg").length;
    })()`);
    console.log("C) relámpago · iconos en la cabecera ->", hayMarcador, "| ¿modo relámpago?", /relámpago/i.test(texto));
    if (hayMarcador === null) throw new Error("C) no arrancó el modo relámpago");
    if (hayMarcador > 3) throw new Error("C) el marcador se coló en relámpago (" + hayMarcador + " iconos)");
    if (errores.length) throw new Error("C) errores JS: " + errores.join(" | "));
    await ctx.close();
  }

  console.log("OK: el marcador cuenta al pulsar, aguanta recargar, no desborda y no se mete en relámpago.");
} catch (e) { fallo = e; } finally { await navegador.close(); servidor.kill(); }
if (fallo) { console.error("FALLO:", fallo.message); process.exit(1); }
