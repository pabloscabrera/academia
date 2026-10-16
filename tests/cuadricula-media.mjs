// La cuadrícula "Tarjeta a tarjeta" colorea por la MEDIA de todas las
// respuestas, no por la última. NO la ejecuta `npm test`: necesita Playwright
// y un build hecho.
//
//   npm run build && node tests/cuadricula-media.mjs
//
// Monta a mano los cuatro casos que separan una cosa de la otra, que es el
// fallo que reportó el usuario: una tarjeta fallada y recuperada tres tarjetas
// después —dentro de la misma sesión, con la respuesta todavía en la cabeza—
// salía verde, idéntica a una que se supo a la primera.
//
// Lo que tiene que salir:
//   fallada y recuperada en la MISMA sesión -> Otra vez (rojo),  media 2,0
//   acertada a la primera con "Fácil"       -> Fácil (verde),    media 5,0
//   recuperada en 2 sesiones                -> Difícil,          media 3,0
//   recuperada en 3 sesiones                -> Bien,             media 3,5
import { chromium } from "playwright";
import { spawn } from "node:child_process";
const PUERTO = 4499, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);
const tarjetas = [
  { id: "t0", user_id: "u1", mazo: "Porcentajes", frontal: "FALLADA Y RECUPERADA", posterior: "x", etiquetas: [], grupo_id: "t0" },
  { id: "t1", user_id: "u1", mazo: "Porcentajes", frontal: "ACERTADA A LA PRIMERA", posterior: "x", etiquetas: [], grupo_id: "t1" },
  { id: "t2", user_id: "u1", mazo: "Porcentajes", frontal: "RECUPERADA EN 2 SESIONES", posterior: "x", etiquetas: [], grupo_id: "t2" },
  { id: "t3", user_id: "u1", mazo: "Porcentajes", frontal: "RECUPERADA EN 3 SESIONES", posterior: "x", etiquetas: [], grupo_id: "t3" },
];
const progreso = tarjetas.map((t, i) => ({
  id: "p" + i, name: "prueba", user_id: "u1", flashcard_id: t.id, ease_factor: 2.5,
  intervalo_dias: 9, repeticiones: 2, ultima_revision: "2026-10-10T10:00:00.000Z", proxima_revision: "2026-10-20",
}));
const r = (id, calidad, cuando) => ({ flashcard_id: id, calidad, acierto: calidad >= 3, intervalo_antes: 5, creado_en: cuando });
const repasos = [
  // El caso del usuario: "Otra vez" y, tres tarjetas después, "Bien".
  r("t0", 0, "2026-10-15T10:00:00Z"), r("t0", 4, "2026-10-15T10:03:00Z"),
  // Acertada a la primera.
  r("t1", 5, "2026-10-15T10:00:00Z"),
  // Fallada, y recuperada en una sesión posterior.
  r("t2", 0, "2026-10-14T10:00:00Z"), r("t2", 4, "2026-10-14T10:03:00Z"), r("t2", 4, "2026-10-15T10:00:00Z"),
  // Y en dos sesiones posteriores.
  r("t3", 0, "2026-10-13T10:00:00Z"), r("t3", 4, "2026-10-13T10:03:00Z"),
  r("t3", 4, "2026-10-14T10:00:00Z"), r("t3", 4, "2026-10-15T10:00:00Z"),
];
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const ctx = await navegador.newContext({ viewport: { width: 900, height: 1100 } });
await ctx.addInitScript(() => {
  localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
    access_token: "x", refresh_token: "y", expires_at: 9999999999,
    user: { id: "u1", email: "pabloadmin@ruta-pir.local", user_metadata: { username: "pabloadmin" } },
  }));
});
const pagina = await ctx.newPage();
const errores = [];
pagina.on("pageerror", (e) => errores.push(e.message));
const json = (x, b) => x.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
await pagina.route(`**${SB}/rest/**`, (x) => json(x, []));
await pagina.route(`**${SB}/rest/v1/flashcards?**`, (x) => json(x, tarjetas));
await pagina.route(`**${SB}/rest/v1/flashcards_progreso?**`, (x) => json(x, progreso));
await pagina.route(`**${SB}/rest/v1/flashcards_repasos?**`, (x) => json(x, repasos));
await pagina.route(`**${SB}/auth/**`, (x) => x.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
await esperar(5000);
await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
await esperar(900);
await pagina.getByText("Porcentajes", { exact: false }).first().click();
await esperar(900);
await pagina.getByRole("button", { name: /Estad/ }).click();
await esperar(1500);
const cuerpo = await pagina.locator("body").innerText();
const i = cuerpo.indexOf("Tarjeta a tarjeta");
console.log("LEYENDA:", JSON.stringify(cuerpo.slice(i, i + 420).split("\n").filter(Boolean).slice(0, 4).join(" | ")));
for (const t of tarjetas) {
  const caja = pagina.locator(`div[title^="${t.frontal}"]`).first();
  console.log(t.frontal, "->", JSON.stringify((await caja.getAttribute("title")).split("—")[1]?.trim()));
}
const grid = pagina.locator("div").filter({ has: pagina.locator("h3", { hasText: "Tarjeta a tarjeta" }) }).last();
await grid.screenshot({ path: "/tmp/claude-0/-home-user-academia/0947b359-e7dd-5296-82b5-d7a3a69581c4/scratchpad/media.png" });
console.log("ERRORES JS:", errores.length ? errores.join(" | ") : "ninguno");
await navegador.close(); servidor.kill();
