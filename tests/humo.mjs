// Prueba de humo en un navegador de verdad. NO la ejecuta `npm test` (que
// solo coge `tests/*.test.mjs`): esto necesita Playwright y un build hecho.
//
//   npm run build && node tests/humo.mjs
//
// Existe porque `npm test` y `npm run build` no ven los fallos que más duelen:
// un ReferenceError al dibujar desmonta el árbol entero y deja la pantalla
// vacía. Pasó de verdad — un efecto colocado encima del `useState` que lee,
// así que su array de dependencias tocaba `state` antes de existir — y desde
// fuera era indistinguible de "la app no abre".
//
// Finge una sesión y responde a Supabase con listas vacías, así que comprueba
// que la app entra y dibuja, no que los datos sean correctos.

import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4399;
const URL_SUPABASE = "slwifwjwtipoqtkhbhbr.supabase.co";

const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

let fallo = null;
// En este contenedor el navegador que trae Playwright no coincide con el que
// espera la versión instalada; PLAYWRIGHT_CHROMIUM permite apuntar al que hay.
const ejecutable = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const navegador = await chromium.launch(ejecutable ? { executablePath: ejecutable } : {});
try {
  const pagina = await navegador.newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(e.message));

  await pagina.addInitScript(() => {
    localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
      access_token: "x", refresh_token: "y", expires_at: 9999999999,
      user: { id: "u1", email: "prueba@ruta-pir.local", user_metadata: { username: "prueba" } },
    }));
  });
  await pagina.route(`**${URL_SUPABASE}/rest/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await pagina.route(`**${URL_SUPABASE}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await esperar(6000);
  const texto = await pagina.locator("body").innerText();

  if (texto.includes("Algo se ha roto")) throw new Error("la app se rompió al dibujar:\n" + texto);
  if (!texto.includes("Autoevaluaciones")) throw new Error("no se pintó la pantalla de dentro:\n" + texto.slice(0, 300));
  if (errores.length) throw new Error("errores en el navegador:\n" + errores.join("\n"));

  console.log("OK: la app entra y dibuja la pantalla de dentro, sin errores.");
} catch (err) {
  fallo = err;
} finally {
  await navegador.close();
  servidor.kill();
}

if (fallo) { console.error("FALLO:", fallo.message); process.exit(1); }
