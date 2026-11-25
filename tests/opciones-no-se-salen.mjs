// Las filas de opciones no pueden sobresalir de su tarjeta. NO la ejecuta
// `npm test`:
//
//   npm run build && node tests/opciones-no-se-salen.mjs
//
// El fallo, de una captura del iPad: en el Banco, al abrir una pregunta, las
// cuatro filas de respuesta se salían por la derecha de la tarjeta. La causa
// es `styles.opcion`: `width: 100%` más relleno y borde SIN `box-sizing:
// border-box` (el proyecto no tiene uno global), así que cada fila medía 30 px
// más que el hueco que le tocaba. Es el mismo fallo que ya tuvieron las filas
// de mazos, y no se ve venir porque el documento no ensancha: el tarjetón
// recorta o lo deja pasar según el `overflow`.
//
// Se mide, no se mira la captura: borde derecho de cada fila contra el del
// bloque que la contiene y contra el de la tarjeta, a 1024 y a 390 px.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4544, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const PREGUNTAS = Array.from({ length: 3 }, (_, i) => ({
  id: "q" + i, curso: "PIR 21", tema: "Pregunta " + i,
  pregunta: `¿Cuál de los siguientes autores defiende una estructura de la inteligencia NO jerárquica ${i}?:`,
  opciones: ["Catell.", "Vernon.", "Carroll.", "Una opción bastante más larga que las otras para ver que no se sale por el lado."],
  correcta: 3, explicacion: null, inventada: false, created_at: "2026-01-01T00:00:00Z",
}));

const fallos = [];
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
try {
  for (const ancho of [1024, 390]) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addInitScript(() => {
      localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
        access_token: "x", refresh_token: "y", expires_at: 9999999999,
        user: { id: "u1", email: "pabloadmin@ruta-pir.local", user_metadata: { username: "pabloadmin" } },
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
        return r.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": `0-0/${PREGUNTAS.length}` }, body: "" });
      }
      if (/select=actualizado_en/.test(url)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ actualizado_en: null }]) });
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PREGUNTAS) });
    });
    const pagina = await ctx.newPage();
    const errores = [];
    pagina.on("pageerror", (e) => errores.push(e.message));
    await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
    await esperar(5000);
    await pagina.getByRole("button", { name: /Banco de preguntas/i }).first().click();
    await esperar(1200);
    // Abrir la primera pregunta.
    await pagina.getByText("estructura de la inteligencia NO jerárquica 0", { exact: false }).first().click();
    await esperar(500);

    const m = await pagina.evaluate(() => {
      const boton = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Ver respuesta correcta");
      if (!boton) return { sinBoton: true };
      const bloque = boton.parentElement; // el contenedor de las opciones
      // La tarjeta: el antepasado más cercano con relleno propio, que es el
      // que dibuja el recuadro gris.
      let tarjeta = bloque.parentElement;
      const cuerpo = bloque.getBoundingClientRect();
      const opciones = [...bloque.children].filter((el) => el !== boton && el.tagName === "DIV" && /Catell|Vernon|Carroll|bastante/.test(el.textContent));
      const rt = tarjeta.getBoundingClientRect();
      return {
        n: opciones.length,
        bloqueDer: Math.round(cuerpo.right * 10) / 10,
        tarjetaDer: Math.round(rt.right * 10) / 10,
        filas: opciones.map((o) => Math.round(o.getBoundingClientRect().right * 10) / 10),
        documento: document.documentElement.scrollWidth,
        vista: window.innerWidth,
      };
    });
    console.log(`${ancho} px ->`, JSON.stringify(m));
    if (m.sinBoton) fallos.push(`${ancho}: no se abrió la pregunta`);
    else {
      if (m.n !== 4) fallos.push(`${ancho}: se esperaban 4 filas y hay ${m.n}`);
      m.filas.forEach((d, i) => {
        if (d > m.bloqueDer + 0.5) fallos.push(`${ancho}: la fila ${i + 1} sobresale ${(d - m.bloqueDer).toFixed(1)} px de su bloque`);
        if (d > m.tarjetaDer + 0.5) fallos.push(`${ancho}: la fila ${i + 1} sobresale ${(d - m.tarjetaDer).toFixed(1)} px de la tarjeta`);
      });
      if (m.documento > m.vista) fallos.push(`${ancho}: la página se ensancha (${m.documento} > ${m.vista})`);
    }
    if (errores.length) fallos.push(`${ancho}: errores JS ${errores.join(" | ")}`);
    await ctx.close();
  }
} finally {
  await navegador.close();
  servidor.kill();
}
if (fallos.length) { console.error("FALLA:\n- " + fallos.join("\n- ")); process.exit(1); }
console.log("OK: las cuatro filas de opciones caben dentro de su tarjeta, a 1024 y a 390 px.");
