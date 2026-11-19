// Comprueba en un navegador de verdad que lo que fallas vuelve a salir DENTRO
// de la misma sesión. NO la ejecuta `npm test` (que solo coge
// `tests/*.test.mjs`): necesita Playwright y un build hecho.
//
//   npm run build && node tests/repaso-repite.mjs
//
// Esto no se puede probar con `npm test` porque el bucle de la sesión vive en
// `App.jsx` y un `.jsx` no se importa desde Node. `reinsertarEnSesion` sí está
// probada aparte en `plan.test.mjs`; lo que cubre esta es el cableado: que al
// pulsar "Otra vez" la cola de verdad crezca, que la tarjeta reaparezca con
// otras por medio (y no acto seguido, que sería leerla en vez de recordarla) y
// que el resumen siga contando TARJETAS y no pulsaciones.
//
// Detalle del montaje que hace falta: el `upsert` de `flashcards_progreso`
// devuelve la fila, y la app solo actualiza su copia local si llega; por eso
// la ruta POST contesta con lo que se le manda, como haría el servidor.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
const PUERTO = 4471, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);
const tarjetas = Array.from({ length: 8 }, (_, i) => ({
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
try {
  const ctx = await navegador.newContext({ viewport: { width: 430, height: 950 } });
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

  const vistas = [];
  const titulos = [];
  for (let paso = 0; paso < 40; paso++) {
    if (await pagina.locator(".flip-container").count() === 0) break;
    vistas.push((await pagina.locator(".flip-container").innerText()).match(/Frente \d+/)[0]);
    titulos.push((await pagina.locator("body").innerText()).match(/Tarjeta \d+ de \d+[^\n]*/)[0]);
    await pagina.locator(".flip-container").click();
    await esperar(500);
    // La primera se marca "Otra vez"; el resto "Bien".
    const boton = paso === 0 ? "Otra vez" : "Bien";
    await pagina.getByRole("button", { name: boton, exact: true }).click();
    await esperar(800);
  }
  console.log("SECUENCIA:", vistas.join(" > "));
  console.log("CABECERA tras fallar:", titulos[1]);
  const fallada = vistas[0];
  const repeticiones = vistas.filter((v) => v === fallada).length;
  if (repeticiones < 2) throw new Error(`la fallada (${fallada}) NO volvió a salir: ${vistas.join(" > ")}`);
  const posicion = vistas.indexOf(fallada, 1);
  if (posicion === 1) throw new Error("volvió inmediatamente: la estarías leyendo, no recordando");
  const resumen = (await pagina.locator("body").innerText()).match(/Has repasado \d+ tarjetas?/);
  console.log("RESUMEN:", resumen && resumen[0]);
  if (!resumen || !/Has repasado 6 tarjetas/.test(resumen[0])) throw new Error("el resumen cuenta la repetida dos veces: " + (resumen && resumen[0]));
  if (errores.length) throw new Error("errores JS: " + errores.join("\n"));
  console.log("OK: la fallada vuelve dentro de la sesión y el resumen sigue contando tarjetas, no pulsaciones.");
} catch (e) { fallo = e; } finally { await navegador.close(); servidor.kill(); }
if (fallo) { console.error("FALLO:", fallo.message); process.exit(1); }
