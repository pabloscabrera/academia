// Que una respuesta GET del servidor NO se pueda reutilizar de la caché del
// navegador. NO la ejecuta `npm test`:
//
//   npm run build && node tests/sin-cache.mjs
//
// Es el tercer incidente de caché de este proyecto y el que más costó ver: la
// app del icono de la pantalla de inicio seguía enseñando la lista vieja de
// flashcards después de importar un mazo, con la misma cuenta y el código al
// día. PostgREST no manda `Cache-Control`, así que el navegador decide por su
// cuenta cuánto da por buena una respuesta.
//
// Dos comprobaciones, y hacen falta las dos:
//  1. El MECANISMO: con un servidor que dice `max-age=600`, dos peticiones
//     iguales llegan UNA vez (se reutiliza) y con `cache: "no-store"` llegan
//     DOS. Si esto fallara, el arreglo no serviría de nada.
//  2. El CABLEADO: que `no-store` esté de verdad en el bundle construido —
//     comprobar solo el mecanismo dejaría pasar un arreglo que no se aplicó.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PUERTO = 4515;
let golpes = 0;
const servidor = createServer((req, res) => {
  if (req.url.startsWith("/dato")) {
    golpes += 1;
    res.writeHead(200, { "content-type": "application/json", "cache-control": "max-age=600" });
    res.end(JSON.stringify({ n: golpes }));
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<!doctype html><title>t</title><body>ok");
});
await new Promise((r) => servidor.listen(PUERTO, r));

const fallos = [];
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const pagina = await (await navegador.newContext()).newPage();
await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });

// 1a. Sin tocar nada: la segunda petición se sirve de la caché.
golpes = 0;
await pagina.evaluate(async () => {
  await fetch("/dato?a=1"); await fetch("/dato?a=1");
});
const conCache = golpes;
if (conCache !== 1) fallos.push(`el montaje no vale: con caché deberían llegar 1 y llegaron ${conCache} (¿el servidor no cachea?)`);

// 1b. Con `no-store`: las dos llegan al servidor.
golpes = 0;
await pagina.evaluate(async () => {
  await fetch("/dato?b=1", { cache: "no-store" }); await fetch("/dato?b=1", { cache: "no-store" });
});
const sinCache = golpes;
if (sinCache !== 2) fallos.push(`con "no-store" deberían llegar 2 peticiones y llegaron ${sinCache}`);

// 2. El cableado: que el bundle lo lleve.
const bundle = readFileSync("dist/assets/app.js", "utf8");
if (!/cache:\s*["']no-store["']/.test(bundle)) fallos.push('el bundle construido NO lleva cache: "no-store"');

await navegador.close();
servidor.close();
if (fallos.length) { console.error("FALLA:\n- " + fallos.join("\n- ")); process.exit(1); }
console.log(`OK: con caché 1 petición, con no-store 2, y el bundle lo lleva`);
