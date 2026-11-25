// Las estadísticas de un mazo no pueden quedarse vacías porque el usuario
// haya repasado mucho. NO la ejecuta `npm test`:
//
//   npm run build && node tests/estadisticas-mas-de-1000.mjs
//
// El fallo: "se han perdido las estadísticas de cada mazo". Es la misma
// trampa que ya mordió con las flashcards (ver `flashcards-mas-de-1000.mjs`):
// PostgREST corta cada respuesta en 1000 filas SIN dar error, y las tablas
// personales se pedían de una sola vez. Con 2679 repasos en 90 días llegaban
// 1000, y los mazos cuyos repasos caían fuera salían sin datos. El progreso de
// las tarjetas (848) y de las preguntas (959) iban camino de lo mismo.
//
// Montaje: 1200 tarjetas en "Mazo viejo" y 10 en "Mazo nuevo", cada una con
// su progreso, y 1500 repasos del viejo antes de los 10 del nuevo. Así el
// progreso Y los repasos del mazo nuevo viven enteros más allá de la primera
// página. El servidor falso respeta `offset`/`limit` y nunca da más de 1000.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4541, SB = "slwifwjwtipoqtkhbhbr.supabase.co", TOPE = 1000;
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const k = (n) => String(n).padStart(5, "0"); // los ids ordenan como se insertan
const tarjetas = [];
for (let i = 0; i < 1200; i += 1) tarjetas.push({ id: `a-${k(i)}`, user_id: "u1", mazo: "Mazo viejo", frontal: `VIEJA ${k(i)}`, posterior: "x", etiquetas: [], grupo_id: null });
for (let i = 0; i < 10; i += 1) tarjetas.push({ id: `b-${k(i)}`, user_id: "u1", mazo: "Mazo nuevo", frontal: `NUEVA ${k(i)}`, posterior: "x", etiquetas: [], grupo_id: null });

const progreso = tarjetas.map((t) => ({
  name: "prueba", user_id: "u1", flashcard_id: t.id, ease_factor: 2.5, intervalo_dias: 9, repeticiones: 2,
  ultima_revision: new Date(Date.now() - 86400000).toISOString(), proxima_revision: "2099-01-01",
}));
const hace = (min) => new Date(Date.now() - min * 60000).toISOString();
const repasos = [];
for (let i = 0; i < 1500; i += 1) repasos.push({ id: `r-${k(i)}`, flashcard_id: `a-${k(i % 1200)}`, calidad: 4, acierto: true, intervalo_antes: 3, creado_en: hace(3000 - i) });
// Las del mazo nuevo, todas "Otra vez": tienen que salir en rojo.
for (let i = 0; i < 10; i += 1) repasos.push({ id: `r-${k(1500 + i)}`, flashcard_id: `b-${k(i)}`, calidad: 0, acierto: false, intervalo_antes: 3, creado_en: hace(10 - i) });

const pedidas = {};
const TABLAS = { flashcards: tarjetas, flashcards_progreso: progreso, flashcards_repasos: repasos };
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const ctx = await navegador.newContext({ viewport: { width: 900, height: 1100 } });
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
for (const [tabla, filas] of Object.entries(TABLAS)) {
  await pagina.route(`**${SB}/rest/v1/${tabla}?**`, (r) => {
    if (r.request().method() !== "GET") return json(r, []);
    pedidas[tabla] = (pedidas[tabla] || 0) + 1;
    // Como PostgREST: respeta offset/limit (van en la URL), nunca más de TOPE.
    const p = new URL(r.request().url()).searchParams;
    const desde = Number(p.get("offset") || 0);
    const cuantas = Math.min(Number(p.get("limit") || TOPE), TOPE);
    json(r, filas.slice(desde, desde + cuantas));
  });
}
await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
await esperar(6000);
await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
await esperar(1200);
await pagina.getByText("Mazo nuevo", { exact: false }).first().click();
await esperar(900);
await pagina.getByRole("button", { name: /^Estad/ }).last().click();
await esperar(1500);

const fallos = [];
const comprobar = (ok, q) => { if (!ok) fallos.push(q); };
const titulos = await pagina.$$eval('div[title^="NUEVA "]', (ds) => ds.map((d) => d.getAttribute("title").split("—")[1].trim()));
console.log("Mazo nuevo, tarjeta a tarjeta:", JSON.stringify(titulos));
comprobar(titulos.length === 10, `se esperaban 10 recuadros del mazo nuevo y hay ${titulos.length}`);
comprobar(titulos.every((t) => /^Otra vez/.test(t)),
  `las tarjetas del mazo nuevo no traen sus repasos (deberían decir "Otra vez"): ${JSON.stringify(titulos)}`);
const cuerpo = await pagina.locator("body").innerText();
comprobar(!/Sin estrenar\s*10/.test(cuerpo), "el mazo nuevo sale entero sin estrenar: su progreso no llegó");
console.log("Páginas pedidas:", JSON.stringify(pedidas));
comprobar((pedidas.flashcards_repasos || 0) >= 2, "los repasos no se piden por páginas");
comprobar((pedidas.flashcards_progreso || 0) >= 2, "el progreso no se pide por páginas");
comprobar(errores.length === 0, `errores en la página: ${errores.join(" / ")}`);

await navegador.close();
servidor.kill();
if (fallos.length) { console.error("FALLA:\n- " + fallos.join("\n- ")); process.exit(1); }
console.log(`OK: 1510 repasos y 1210 progresos con un tope de ${TOPE}; el mazo que vive más allá de la primera página tiene sus estadísticas.`);
