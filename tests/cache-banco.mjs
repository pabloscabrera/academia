// Comprueba en un navegador de verdad que el banco solo se vuelve a descargar
// cuando ha cambiado algo. NO la ejecuta `npm test`: necesita Playwright y un
// build hecho.
//
//   npm run build && node tests/cache-banco.mjs
//
// Lo que se prueba es justo lo que no se ve desde `npm test`: que la sonda
// (recuento + sello) se manda de verdad, que el sello se guarda en IndexedDB y
// que una corrección de texto —que no cambia el recuento— provoca una descarga
// nueva. Se mide contando las peticiones del banco completo, no leyendo el
// estado de React.

import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4397;
const URL_SUPABASE = "slwifwjwtipoqtkhbhbr.supabase.co";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const PREGUNTAS = [
  { id: "p1", curso: "PIR 23", tema: "Pregunta 11", pregunta: "¿Una pregunta?",
    opciones: ["a", "b", "c", "d"], correcta: 0, explicacion: null, inventada: false,
    created_at: "2026-01-01T00:00:00+00:00", actualizado_en: "2026-10-01T10:00:00+00:00" },
];

const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
await esperar(4000);

let fallo = null;
const ejecutable = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const navegador = await chromium.launch(ejecutable ? { executablePath: ejecutable } : {});
try {
  // Un solo contexto para las tres cargas: IndexedDB tiene que sobrevivir de
  // una a la siguiente, que es de lo que va la prueba.
  const contexto = await navegador.newContext();
  const contadores = { completas: 0, recuentos: 0, sellos: 0 };
  let selloServidor = PREGUNTAS[0].actualizado_en;
  let selloRoto = false;

  await contexto.addInitScript(() => {
    localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
      access_token: "x", refresh_token: "y", expires_at: 9999999999,
      user: { id: "u1", email: "prueba@ruta-pir.local", user_metadata: { username: "prueba" } },
    }));
  });

  // En Playwright gana la ruta registrada DESPUÉS, así que los comodines van
  // primero y la de `preguntas` encima; al revés, el comodín se las comía y la
  // prueba medía cero descargas sin que nada estuviera mal.
  await contexto.route(`**${URL_SUPABASE}/rest/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await contexto.route(`**${URL_SUPABASE}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  await contexto.route(`**${URL_SUPABASE}/rest/v1/preguntas*`, (ruta) => {
    const url = ruta.request().url();
    const metodo = ruta.request().method();
    if (process.env.DEPURA) console.log("REQ", metodo, decodeURIComponent(url.split("/rest/v1/")[1] || url));
    // El comodín `preguntas*` también pilla `preguntas_progreso`: hay que
    // mirar la tabla exacta o se cuentan peticiones ajenas como descargas.
    const tabla = (url.split("/rest/v1/")[1] || "").split("?")[0];
    if (tabla !== "preguntas") {
      return ruta.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (metodo === "HEAD" || /\bselect=id\b/.test(url)) {
      contadores.recuentos += 1;
      return ruta.fulfill({ status: 200, contentType: "application/json",
        headers: { "content-range": `0-0/${PREGUNTAS.length}` }, body: "" });
    }
    if (/select=actualizado_en/.test(url)) {
      contadores.sellos += 1;
      if (selloRoto) {
        return ruta.fulfill({ status: 400, contentType: "application/json",
          body: JSON.stringify({ code: "42703", message: 'column preguntas.actualizado_en does not exist' }) });
      }
      return ruta.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify([{ actualizado_en: selloServidor }]) });
    }
    contadores.completas += 1;
    return ruta.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify(PREGUNTAS.map((p) => ({ ...p, actualizado_en: selloServidor }))) });
  });
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(e.message));

  const cargar = async () => {
    await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
    await esperar(5000);
    const texto = await pagina.locator("body").innerText();
    if (texto.includes("Algo se ha roto")) throw new Error("la app se rompió:\n" + texto.slice(0, 400));
    if (!texto.includes("Autoevaluaciones")) throw new Error("no se pintó la pantalla de dentro:\n" + texto.slice(0, 300));
  };

  // 1) Primera visita: no hay copia local, así que se descarga el banco.
  await cargar();
  if (contadores.completas !== 1) throw new Error(`1ª carga: se esperaba 1 descarga completa, hubo ${contadores.completas}`);
  const sello1 = await pagina.evaluate(() => new Promise((res) => {
    const p = indexedDB.open("autopir", 1);
    p.onsuccess = () => {
      const g = p.result.transaction("cache", "readonly").objectStore("cache").get("preguntas");
      g.onsuccess = () => res(g.result ? g.result.sello : null);
      g.onerror = () => res("ERROR");
    };
    p.onerror = () => res("ERROR");
  }));
  if (sello1 !== selloServidor) throw new Error(`el sello guardado es ${sello1}, se esperaba ${selloServidor}`);

  // 2) Segunda visita sin cambios: la sonda sale, el banco no.
  const antes = contadores.completas;
  await cargar();
  // En la 1ª carga no hay copia que comprobar, así que la sonda no se manda:
  // el primer sello pedido es el de esta segunda visita.
  if (contadores.sellos !== 1) throw new Error(`se esperaba 1 sondeo del sello, hubo ${contadores.sellos}`);
  if (contadores.recuentos !== 1) throw new Error(`se esperaba 1 recuento, hubo ${contadores.recuentos}`);
  if (contadores.completas !== antes) throw new Error(`2ª carga: no debía descargar nada, hubo ${contadores.completas - antes}`);

  // 3) Una corrección de texto: mismo recuento, sello nuevo. Debe descargar.
  selloServidor = "2026-10-05T09:00:00+00:00";
  await cargar();
  if (contadores.completas !== antes + 1) throw new Error(`3ª carga: se esperaba 1 descarga tras cambiar el sello, hubo ${contadores.completas - antes}`);

  // 4) Sin la migración ejecutada, la consulta del sello es un 400 ("column
  // does not exist"). La app tiene que seguir abriendo y caer al criterio
  // viejo —recuento y caducidad—, no quedarse en blanco ni descargar en bucle.
  selloRoto = true;
  const antes4 = contadores.completas;
  await cargar();
  if (contadores.completas !== antes4) {
    throw new Error(`sin la columna no debía descargar (copia reciente), hubo ${contadores.completas - antes4}`);
  }

  if (errores.length) throw new Error("errores en el navegador:\n" + errores.join("\n"));
  console.log(`OK: descargas=${contadores.completas} (1 inicial + 1 tras la corrección), recuentos=${contadores.recuentos}, sellos=${contadores.sellos}`);
} catch (err) {
  fallo = err;
} finally {
  await navegador.close();
  servidor.kill();
}

if (fallo) { console.error("FALLO:", fallo.message); process.exit(1); }
