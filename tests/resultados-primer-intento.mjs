// Resultados de una autoevaluación en el diseño nuevo. Lo que se comprueba es
// lo que se decidió: la nota y el color salen del PRIMER intento, y una
// pregunta fallada sigue marcada en rojo aunque luego se acierte en la repetición.
//
//   npm run build && node tests/resultados-primer-intento.mjs
//
// Banco falso de 4 preguntas (la correcta es siempre la A). Se falla la 2 a la
// primera, se acierta en la repetición y se espera 3 de 4 = 75%.

import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4403;
const URL_SUPABASE = "slwifwjwtipoqtkhbhbr.supabase.co";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const PREGUNTAS = [1, 2, 3, 4].map((n) => ({
  id: `PIR 25-${n}`, curso: "PIR 25", tema: `Pregunta ${n}`,
  pregunta: `Enunciado PIR 25 #${n}`,
  opciones: ["Opción A", "Opción B", "Opción C", "Opción D"],
  correcta: 0, explicacion: null, inventada: false,
  created_at: "2026-01-01T00:00:00+00:00", actualizado_en: "2026-10-01T10:00:00+00:00",
}));

const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
await esperar(4000);

let fallo = null;
const ejecutable = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const navegador = await chromium.launch(ejecutable ? { executablePath: ejecutable } : {});
try {
  const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await contexto.addInitScript(() => {
    sessionStorage.setItem("pir-pruebas-sin-portada", "1");
    localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
      access_token: "x", refresh_token: "y", expires_at: 9999999999,
      user: { id: "u1", email: "prueba@ruta-pir.local", user_metadata: { username: "prueba" } },
    }));
  });
  await contexto.route(`**${URL_SUPABASE}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await contexto.route(`**${URL_SUPABASE}/rest/**`, (ruta) => {
    const url = ruta.request().url();
    const tabla = (url.split("/rest/v1/")[1] || "").split("?")[0];
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

  await pagina.getByRole("button", { name: "Empezar", exact: true }).click();
  await pagina.getByText(/Pregunta 1 de 4/i).waitFor({ timeout: 10000 });

  // Ronda 1: la 2 se contesta mal (B); el resto bien (A). Ronda 2: la repetición, bien.
  const visto = new Set();
  let terminado = false;
  for (let paso = 0; paso < 12 && !terminado; paso++) {
    if (await pagina.getByRole("button", { name: "Volver a Exámenes" }).count()) { terminado = true; break; }
    const t = await pagina.locator("body").innerText();
    const m = t.match(/Enunciado PIR 25 #(\d)/);
    if (!m) throw new Error(`no encuentro el enunciado en el paso ${paso + 1}:\n${t.slice(0, 400)}`);
    const n = m[1];
    const primera = !visto.has(n);
    visto.add(n);
    const opcion = n === "2" && primera ? "Opción B" : "Opción A";
    // El nombre accesible del botón de opción lleva también la letra ("A Opción A"),
    // así que se busca por el texto que contiene.
    await pagina.locator("button", { hasText: opcion }).first().click();
    const ultima = (await pagina.locator("button", { hasText: "Terminar" }).count()) > 0;
    await pagina.locator("button", { hasText: ultima ? "Terminar" : "Siguiente" }).first().click();
  }
  if (!terminado) {
    await pagina.getByRole("button", { name: "Volver a Exámenes" }).waitFor({ timeout: 8000 }).catch(() => {});
  }

  const pantalla = await pagina.locator("body").innerText();
  if (!/75%/.test(pantalla)) throw new Error("la nota debería salir por el primer intento (3 de 4 = 75%). Pantalla:\n" + pantalla.slice(0, 500));
  if (!/3 de 4 a la primera/i.test(pantalla)) throw new Error("falta el texto '3 de 4 a la primera'");

  // Las casillas siguen el orden de la tirada, que es aleatorio: no se puede
  // suponer que la casilla 2 sea la pregunta #2. Se busca la fallada (debe ser
  // una sola) y se comprueba que al abrirla es la pregunta #2 y la B.
  const falladas = pagina.getByRole("button", { name: /fallada a la primera/ });
  if ((await falladas.count()) !== 1) throw new Error(`debería haber 1 casilla fallada a la primera y hay ${await falladas.count()}`);
  await falladas.click();
  const tras = await pagina.locator("body").innerText();
  if (!/Enunciado PIR 25 #2/.test(tras)) throw new Error("la casilla fallada debería ser la pregunta #2. Pantalla:\n" + tras.slice(0, 600));
  if (!/Contestaste la B/.test(tras)) throw new Error("al abrir la fallada debería decir 'Contestaste la B'");

  // Las demás, acertadas a la primera.
  if ((await pagina.getByRole("button", { name: /acertada a la primera/ }).count()) !== 3) {
    throw new Error("deberían ser 3 casillas acertadas a la primera");
  }

  await pagina.getByRole("button", { name: "Volver a Exámenes" }).click();
  await pagina.getByRole("button", { name: "Empezar", exact: true }).waitFor({ timeout: 8000 });

  if (errores.length) throw new Error("errores en el navegador:\n" + errores.join("\n"));
  console.log("OK: la nota y el color salen del primer intento; la repetición no lo borra.");
} catch (err) {
  fallo = err;
} finally {
  await navegador.close();
  servidor.kill();
}

if (fallo) { console.error("FALLO:", fallo.message); process.exit(1); }
