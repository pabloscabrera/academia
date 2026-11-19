// La cabecera y las pantallas completas no se meten bajo el reloj de iOS.
// NO la ejecuta `npm test` (necesita Playwright y un build hecho):
//
//   npm run build && node tests/franja-superior.mjs
//
// La queja: "si me meto en el móvil no veo lo de arriba, el menú de gente
// conectada y demás; y si entro en ranking no tengo opción de salir (no sé si
// la X está más arriba y no la veo)".
//
// La causa es la misma que ya tuvo la barra de aviso: desde el icono de la
// pantalla de inicio la página empieza en y=0 y iOS dibuja la hora y la
// batería ENCIMA, así que la primera fila de la cabecera y el botón de cerrar
// del Ranking quedaban debajo.
//
// QUÉ PUEDE Y QUÉ NO PUEDE COMPROBAR ESTA PRUEBA, que conviene no confundir:
//   * NO puede simular la franja de iOS. Chromium no deja fijar
//     `env(safe-area-inset-top)`, así que aquí siempre vale 0.
//   * SÍ comprueba que la expresión `max(12px, env(...))` es CSS válido y que
//     en un navegador normal deja el valor de siempre. Esto no es trivial: si
//     la expresión estuviera mal escrita, el navegador tira la declaración
//     ENTERA y el relleno se iría a 0 — o sea que el arreglo se habría
//     cargado también el caso normal sin que nadie lo notara.
//   * SÍ comprueba lo demás de la queja: que el botón de salir exista, se vea,
//     y que un toque en su centro LE LLEGUE (con `elementFromPoint`, no
//     fiándose de la captura).
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4507, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const fallos = [];
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
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
await pagina.route(`**${SB}/rest/v1/rachas?**`, (r) => json(r, [{ name: "prueba", racha_actual: 3, racha_record: 9, total_respondidas: 120 }]));
await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
await esperar(5000);

// ---------- 1: la cabecera reserva la franja, y sin franja no se encoge ----------
const cab = await pagina.evaluate(() => {
  const h = document.querySelector("header");
  if (!h) return null;
  const cs = getComputedStyle(h);
  const r = h.getBoundingClientRect();
  return { padTop: cs.paddingTop, top: Math.round(r.top), alto: Math.round(r.height) };
});
console.log("1) cabecera ->", JSON.stringify(cab));
if (!cab) fallos.push("no se encontró la cabecera");
else {
  // 12px es el valor de siempre en móvil. Un 0 significaría que la expresión
  // `max(...)` no es válida y el navegador ha tirado la regla entera.
  if (parseFloat(cab.padTop) < 12) fallos.push(`[cabecera] el relleno superior se quedó en ${cab.padTop}: la regla no es válida`);
  if (cab.top < 0) fallos.push(`[cabecera] empieza en y=${cab.top}, por encima del borde`);
}

// La marca y las píldoras son lo que la queja dice no ver: tienen que estar
// dentro de la pantalla, no recortadas por arriba.
const marca = await pagina.evaluate(() => {
  const m = document.querySelector(".cabecera-marca");
  if (!m) return null;
  const r = m.getBoundingClientRect();
  return { top: Math.round(r.top), visible: r.top >= 0 && r.bottom <= window.innerHeight };
});
console.log("   marca ->", JSON.stringify(marca));
if (!marca || !marca.visible) fallos.push(`[cabecera] la marca y las píldoras no se ven enteras: ${JSON.stringify(marca)}`);

// ---------- 2: del Ranking se puede salir ----------
await pagina.getByRole("button", { name: /Ranking/i }).first().click();
await esperar(900);
const cerrar = await pagina.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Cerrar");
  if (!b) return { hay: false };
  const r = b.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
  const golpeado = document.elementFromPoint(cx, cy);
  return {
    hay: true, top: Math.round(r.top), alto: Math.round(r.height),
    dentro: r.top >= 0 && r.bottom <= window.innerHeight,
    // Lo que de verdad importa: que el dedo le llegue al botón.
    leLlega: !!golpeado && (golpeado === b || b.contains(golpeado)),
  };
});
console.log("2) botón de salir del Ranking ->", JSON.stringify(cerrar));
if (!cerrar.hay) fallos.push("[ranking] no hay ningún botón de salir");
else {
  if (!cerrar.dentro) fallos.push(`[ranking] el botón de salir queda fuera de la pantalla (top=${cerrar.top})`);
  if (!cerrar.leLlega) fallos.push("[ranking] el toque en el centro del botón no le llega: algo lo tapa");
  if (cerrar.alto < 40) fallos.push(`[ranking] el botón mide ${cerrar.alto} px de alto: demasiado poco para un dedo`);
}

// Y que al pulsarlo se salga de verdad.
if (cerrar.hay) {
  await pagina.getByRole("button", { name: /^Cerrar$/ }).first().click();
  await esperar(600);
  const sigue = await pagina.evaluate(() =>
    [...document.querySelectorAll("button")].some((x) => x.textContent.trim() === "Cerrar"));
  console.log("   ¿sigue abierto tras pulsar? ->", sigue);
  if (sigue) fallos.push("[ranking] pulsar Cerrar no cierra la pantalla");
}

// ---------- 3: lo mismo en el Banco ----------
await pagina.getByRole("button", { name: /Banco/i }).first().click();
await esperar(900);
const enBanco = await pagina.evaluate(() =>
  [...document.querySelectorAll("button")].some((x) => x.textContent.trim() === "Cerrar"));
console.log("3) el Banco también tiene salida ->", enBanco);
if (!enBanco) fallos.push("[banco] no hay botón de salir");

console.log("ERRORES JS:", errores.length ? errores.join(" | ") : "ninguno");
await navegador.close();
servidor.kill();
if (errores.length) fallos.push(`errores de JS: ${errores.join(" | ")}`);
if (fallos.length) {
  console.error("\nFALLOS:\n- " + fallos.join("\n- "));
  process.exit(1);
}
console.log("\nOK: la cabecera se ve entera y de las pantallas completas se puede salir.");
