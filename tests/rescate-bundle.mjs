// Comprueba la red de seguridad contra la pantalla en blanco del icono de la
// pantalla de inicio. NO la ejecuta `npm test` (que solo coge `tests/*.test.mjs`):
// necesita Playwright y un build hecho.
//
//   npm run build && node tests/rescate-bundle.mjs
//
// El fallo que cubre: iOS guarda su propia copia del `index.html` al añadir el
// icono y no la refresca sola, así que tras un despliegue esa copia pedía
// `index-<hash viejo>.js`, que ya no existía. El módulo no cargaba, React no
// montaba y no se veía ni un error — por fuera, "no me abre la web".
//
// Dos piezas lo arreglan y esto las prueba juntas: el bundle sale con nombre
// fijo (`vite.config.js`) y `vercel.json` reescribe cualquier
// `/assets/*.js` que no exista a `/assets/app.js`. Aquí se emula el orden de
// rutas de Vercel —fichero primero, reescritura después— y se sirve un
// `index.html` viejo a propósito.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);
const htmlViejo = (await readFile(new URL("index.html", dist), "utf8"))
  .replace("/assets/app.js", "/assets/index-PWh0HchY.js");

const servidor = createServer(async (req, res) => {
  const ruta = req.url.split("?")[0];
  const tipo = ruta.endsWith(".js") ? "text/javascript" : ruta.endsWith(".json") ? "application/json" : "text/html";
  if (ruta === "/" ) { res.writeHead(200, { "content-type": "text/html" }); return res.end(htmlViejo); }
  try {
    const cuerpo = await readFile(new URL("." + ruta, dist));
    res.writeHead(200, { "content-type": tipo }); return res.end(cuerpo);
  } catch {}
  if (/^\/assets\/.*\.js$/.test(ruta)) {           // la reescritura de vercel.json
    const cuerpo = await readFile(new URL("assets/app.js", dist));
    res.writeHead(200, { "content-type": "text/javascript" }); return res.end(cuerpo);
  }
  res.writeHead(404); res.end("no");
});
await new Promise((r) => servidor.listen(4433, r));

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
let fallo = null;
try {
  const pagina = await navegador.newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(e.message));
  await pagina.route("**slwifwjwtipoqtkhbhbr.supabase.co/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await pagina.goto("http://localhost:4433/", { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 4000));
  const texto = await pagina.locator("body").innerText();
  const monto = await pagina.evaluate(() => window.__autopirArranco === true);
  if (!monto) throw new Error("React NO montó con el html viejo:\n" + texto.slice(0, 300));
  if (errores.length) throw new Error("errores: " + errores.join("\n"));
  console.log("OK: con el index.html viejo (bundle con hash inexistente) la app arranca igual.");
} catch (e) { fallo = e; } finally { await navegador.close(); servidor.close(); }
if (fallo) { console.error("FALLO:", fallo.message); process.exit(1); }
