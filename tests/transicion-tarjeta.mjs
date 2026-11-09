// Al pasar de tarjeta NO se puede ver, ni un fotograma, la respuesta de la que
// viene. NO la ejecuta `npm test`: necesita Playwright y un build hecho.
//
//   npm run build && node tests/transicion-tarjeta.mjs
//
// QUÉ SE MIDE, QUE ES LO QUE ESTA PRUEBA HA TENIDO QUE APRENDER DOS VECES.
// La primera versión medía el ÁNGULO de `.flip-inner` y daba por bueno un 0°.
// La segunda medía la `visibility` de la cara trasera y daba por bueno un
// `hidden`. Las dos pasaban y el usuario seguía viendo la respuesta. Las dos
// medían lo MISMO sin saberlo: si el navegador consigue esconder un texto que
// SÍ está escrito en la página. El ángulo depende de que aplique
// `backface-visibility` (composición, que puede llegar un fotograma tarde) y
// `visibility` depende de que el estilo calculado llegue al pintado antes que
// el contenido nuevo. Las dos son promesas del motor, y este contenedor solo
// tiene Chromium: con Safari no hay forma de comprobarlas aquí.
//
// Así que lo que se mide ahora NO es una promesa del motor: que el texto de la
// respuesta de la tarjeta que viene NO ESTÉ en la página. Lo que no está
// escrito no lo puede pintar ningún navegador, ni tarde ni temprano.
//
// Se muestrea fotograma a fotograma dentro de la página (requestAnimationFrame),
// no sondeando desde fuera cada 45 ms: un destello de un fotograma se cuela
// entre dos sondeos.
//
// Cuatro comprobaciones, y las de control son las que impiden "arreglarlo"
// dejando la respuesta fuera siempre o matando la animación:
//   0) con la tarjeta sin revelar, la respuesta no está escrita
//   A) tocar la tarjeta la gira Y la respuesta está escrita y visible todo el giro
//   B) al pasar, la respuesta de la nueva no está escrita en ningún fotograma
//   C) el giro de vuelta a la pregunta se ve entero
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4495, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const tarjetas = Array.from({ length: 6 }, (_, i) => ({
  id: "t" + i, user_id: "u1", mazo: "Porcentajes", frontal: "Frente " + i, posterior: "Dorso " + i,
  etiquetas: [], grupo_id: null,
}));
const progreso = tarjetas.map((t, i) => ({
  id: "p" + i, name: "prueba", user_id: "u1", flashcard_id: t.id, ease_factor: 2.5,
  intervalo_dias: 9, repeticiones: 3, ultima_revision: `2026-10-0${(i % 5) + 1}T10:00:00.000Z`,
  proxima_revision: "2026-10-05",
}));

let fallo = null;
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });

// Arranca el muestreo por fotogramas. Guarda, de cada uno: el ángulo del
// interior (0 = se ve el frente, 180 = se ve el dorso), la `visibility` de la
// cara trasera y lo que dice su texto.
const grabar = (pagina, ms) => pagina.evaluate(`(() => {
  window.__m = [];
  const t0 = performance.now();
  // textContent y NO innerText: innerText mira el layout y devuelve "" en un
  // elemento oculto, así que no distinguiría "no está escrito" de "está
  // escrito pero tapado", que es justo la diferencia que hay que medir.
  const texto = (el) => (el && el.textContent ? el.textContent.replace(/\\s+/g, " ").trim() : "");
  const paso = () => {
    const inner = document.querySelector(".flip-inner");
    const back = document.querySelector(".flip-back");
    const front = document.querySelector(".flip-face:not(.flip-back)");
    if (inner && back && front) {
      const t = getComputedStyle(inner).transform;
      let g = 0;
      if (t && t !== "none") {
        const n = t.slice(t.indexOf("(") + 1, -1).split(",").map(Number);
        g = Math.round((Math.acos(Math.max(-1, Math.min(1, n[0]))) * 180) / Math.PI);
      }
      window.__m.push({
        t: Math.round(performance.now() - t0),
        g,
        v: getComputedStyle(back).visibility,
        frente: texto(front),
        dorso: texto(back),
      });
    }
    if (performance.now() - t0 < ${ms}) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
})()`);
const leer = (pagina) => pagina.evaluate("window.__m");
const resumir = (m) => {
  const vistos = [...new Set(m.map((x) => x.v))].join("/");
  const escrito = [...new Set(m.map((x) => (x.dorso ? "sí" : "no")))].join("/");
  return `${m.length} fotogramas, giro ${m[0] ? m[0].g : "?"}°→${m.length ? m[m.length - 1].g : "?"}° (máx ${Math.max(...m.map((x) => x.g))}°), respuesta escrita=${escrito}, visibility=${vistos}`;
};

try {
  const ctx = await navegador.newContext({ viewport: { width: 1024, height: 950 } });
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
  await pagina.route(`**${SB}/rest/v1/flashcards?**`, (r) => json(r, tarjetas));
  await pagina.route(`**${SB}/rest/v1/flashcards_progreso?**`, (r) => {
    if (r.request().method() === "GET") return json(r, progreso);
    let c = []; try { c = JSON.parse(r.request().postData() || "[]"); } catch {}
    return json(r, Array.isArray(c) ? c : [c]);
  });
  await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await esperar(5000);
  await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
  await esperar(800);
  await pagina.getByText("Porcentajes", { exact: false }).first().click();
  await esperar(800);
  await pagina.locator('input[type="number"]').fill("6");
  await pagina.locator('input[type="number"]').blur();
  await esperar(300);
  await pagina.getByRole("button", { name: "Empezar repaso" }).click();
  await esperar(800);

  // --- 0) con la tarjeta sin revelar, la respuesta NO está escrita ---
  const reposo = await pagina.evaluate(`(() => {
    const b = document.querySelector(".flip-back");
    return { txt: (b.textContent || "").trim(), v: getComputedStyle(b).visibility };
  })()`);
  console.log(`0) tarjeta sin revelar: respuesta escrita=${JSON.stringify(reposo.txt)}, visibility=${reposo.v}`);
  if (reposo.txt !== "") {
    throw new Error(`0) la respuesta está ESCRITA en la página con la tarjeta sin revelar (${JSON.stringify(reposo.txt)}); esconderla depende entonces de que el navegador la tape a tiempo, y eso no se puede prometer`);
  }
  if (reposo.v !== "hidden") throw new Error(`0) la cara trasera no está oculta: ${reposo.v}`);

  // --- A) CONTROL: tocar la tarjeta la gira y la respuesta se ve TODO el giro ---
  await grabar(pagina, 700);
  await pagina.locator(".flip-container").click();
  await esperar(800);
  const a = await leer(pagina);
  console.log(`A) tocar la tarjeta: ${resumir(a)}`);
  const girando = a.filter((x) => x.g > 5 && x.g < 175);
  if (girando.length < 3) throw new Error(`A) el toque ya no anima: solo ${girando.length} fotogramas a medio giro`);
  const mudos = a.filter((x) => x.g > 5 && (!x.dorso || x.v !== "visible"));
  if (mudos.length) {
    throw new Error(`A) la tarjeta gira hacia una respuesta que no se ve (${mudos.length} fotogramas sin texto o con visibility ${mudos[0].v}): se vería girar a una cara en blanco`);
  }
  if (a[a.length - 1].g < 170) throw new Error(`A) no acaba enseñando el dorso: ${a[a.length - 1].g}°`);

  // --- B) EL FALLO: al pasar, la respuesta de la nueva no está escrita ---
  // La ventana se corta en el fotograma en que cambia el texto del FRENTE, que
  // es cuando React ya ha puesto la tarjeta nueva. Lo de antes es la vieja
  // todavía revelada, que es lo que se estaba mirando y tiene que verse.
  await grabar(pagina, 700);
  await pagina.getByRole("button", { name: "Bien", exact: true }).click();
  await esperar(800);
  const b = await leer(pagina);
  const frenteViejo = b[0] ? b[0].frente : "";
  const corte = b.findIndex((x) => x.frente !== frenteViejo);
  console.log(`B) al pasar de tarjeta: ${resumir(b)}`);
  console.log(`B) el frente pasa de ${JSON.stringify(frenteViejo)} a ${JSON.stringify(corte >= 0 ? b[corte].frente : "")} en el fotograma ${corte} (${corte >= 0 ? b[corte].t : "?"} ms)`);
  if (corte < 0) throw new Error("B) la tarjeta no cambió: no hay nada que medir");
  console.log("B) desde ahí: " + b.slice(corte, corte + 6).map((x) => `${x.t}ms ${x.g}° ${x.v} dorso=${JSON.stringify(x.dorso)}`).join(" | "));
  const despues = b.slice(corte);
  const conTexto = despues.filter((x) => x.dorso !== "");
  if (conTexto.length) {
    const q = conTexto[0];
    throw new Error(`B) la respuesta de la tarjeta que viene está escrita en la página al pasar: ${conTexto.length} de ${despues.length} fotogramas (el primero a los ${q.t} ms, giro ${q.g}°, visibility ${q.v}, texto ${JSON.stringify(q.dorso)})`);
  }
  const maximo = Math.max(...despues.map((x) => x.g));
  if (maximo > 15) throw new Error(`B) además gira: el interior llega a ${maximo}° con la tarjeta nueva puesta`);
  const visibles = despues.filter((x) => x.v !== "hidden");
  if (visibles.length) throw new Error(`B) la cara trasera se queda pintable (${visibles.length} fotogramas con visibility ${visibles[0].v})`);

  // --- C) CONTROL: la siguiente gira igual, y el giro de VUELTA se ve entero ---
  await grabar(pagina, 700);
  await pagina.locator(".flip-container").click();
  await esperar(800);
  const c1 = await leer(pagina);
  console.log(`C) la tarjeta siguiente anima al tocarla: ${resumir(c1)}`);
  if (c1.filter((x) => x.g > 5 && x.g < 175).length < 3) {
    throw new Error("C) la tarjeta nueva ya no anima al tocarla");
  }
  if (c1.filter((x) => x.g > 5 && !x.dorso).length) {
    throw new Error("C) la tarjeta nueva gira hacia una respuesta que no está escrita");
  }
  // Al tocarla otra vez vuelve a la pregunta girando: la respuesta tiene que
  // seguir escrita y visible durante ese giro de vuelta, o se vería un hueco.
  await grabar(pagina, 700);
  await pagina.locator(".flip-container").click();
  await esperar(800);
  const c2 = await leer(pagina);
  console.log(`C) giro de vuelta a la pregunta: ${resumir(c2)}`);
  const huecos = c2.filter((x) => x.g > 95 && (!x.dorso || x.v !== "visible"));
  if (huecos.length) {
    throw new Error(`C) al volver a la pregunta la respuesta desaparece antes de dejar de mirar al usuario (${huecos.length} fotogramas): se ve la tarjeta vacía`);
  }
  const alFinal = c2[c2.length - 1];
  if (alFinal.g > 15 || alFinal.v !== "hidden") {
    throw new Error(`C) al acabar el giro de vuelta no queda oculta: giro ${alFinal.g}°, visibility ${alFinal.v}`);
  }

  if (errores.length) throw new Error("errores JS: " + errores.join(" | "));
  await ctx.close();
  console.log("\nOK: al pasar de tarjeta la respuesta de la que viene no está escrita en ningún fotograma, y los dos giros se siguen viendo enteros");
} catch (e) { fallo = e; } finally { await navegador.close(); servidor.kill(); }

if (fallo) { console.error("\nFALLA:", fallo.message); process.exit(1); }
