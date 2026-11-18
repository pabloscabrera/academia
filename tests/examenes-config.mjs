// Elegir examen (diseño nuevo): varios exámenes a la vez, recuentos por fila,
// reparto de la cantidad entre los elegidos y que el examen no elegido no entre.
//
//   npm run build && node tests/examenes-config.mjs
//
// Como humo.mjs, no lo coge `npm test`: necesita Playwright y un build hecho.
// Sirve un banco falso de 12 preguntas en las que cada enunciado lleva su
// examen ("Enunciado PIR 25 #3"), así que la prueba cuenta de qué examen sale
// cada pregunta mirando la pantalla, no el código.

import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4402;
const URL_SUPABASE = "slwifwjwtipoqtkhbhbr.supabase.co";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function bancoFalso() {
  const filas = [];
  const añadir = (curso, n) => {
    for (let i = 1; i <= n; i++) {
      filas.push({
        id: `${curso}-${i}`, curso, tema: `Pregunta ${i}`,
        pregunta: `Enunciado ${curso} #${i}`,
        opciones: ["Opción A", "Opción B", "Opción C", "Opción D"],
        correcta: 0, explicacion: null, inventada: false,
        created_at: "2026-01-01T00:00:00+00:00", actualizado_en: "2026-10-01T10:00:00+00:00",
      });
    }
  };
  añadir("PIR 25", 6);
  añadir("PIR 24", 4);
  añadir("DSM-5-TR", 2);
  return filas;
}

const PREGUNTAS = bancoFalso();
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
await esperar(4000);

let fallo = null;
const ejecutable = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const navegador = await chromium.launch(ejecutable ? { executablePath: ejecutable } : {});
try {
  const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await contexto.addInitScript(() => {
    localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
      access_token: "x", refresh_token: "y", expires_at: 9999999999,
      user: { id: "u1", email: "prueba@ruta-pir.local", user_metadata: { username: "prueba" } },
    }));
  });
  await contexto.route(`**${URL_SUPABASE}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await contexto.route(`**${URL_SUPABASE}/rest/**`, (ruta) => {
    const tabla = (ruta.request().url().split("/rest/v1/")[1] || "").split("?")[0];
    const url = ruta.request().url();
    if (tabla !== "preguntas") return ruta.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (ruta.request().method() === "HEAD" || /\bselect=id\b/.test(url)) {
      return ruta.fulfill({ status: 200, contentType: "application/json",
        headers: { "content-range": `0-0/${PREGUNTAS.length}` }, body: "" });
    }
    if (/select=actualizado_en/.test(url)) {
      return ruta.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify([{ actualizado_en: "2026-10-01T10:00:00+00:00" }]) });
    }
    return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PREGUNTAS) });
  });

  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(e.message));
  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await pagina.getByText("Elige", { exact: false }).first().waitFor({ timeout: 20000 });

  const fila = (curso) => pagina.locator("button[aria-pressed]").filter({ hasText: curso }).first();
  // innerText devuelve el texto ya transformado por CSS ("10 DISPONIBLES"), así
  // que la comparación va en minúsculas para no depender del estilo.
  const pie = async () => (await pagina.locator("body").innerText()).toLowerCase();

  // 1) Recuentos por examen en la fila.
  const txt25 = await fila("PIR 25").innerText();
  const txt24 = await fila("PIR 24").innerText();
  const txtDsm = await fila("DSM-5-TR").innerText();
  if (!/PIR 25\s*6/.test(txt25)) throw new Error(`PIR 25 debería mostrar 6, sale: ${JSON.stringify(txt25)}`);
  if (!/PIR 24\s*4/.test(txt24)) throw new Error(`PIR 24 debería mostrar 4, sale: ${JSON.stringify(txt24)}`);
  if (!/DSM-5-TR\s*2/.test(txtDsm)) throw new Error(`DSM-5-TR debería mostrar 2, sale: ${JSON.stringify(txtDsm)}`);

  // 2) Varios exámenes a la vez, y tocar otra vez lo deselecciona.
  await fila("PIR 25").click();
  await fila("PIR 24").click();
  if ((await fila("PIR 24").getAttribute("aria-pressed")) !== "true") throw new Error("PIR 24 no quedó elegido");
  if (!(await pie()).includes("10 disponibles")) throw new Error("con 6+4 deberían salir 10 disponibles. Pantalla:\n" + (await pie()).slice(0, 900));
  if (!(await pie()).includes("2 exámenes")) throw new Error("debería decir 2 exámenes elegidos");
  await fila("PIR 24").click();
  if ((await fila("PIR 24").getAttribute("aria-pressed")) !== "false") throw new Error("volver a tocar no deselecciona");
  if (!(await pie()).includes("6 disponibles")) throw new Error("tras deseleccionar debería quedar 6");
  await fila("PIR 24").click();

  // 3) Falladas sin ninguna fallada: no se puede empezar y se dice por qué.
  await pagina.getByRole("button", { name: "Falladas" }).click();
  if (!(await pie()).includes("no queda ninguna pregunta")) throw new Error("con 0 falladas debería avisar");
  const empezar = pagina.getByRole("button", { name: "Empezar" });
  if (!(await empezar.isDisabled())) throw new Error("Empezar debería estar desactivado sin preguntas");

  await pagina.getByRole("button", { name: "Todas" }).click();

  // 4) Una tirada de 10 entre 6+4: sale de los dos, y el DSM no entra.
  await pagina.getByRole("button", { name: "Empezar" }).click();
  await esperar(1500);
  const tras = await pagina.locator("body").innerText();
  if (!/Pregunta 1 de 10/i.test(tras)) throw new Error("tras Empezar no sale 'Pregunta 1 de 10'. Pantalla:\n" + tras.slice(0, 700));
  const contadas = { "PIR 25": 0, "PIR 24": 0, "DSM-5-TR": 0 };
  for (let paso = 0; paso < 10; paso++) {
    const t = await pagina.locator("body").innerText();
    const m = t.match(/Enunciado (PIR 25|PIR 24|DSM-5-TR) #\d+/);
    if (!m) throw new Error(`en el paso ${paso + 1} no se encuentra el enunciado:\n${t.slice(0, 400)}`);
    contadas[m[1]] += 1;
    await pagina.getByRole("button", { name: "Opción A" }).click();
    const siguiente = pagina.getByRole("button", { name: paso === 9 ? "Terminar" : "Siguiente" });
    await siguiente.click();
  }
  if (contadas["DSM-5-TR"] !== 0) throw new Error(`el DSM no estaba elegido y salió ${contadas["DSM-5-TR"]} veces`);
  if (contadas["PIR 25"] !== 6 || contadas["PIR 24"] !== 4) {
    throw new Error(`reparto 6+4 esperado y salió ${JSON.stringify(contadas)}`);
  }

  if (errores.length) throw new Error("errores en el navegador:\n" + errores.join("\n"));
  console.log(`OK: recuentos, selección múltiple y reparto correctos (${JSON.stringify(contadas)}).`);
} catch (err) {
  fallo = err;
} finally {
  await navegador.close();
  servidor.kill();
}

if (fallo) { console.error("FALLO:", fallo.message); process.exit(1); }
