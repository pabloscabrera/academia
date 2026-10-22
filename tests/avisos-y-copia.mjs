// Comprueba en un navegador de verdad las tres cosas que el usuario reportó
// a la vez. NO la ejecuta `npm test`: necesita Playwright y un build hecho.
//
//   npm run build && node tests/avisos-y-copia.mjs
//
// Monta el servidor FALLANDO a propósito, de las tres formas que de verdad
// pasan, porque el fallo era que la app se las tragaba todas:
//   1. `favoritos` rechaza el insert (RLS)  -> la estrella no se ponía
//      amarilla y nadie decía por qué.
//   2. `flashcards` no contesta nunca       -> el botón se quedaba en
//      "Añadiendo..." para siempre (supabase-js no trae plazo propio).
//   4. `mazos_estilo` no existe             -> igual, en silencio.
// Y de paso (3) que copiar un mazo a otro NO vacíe el de origen y que la
// copia salga con el `grupo_id` del original, que es lo que hace que las dos
// compartan la memoria de repaso.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
const PUERTO = 4491, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);
const preguntas = [{ id: "q0", pregunta: "¿Pregunta cero?", opciones: ["a","b","c","d"], correcta: 0,
  explicacion: "x", tema: "T", curso: "PIR 25", inventada: false,
  created_at: "2026-01-01T00:00:00Z", actualizado_en: "2026-01-01T00:00:00Z" }];
const tarjetas = [
  { id: "t0", user_id: "u1", mazo: "Porcentajes", frontal: "F0", posterior: "D0", etiquetas: ["pct"], grupo_id: null },
  { id: "t1", user_id: "u1", mazo: "Porcentajes", frontal: "F1", posterior: "D1", etiquetas: [], grupo_id: null },
  { id: "t2", user_id: "u1", mazo: "Young", frontal: "F2", posterior: "D2", etiquetas: [], grupo_id: null },
];
let modo = "rechaza";           // rechaza | cuelga | copia
const insertados = [];
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const ctx = await navegador.newContext({ viewport: { width: 440, height: 1000 } });
await ctx.addInitScript(() => {
  localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
    access_token: "x", refresh_token: "y", expires_at: 9999999999,
    user: { id: "u1", email: "pabloadmin@ruta-pir.local", user_metadata: { username: "pabloadmin" } },
  }));
});
const pagina = await ctx.newPage();
const errores = [];
pagina.on("pageerror", (e) => errores.push(e.message));
const json = (r, b, s = 200) => r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
await pagina.route(`**${SB}/rest/**`, (r) => json(r, []));
await pagina.route(`**${SB}/rest/v1/preguntas?**`, (r) => json(r, preguntas));
await pagina.route(`**${SB}/rest/v1/flashcards?**`, (r) => {
  if (r.request().method() === "GET") return json(r, tarjetas);
  if (modo === "cuelga") return new Promise(() => {});
  const filas = JSON.parse(r.request().postData() || "[]");
  insertados.push(...filas);
  return json(r, filas.map((f, i) => ({ id: "nuevo" + insertados.length + i, user_id: "u1", ...f })));
});
await pagina.route(`**${SB}/rest/v1/mazos_estilo?**`, (r) => r.request().method() === "GET"
  ? json(r, [])
  : json(r, { message: 'relation "public.mazos_estilo" does not exist', code: "42P01" }, 404));
await pagina.route(`**${SB}/rest/v1/favoritos?**`, (r) => r.request().method() === "GET"
  ? json(r, [])
  : json(r, { message: 'new row violates row-level security policy for table "favoritos"', code: "42501" }, 403));
await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
const avisoEnPantalla = async () => {
  const a = pagina.locator('[role="alert"]');
  return (await a.count()) ? (await a.first().innerText()).replace(/\s+/g, " ").trim() : null;
};

// 1) La estrella con el servidor rechazando: ahora tiene que DECIRLO.
await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
await esperar(5000);
await pagina.getByRole("button", { name: /Banco/i }).first().click();
await esperar(1500);
await pagina.locator('button[title*="favorita"]').first().click();
await esperar(1500);
console.log("1) ESTRELLA rechazada ->", JSON.stringify(await avisoEnPantalla()));

// 2) Añadir mazo con un servidor que no contesta: no puede girar para siempre.
modo = "cuelga";
await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
await esperar(4500);
await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
await esperar(1200);
await pagina.getByRole("button", { name: /Nuevo mazo/i }).first().click();
await esperar(600);
await pagina.locator('input[placeholder*="Trastornos"]').fill("Mazo nuevo");
await pagina.locator("textarea").nth(0).fill("frente");
await pagina.locator("textarea").nth(1).fill("dorso");
await pagina.getByRole("button", { name: /Añadir tarjeta/i }).last().click();
await esperar(4000);
console.log("2) a los 4 s el botón dice:", JSON.stringify(await pagina.getByRole("button", { name: /Añadiendo|Añadir tarjeta/i }).last().innerText()));
await esperar(8000);
console.log("2) a los 12 s el botón dice:", JSON.stringify(await pagina.getByRole("button", { name: /Añadiendo|Añadir tarjeta/i }).last().innerText()),
  "\n   aviso ->", JSON.stringify(await avisoEnPantalla()));

// 3) Copiar un mazo a otro: el original se queda.
modo = "copia";
await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
await esperar(4500);
await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
await esperar(1200);
const antes = await pagina.locator("body").innerText();
// Desde que los mazos se pintan como cuadros en rejilla, las acciones viven
// dentro del panel de los tres puntos: en un cuadro de 65 px no cabían cinco
// iconos. Ver el punto de la rejilla en CLAUDE.md.
await pagina.getByRole("button", { name: /Opciones de Porcentajes/ }).first().click();
await esperar(500);
await pagina.getByRole("button", { name: /Copiar a otro/ }).first().click();
await esperar(700);
await pagina.locator("select").first().selectOption("Young").catch(() => {});
await esperar(300);
await pagina.getByRole("button", { name: /^Copiar a "/ }).first().click();
await esperar(2000);
const despues = await pagina.locator("body").innerText();
console.log("3) INSERTADO:", JSON.stringify(insertados));
console.log("3) lista de mazos antes:", JSON.stringify(antes.match(/Porcentajes\n[^\n]*|Young\n[^\n]*/g)));
console.log("3) lista de mazos después:", JSON.stringify(despues.match(/Porcentajes\n[^\n]*|Young\n[^\n]*/g)));
// 4) Quitar el color de un mazo con la tabla sin crear.
await pagina.getByRole("button", { name: /Opciones de Porcentajes/ }).first().click();
await esperar(500);
await pagina.getByRole("button", { name: /Color e icono/ }).first().click();
await esperar(700);
await pagina.getByRole("button", { name: /^Guardar$/ }).first().click();
await esperar(2500);
console.log("4) COLOR con la tabla sin crear ->", JSON.stringify(await avisoEnPantalla()),
  "| ¿sigue el botón girando?", (await pagina.getByRole("button", { name: /Guardando|Guardar/ }).count()) > 0
    ? await pagina.getByRole("button", { name: /Guardando|Guardar/ }).first().innerText() : "el panel se cerró");
console.log("ERRORES JS:", errores.length ? errores.join(" | ") : "ninguno");
await navegador.close(); servidor.kill();
