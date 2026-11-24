// Apuntes de un mazo: el botón a la derecha de "Importar tarjetas", subir una
// imagen, verla en grande y borrarla.
// NO la ejecuta `npm test`: necesita Playwright y un build hecho.
//
//   npm run build && node tests/apuntes-mazo.mjs
//
// Lo que vale aquí es MIRAR QUÉ PETICIONES SALEN, no la pantalla: la imagen
// tiene que ir al bucket `apuntes` dentro de la carpeta del usuario (es lo que
// exigen las políticas de Storage) y su ficha a `apuntes_mazo` con el nombre
// del mazo. `rutaApunte`, `hayQueReducir` y compañía se prueban aparte en
// `apuntes.test.mjs`; esto cubre el cableado.
//
// OJO: se escribió en una sesión sin acceso al registro de npm (sin
// node_modules, ni build ni Playwright de proyecto), así que la primera vez
// que se ejecute es también la primera vez que se comprueba ella misma.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const PUERTO = 4547, SB = "slwifwjwtipoqtkhbhbr.supabase.co", UID = "u1";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const tarjetas = [
  { id: "t0", user_id: UID, mazo: "Young", frontal: "Abandono / Inestabilidad", posterior: "Desconexión y rechazo", etiquetas: [], grupo_id: "t0" },
  { id: "t1", user_id: UID, mazo: "Otro", frontal: "F", posterior: "P", etiquetas: [], grupo_id: "t1" },
];
const apuntes = [{ id: "ap0", user_id: UID, mazo: "Young", ruta: `${UID}/ap0.png`, created_at: "2026-11-24T10:00:00Z" }];
const peticiones = [];

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const ctx = await navegador.newContext({ viewport: { width: 1024, height: 1100 } });
await ctx.addInitScript(() => {
  localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
    access_token: "x", refresh_token: "y", expires_at: 9999999999,
    user: { id: "u1", email: "pabloadmin@ruta-pir.local", user_metadata: { username: "pabloadmin" } },
  }));
});
const pagina = await ctx.newPage();
const errores = [];
pagina.on("pageerror", (e) => errores.push(e.message));

// Una imagen de verdad para subir y para servir: una captura de la propia página.
await pagina.setContent("<div style='width:200px;height:120px;background:#c33'></div>");
const png = await pagina.screenshot({ clip: { x: 0, y: 0, width: 200, height: 120 } });

const json = (r, b, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
// En Playwright gana la ruta registrada DESPUÉS: el comodín va primero.
await pagina.route(`**${SB}/rest/**`, (r) => json(r, []));
await pagina.route(`**${SB}/auth/**`, (r) => json(r, {}));
await pagina.route(`**${SB}/rest/v1/flashcards?**`, (r) => json(r, r.request().method() === "GET" ? tarjetas : []));
await pagina.route(`**${SB}/rest/v1/apuntes_mazo**`, (r) => {
  const m = r.request().method();
  if (m === "GET") return json(r, apuntes);
  peticiones.push({ tabla: "apuntes_mazo", metodo: m, url: r.request().url(), cuerpo: r.request().postData() });
  if (m === "POST") {
    const filas = JSON.parse(r.request().postData() || "[]");
    return json(r, filas.map((f) => ({ user_id: UID, created_at: new Date().toISOString(), ...f })), 201);
  }
  return json(r, []);
});
await pagina.route(`**${SB}/storage/v1/**`, (r) => {
  const m = r.request().method(), url = r.request().url();
  if (m === "POST" && /\/object\/sign\/apuntes$/.test(url)) {
    const { paths } = JSON.parse(r.request().postData() || "{}");
    return json(r, paths.map((p) => ({ path: p, signedURL: `/object/sign/apuntes/${p}?token=t`, error: null })));
  }
  if (m === "GET" && url.includes("/object/sign/apuntes/")) {
    return r.fulfill({ status: 200, contentType: "image/png", body: png });
  }
  peticiones.push({ tabla: "storage", metodo: m, url, cuerpo: m === "DELETE" ? r.request().postData() : null });
  if (m === "POST") return json(r, { Key: url.split("/object/")[1], Id: "x" });
  return json(r, []);
});

await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
await esperar(5000);
await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
await esperar(800);
await pagina.getByText("Young", { exact: true }).first().click();
await esperar(800);
await pagina.getByRole("button", { name: /Ver, añadir y editar/i }).click();
await esperar(600);

// 1. El botón está, a la derecha de "Importar tarjetas", y cuenta las imágenes.
const importar = await pagina.getByRole("button", { name: /Importar tarjetas/ }).boundingBox();
const boton = pagina.getByRole("button", { name: /^Apuntes/ });
assert.equal(await boton.count(), 1, "no aparece el botón de Apuntes");
assert.match(await boton.innerText(), /Apuntes \(1\)/, "el botón no cuenta la imagen que ya había");
const cajaBoton = await boton.boundingBox();
assert.ok(Math.abs(cajaBoton.y - importar.y) < 4 && cajaBoton.x > importar.x, "Apuntes no está a la derecha de Importar tarjetas");

// 2. Al abrirlo se ve la imagen que ya había, pedida con una URL firmada.
await boton.click();
await esperar(800);
const imgs = pagina.locator('img[alt="Apunte del mazo Young"]');
assert.equal(await imgs.count(), 1, "no se ve la imagen guardada");
assert.match(await imgs.first().getAttribute("src"), /object\/sign\/apuntes\/u1\/ap0\.png\?token=t/);
assert.ok(await imgs.first().evaluate((i) => i.complete && i.naturalWidth > 0), "la imagen no llegó a cargar");

// 3. Verla en grande: tocarla NO amplía (eso es pellizcar), el trackpad sí,
//    arrastrarla hacia abajo la cierra, y Escape también.
const dialogo = pagina.getByRole("dialog");
const escalaVisor = () => pagina.evaluate(() => {
  const m = /scale\(([-\d.e]+)\)/.exec(document.querySelector('[role="dialog"] img').style.transform);
  return m ? Number(m[1]) : null;
});
await imgs.first().click();
await esperar(400);
assert.equal(await dialogo.count(), 1, "no se abre la imagen en grande");
await pagina.mouse.click(500, 500);
await esperar(300);
assert.equal(await escalaVisor(), 1, "tocar la imagen la ha ampliado");
assert.equal(await dialogo.count(), 1, "tocar la imagen la ha cerrado");
for (let i = 0; i < 8; i++) {
  await pagina.evaluate(() => document.querySelector('[role="dialog"]').dispatchEvent(
    new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 500, clientY: 500, deltaY: -20, ctrlKey: true })));
}
assert.ok((await escalaVisor()) > 1.5, "el pellizco del trackpad no amplía");
await pagina.keyboard.press("Escape");
await esperar(400);
assert.equal(await dialogo.count(), 0, "Escape no cierra la imagen en grande");
await imgs.first().click();
await esperar(400);
await pagina.mouse.move(500, 400);
await pagina.mouse.down();
for (let i = 1; i <= 10; i++) { await pagina.mouse.move(500, 400 + i * 30); await esperar(16); }
await pagina.mouse.up();
await esperar(400);
assert.equal(await dialogo.count(), 0, "arrastrar hacia abajo no cierra la imagen en grande");

// 4. Subir otra: un PNG pequeño va tal cual, a la carpeta del usuario, y su
//    ficha lleva el mazo.
await pagina.locator('input[type="file"]').setInputFiles({ name: "tabla.png", mimeType: "image/png", buffer: png });
await esperar(1500);
const subida = peticiones.find((p) => p.tabla === "storage" && p.metodo === "POST");
assert.ok(subida, "no se subió nada al bucket");
assert.match(subida.url, /\/object\/apuntes\/u1\/[\w-]+\.png$/, `ruta inesperada: ${subida.url}`);
const ficha = peticiones.find((p) => p.tabla === "apuntes_mazo" && p.metodo === "POST");
assert.ok(ficha, "no se guardó la ficha del apunte");
const fila = JSON.parse(ficha.cuerpo)[0];
assert.equal(fila.mazo, "Young");
assert.equal(`/object/apuntes/${fila.ruta}`, subida.url.slice(subida.url.indexOf("/object/")), "la ficha no apunta al fichero subido");
assert.equal(await imgs.count(), 2, "la imagen subida no aparece en el panel");

// 5. Borrar la primera: la ficha por id y el fichero del bucket.
await pagina.getByRole("button", { name: /Borrar imagen/ }).first().click();
await pagina.getByRole("button", { name: /Sí, borrar/ }).click();
await esperar(1000);
const borradoFicha = peticiones.find((p) => p.tabla === "apuntes_mazo" && p.metodo === "DELETE");
assert.ok(borradoFicha && /id=eq\.ap0/.test(borradoFicha.url), "no se borró la ficha por su id");
const borradoFichero = peticiones.find((p) => p.tabla === "storage" && p.metodo === "DELETE");
assert.ok(borradoFichero && borradoFichero.cuerpo.includes("u1/ap0.png"), "no se borró el fichero del bucket");
assert.equal(await imgs.count(), 1, "la imagen borrada sigue en el panel");

// 6. En "Todas las tarjetas" no hay mazo al que colgarle la imagen.
await pagina.getByRole("button", { name: /Mazos/i }).first().click();
await esperar(600);
await pagina.getByText("Todas las tarjetas").first().click();
await esperar(600);
await pagina.getByRole("button", { name: /Ver, añadir y editar/i }).click().catch(() => {});
await esperar(400);
assert.equal(await pagina.getByRole("button", { name: /^Apuntes/ }).count(), 0, "Apuntes sale también fuera de un mazo");

assert.deepEqual(errores, [], `errores de JS: ${errores.join(" | ")}`);
console.log("OK: apuntes de un mazo");
await navegador.close();
servidor.kill();
