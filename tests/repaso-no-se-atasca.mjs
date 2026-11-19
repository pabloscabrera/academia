// El repaso no se puede quedar "pillado en una tarjeta y sin avanzar".
// NO la ejecuta `npm test` (que solo coge `tests/*.test.mjs`): necesita
// Playwright y un build hecho.
//
//   npm run build && node tests/repaso-no-se-atasca.mjs
//
// Lo que pasó: `calificar` esperaba a que la escritura de
// `flashcards_progreso` volviera, y supabase-js no trae plazo propio, así que
// con el servidor MUDO la petición no fallaba — simplemente no volvía nunca.
// `enviando` se quedaba en `true` para siempre y los cuatro botones quedaban
// muertos. Reproducido en un navegador antes de tocar nada: la tarjeta 1 de 4
// seguía ahí a los 13 segundos, con el botón deshabilitado y SIN decir nada.
//
// Esto no se puede probar con `npm test`: el bucle de la sesión vive en
// `App.jsx` y un `.jsx` no se importa desde Node. Y no vale mirar la captura,
// hay que mirar si la cabecera cambia de tarjeta.
//
// Dos escenarios, que fallan de maneras distintas:
//  A) servidor MUDO (no contesta ni bien ni mal): la sesión tiene que llegar
//     al final igual, y lo no guardado tiene que acabar en la cola local —
//     que es lo que convierte "se perdió" en "se sube luego".
//  B) servidor que RECHAZA (42501, una política RLS): la sesión avanza igual,
//     pero además hay que DECIRLO. Callarlo es lo que hacía parecer que el
//     repaso se guardaba.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4473, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const tarjetas = Array.from({ length: 4 }, (_, i) => ({
  id: "t" + i, user_id: "u1", mazo: "Porcentajes", frontal: "Frente " + i, posterior: "Dorso " + i,
  etiquetas: [], grupo_id: null,
}));
const progreso = tarjetas.map((t, i) => ({
  id: "p" + i, name: "prueba", user_id: "u1", flashcard_id: t.id, ease_factor: 2.5,
  intervalo_dias: 9, repeticiones: 3, ultima_revision: `2026-10-0${(i % 4) + 1}T10:00:00.000Z`,
  proxima_revision: "2026-10-05",
}));

let fallo = null;
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });

// `comoResponde` decide qué hace el servidor con el POST/PATCH de
// flashcards_progreso: "mudo" (nunca contesta) o "rechaza" (error de RLS).
async function sesionCompleta(comoResponde) {
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
  const json = (r, b, s = 200) => r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
  // El comodín va PRIMERO: en Playwright gana la ruta registrada después.
  await pagina.route(`**${SB}/rest/**`, (r) => json(r, []));
  await pagina.route(`**${SB}/rest/v1/flashcards?**`, (r) => json(r, tarjetas));
  await pagina.route(`**${SB}/rest/v1/flashcards_progreso?**`, (r) => {
    if (r.request().method() === "GET") return json(r, progreso);
    if (comoResponde === "mudo") return; // no se contesta: ni 200 ni error
    return json(r, { code: "42501", message: "new row violates row-level security policy" }, 403);
  });
  await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await esperar(5000);
  await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
  await esperar(800);
  await pagina.getByText("Porcentajes", { exact: false }).first().click();
  await esperar(800);
  await pagina.locator('input[type="number"]').fill("4");
  await pagina.locator('input[type="number"]').blur();
  await esperar(300);
  await pagina.getByRole("button", { name: "Empezar repaso" }).click();
  await esperar(800);

  const cabecera = async () => {
    const m = (await pagina.locator("body").innerText()).match(/Tarjeta \d+ de \d+/);
    return m && m[0];
  };
  const cabeceras = [];
  for (let paso = 0; paso < 6; paso++) {
    if (await pagina.locator(".flip-container").count() === 0) break;
    const antes = await cabecera();
    cabeceras.push(antes);
    await pagina.locator(".flip-container").click();
    await esperar(450);
    const boton = pagina.getByRole("button", { name: "Bien", exact: true });
    if (await boton.count() === 0) throw new Error(`[${comoResponde}] no hay botones de dificultad en ${antes}`);
    if (await boton.isDisabled({ timeout: 2000 })) throw new Error(`[${comoResponde}] los botones están muertos en ${antes}`);
    await boton.click();
    // Medio segundo: menos de lo que tarda el plazo de espera (10 s), así que
    // si la pantalla avanza es porque no espera al servidor, no porque el
    // plazo la haya rescatado. Y se comprueba AQUÍ, no al final: si no, un
    // atasco sale como un error raro de Playwright tres pasos después.
    await esperar(500);
    const despues = await cabecera();
    const acabo = await pagina.locator(".flip-container").count() === 0;
    if (!acabo && despues === antes) {
      throw new Error(`[${comoResponde}] se quedó pillado en "${antes}" y no avanzó`);
    }
  }
  const texto = () => pagina.locator("body").innerText();
  const resumen = (await texto()).match(/Has repasado \d+ tarjetas?/);
  const resultado = { cabeceras, resumen: resumen && resumen[0], errores, pagina, texto, ctx };
  return resultado;
}

try {
  // --- A) El servidor no contesta ---
  const a = await sesionCompleta("mudo");
  console.log("MUDO · cabeceras:", a.cabeceras.join(" > "), "| resumen:", a.resumen);
  if (a.cabeceras.length !== 4) throw new Error("la sesión no llegó al final con el servidor mudo: " + a.cabeceras.join(" > "));
  if (new Set(a.cabeceras).size !== 4) throw new Error("se repitió la misma tarjeta: " + a.cabeceras.join(" > "));
  if (!a.resumen || !/Has repasado 4 tarjetas/.test(a.resumen)) throw new Error("no salió el resumen: " + a.resumen);
  // Nada de lo contestado se pierde: al agotarse el plazo se encola.
  await esperar(12000);
  const pendientes = (await a.texto()).match(/\d+ sin guardar/);
  console.log("MUDO · píldora:", pendientes && pendientes[0]);
  if (!pendientes) throw new Error("lo contestado sin respuesta del servidor no quedó en la cola local");
  if (a.errores.length) throw new Error("errores JS: " + a.errores.join(" | "));
  await a.ctx.close();

  // --- B) El servidor rechaza ---
  const b = await sesionCompleta("rechaza");
  console.log("RECHAZA · cabeceras:", b.cabeceras.join(" > "), "| resumen:", b.resumen);
  if (b.cabeceras.length !== 4) throw new Error("la sesión no llegó al final con el servidor rechazando: " + b.cabeceras.join(" > "));
  if (!b.resumen || !/Has repasado 4 tarjetas/.test(b.resumen)) throw new Error("no salió el resumen: " + b.resumen);
  const aviso = (await b.texto()).match(/[^\n]*repaso de la tarjeta[^\n]*/);
  console.log("RECHAZA · aviso:", aviso && aviso[0]);
  if (!aviso || !/permisos/.test(aviso[0])) throw new Error("un rechazo del servidor no se dijo en voz alta: " + (aviso && aviso[0]));
  if (b.errores.length) throw new Error("errores JS: " + b.errores.join(" | "));
  await b.ctx.close();

  console.log("OK: la sesión avanza sin esperar al servidor; lo mudo se encola y lo rechazado se avisa.");
} catch (e) { fallo = e; } finally { await navegador.close(); servidor.kill(); }
if (fallo) { console.error("FALLO:", fallo.message); process.exit(1); }
