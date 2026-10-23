// Cambiar el COLOR de un mazo cuando `mazos_estilo.carpeta` no existe todavía.
// NO la ejecuta `npm test` (necesita Playwright y un build hecho):
//
//   npm run build && node tests/color-sin-columna-carpeta.mjs
//
// El caso real: el usuario cambió un color y le salió la barra roja ("la base
// de datos acaba de cambiar..."), con el mazo pintado igualmente. Dos fallos
// a la vez, y ninguno se veía desde la pantalla:
//
//  1. El `upsert` manda SIEMPRE `carpeta`, aunque se esté cambiando solo el
//     color. Mientras `supabase-mazos-carpeta.sql` no se haya ejecutado esa
//     columna no está, así que fallaba un cambio que no toca las carpetas.
//  2. El color se aplicaba en local ANTES de escribir y no se deshacía nunca,
//     así que un guardado fallido se veía exactamente igual que uno bueno y
//     solo al recargar aparecía el color viejo.
//
// Aquí el servidor RECHAZA con PGRST204 cualquier escritura que lleve
// `carpeta`, que es lo que hace Supabase sin esa columna. Se comprueba mirando
// las peticiones, no la pantalla: el reintento tiene que salir sin `carpeta`.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4502, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const tarjetas = [0, 1].map((j) => ({
  id: `t${j}`, user_id: "u1", mazo: "Porcentajes", frontal: `Frente ${j}`, posterior: `Dorso ${j}`,
  etiquetas: [], grupo_id: null,
}));

const fallos = [];
const enviados = [];
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const ctx = await navegador.newContext({ viewport: { width: 420, height: 900 } });
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
await pagina.route(`**${SB}/rest/**`, (r) => json(r, []));
await pagina.route(`**${SB}/rest/v1/flashcards?**`, (r) => json(r, tarjetas));
await pagina.route(`**${SB}/rest/v1/mazos_estilo?**`, (r) => {
  if (r.request().method() === "GET") return json(r, []);
  const cuerpo = r.request().postData() || "";
  enviados.push(cuerpo);
  // Exactamente lo que contesta Supabase cuando la columna no está.
  if (cuerpo.includes("carpeta")) {
    return json(r, {
      code: "PGRST204",
      message: "Could not find the 'carpeta' column of 'mazos_estilo' in the schema cache",
    }, 400);
  }
  return json(r, []);
});
await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
await esperar(5000);
await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
await esperar(1200);

// ---------- Cambiar el color ----------
await pagina.getByRole("button", { name: /Opciones de Porcentajes/i }).first().click();
await esperar(500);
await pagina.getByRole("button", { name: /Color e icono/i }).first().click();
await esperar(500);
// Cada muestra de color lleva su clave en el `title` ("acento", "turquesa"...).
const colores = await pagina.locator('button[title="acento"]').count();
await pagina.locator('button[title="acento"]').first().click();
await esperar(300);
await pagina.getByRole("button", { name: /^Guardar$/ }).first().click();
await esperar(2500);

console.log("1) peticiones de mazos_estilo ->", JSON.stringify(enviados));
if (enviados.length < 2) {
  fallos.push(`no hubo reintento: solo salió ${enviados.length} escritura (${JSON.stringify(enviados)})`);
} else {
  if (!enviados[0].includes("carpeta")) fallos.push("la primera escritura ya iba sin carpeta: el caso no se ha reproducido");
  if (enviados[enviados.length - 1].includes("carpeta")) fallos.push("el reintento sigue mandando carpeta");
  if (!enviados[enviados.length - 1].includes("color")) fallos.push("el reintento no manda el color");
}

// El aviso rojo tiene que haberse ido: el reintento salió bien.
const aviso = await pagina.evaluate(() => {
  const t = document.body.innerText;
  const m = t.match(/.*(no se ha enterado|no está en la base de datos|falta algo en la base).*/);
  return m ? m[0].slice(0, 120) : null;
});
console.log("2) aviso que queda ->", JSON.stringify(aviso));
if (aviso) fallos.push(`queda la barra roja aunque el color se guardó: ${aviso}`);

// Y el color tiene que seguir puesto (se guardó de verdad).
const fondo = await pagina.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith("Porcentajes"));
  return b ? getComputedStyle(b.parentElement).backgroundColor : null;
});
console.log("3) fondo de la fila ->", fondo, "| botones de color encontrados:", colores);
if (!fondo || /rgba\(0, 0, 0, 0\)|255, 255, 255/.test(fondo)) {
  fallos.push(`la fila se quedó sin color: ${fondo}`);
}

console.log("ERRORES JS:", errores.length ? errores.join(" | ") : "ninguno");
await navegador.close();
servidor.kill();
if (errores.length) fallos.push(`errores de JS: ${errores.join(" | ")}`);
if (fallos.length) {
  console.error("\nFALLOS:\n- " + fallos.join("\n- "));
  process.exit(1);
}
console.log("\nOK: sin la columna `carpeta`, cambiar el color se guarda igual y no deja aviso.");
