// Que se vean TODAS las flashcards aunque pasen del tope de filas por
// petición del servidor. NO la ejecuta `npm test`:
//
//   npm run build && node tests/flashcards-mas-de-1000.mjs
//
// El fallo que arregla, que el usuario diagnosticó antes que yo: PostgREST
// corta cada respuesta en un máximo de filas (por defecto 1000), y la carga
// de flashcards pedía `select("*")` de una vez, sin páginas. Pasadas las
// 1000 tarjetas, **las demás no existían para la app**: mazos enteros que no
// salían, un mazo viejo a medias, y tarjetas recién importadas que no
// aparecían por mucho que se volvieran a importar. No se ve venir porque la
// petición NO falla.
//
// El montaje imita al servidor de verdad: lee la cabecera `Range` y nunca
// devuelve más de 1000 filas, pase lo que pase.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4519, SB = "slwifwjwtipoqtkhbhbr.supabase.co", TOPE = 1000;
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

// 2500 tarjetas en tres mazos. El tercero vive ENTERO más allá de la primera
// página, así que con el código viejo no aparece por ningún lado.
const MAZOS = [["Mazo A", 1000], ["Mazo B", 1000], ["Mazo C", 500]];
const todas = [];
MAZOS.forEach(([mazo, n]) => {
  for (let i = 0; i < n; i += 1) {
    const k = String(todas.length).padStart(5, "0"); // el id ordena como se insertó
    todas.push({ id: `f-${k}`, user_id: "u1", mazo, frontal: `F ${k}`, posterior: `D ${k}`, etiquetas: [], grupo_id: null });
  }
});

const fallos = [];
let peticiones = 0;
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const ctx = await navegador.newContext({ viewport: { width: 820, height: 1100 } });
await ctx.addInitScript(() => {
  localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
    access_token: "x", refresh_token: "y", expires_at: 9999999999,
    user: { id: "u1", email: "prueba@ruta-pir.local", user_metadata: { username: "prueba" } },
  }));
});
const pagina = await ctx.newPage();
const errores = [];
pagina.on("pageerror", (e) => errores.push(e.message));
const json = (r, b, extra = {}) => r.fulfill({ status: 200, contentType: "application/json", headers: extra, body: JSON.stringify(b) });
await pagina.route(`**${SB}/rest/**`, (r) => json(r, []));
await pagina.route(`**${SB}/rest/v1/flashcards?**`, (r) => {
  peticiones += 1;
  // Como PostgREST: respeta lo que se pida pero nunca sirve más de TOPE.
  // OJO: supabase-js manda `.range()` como `offset`/`limit` EN LA URL, no en
  // la cabecera `Range` — buscarlo en la cabecera deja el montaje devolviendo
  // siempre la primera página y la carga entra en un bucle infinito.
  const params = new URL(r.request().url()).searchParams;
  const desde = Number(params.get("offset") || 0);
  const pedidas = Number(params.get("limit") || TOPE);
  const trozo = todas.slice(desde, desde + Math.min(pedidas, TOPE));
  json(r, trozo, { "content-range": `${desde}-${desde + trozo.length - 1}/${todas.length}` });
});
await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
await esperar(6000);
if (process.env.DEBUG_T) { console.log("PETICIONES:", peticiones); console.log("ERRORES:", errores); console.log("TEXTO:", (await pagina.evaluate(() => document.body.innerText)).slice(0, 400)); }
await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
await esperar(1500);

const comprobar = (ok, q) => { if (!ok) fallos.push(q); };

// 1. El recuento del subtítulo es el total, no el tope de una página.
const subtitulo = await pagina.evaluate(() => document.body.innerText.match(/Tu mazo privado[^\n]*/)?.[0] || "");
comprobar(/2500 tarjetas/.test(subtitulo), `el subtítulo no cuenta las 2500: "${subtitulo}"`);
comprobar(/3 mazos/.test(subtitulo), `el subtítulo no ve los 3 mazos: "${subtitulo}"`);

// 2. El mazo que vive ENTERO más allá de la primera página está en la lista.
const texto = await pagina.evaluate(() => document.body.innerText);
MAZOS.forEach(([m]) => comprobar(texto.includes(m), `falta "${m}" en la lista`));

// 3. Y con su recuento correcto, no a medias.
comprobar(/Mazo C\s*\n?\s*500 tarjetas/.test(texto.replace(/ /g, " ")),
  '"Mazo C" no dice 500 tarjetas');

// 4. Se pidieron varias páginas (3 llenas + 1 vacía para saber que se acabó).
comprobar(peticiones >= 3, `solo salieron ${peticiones} peticiones: no está paginando`);

comprobar(errores.length === 0, `errores en la página: ${errores.join(" / ")}`);

await navegador.close();
servidor.kill();
if (fallos.length) { console.error("FALLA:\n- " + fallos.join("\n- ")); process.exit(1); }
console.log(`OK: 2500 tarjetas en 3 mazos con un tope de ${TOPE} por petición (${peticiones} páginas)`);
