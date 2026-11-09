// Al pasar de tarjeta NO se puede ver, ni un fotograma, la respuesta de la que
// viene. NO la ejecuta `npm test`: necesita Playwright y un build hecho.
//
//   npm run build && node tests/transicion-tarjeta.mjs
//
// QUÉ SE MIDE Y POR QUÉ, que es lo que esta prueba tuvo que aprender a la
// fuerza: la primera versión medía solo el ÁNGULO de `.flip-inner` y daba por
// bueno un 0°, pero el ángulo no es la pregunta. Que la cara trasera esté
// girada 180° solo la esconde si el navegador aplica `backface-visibility`, y
// eso es una decisión de COMPOSICIÓN: sobre un nodo recién montado —que es
// exactamente lo que hay al cambiar de tarjeta— puede llegar un fotograma
// tarde, y entonces la respuesta se pinta aunque el ángulo diga 0. Así que lo
// que se comprueba ahora es `visibility`, que es estilo y se resuelve en el
// mismo cálculo que el resto, igual en todos los motores: con la tarjeta sin
// revelar la cara trasera tiene que estar en `hidden`, o sea que no hay
// píxeles que pintar y da igual lo que haga la composición.
//
// Se muestrea FOTOGRAMA A FOTOGRAMA dentro de la página (requestAnimationFrame),
// no sondeando desde fuera cada 45 ms: un destello de un fotograma se cuela
// entre dos sondeos.
//
// Tres comprobaciones, y las dos de control son las que impiden "arreglarlo"
// escondiendo la respuesta siempre o matando la animación:
//   A) tocar la tarjeta la gira Y la respuesta está visible durante todo el giro
//   B) al pasar de tarjeta, la respuesta está oculta en TODOS los fotogramas
//   C) tocar una tarjeta ya revelada deja ver el giro de vuelta entero
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
  const paso = () => {
    const inner = document.querySelector(".flip-inner");
    const back = document.querySelector(".flip-back");
    if (inner && back) {
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
        // textContent y NO innerText: innerText mira el layout y devuelve ""
        // en un elemento con visibility hidden, así que el corte de la ventana
        // se detectaría a sí mismo y la comprobación saldría trivial.
        txt: (back.textContent || "").replace(/\\s+/g, " ").trim(),
      });
    }
    if (performance.now() - t0 < ${ms}) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
})()`);
const leer = (pagina) => pagina.evaluate("window.__m");
const resumir = (m) => {
  const vistos = [...new Set(m.map((x) => x.v))].join("/");
  return `${m.length} fotogramas, visibility=${vistos}, giro ${m[0] ? m[0].g : "?"}°→${m.length ? m[m.length - 1].g : "?"}° (máx ${Math.max(...m.map((x) => x.g))}°)`;
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

  // --- CONTROL 0) con la tarjeta sin revelar, la respuesta no se pinta ---
  const enReposo = await pagina.evaluate(`getComputedStyle(document.querySelector(".flip-back")).visibility`);
  console.log(`0) tarjeta sin revelar: visibility de la respuesta = ${enReposo}`);
  if (enReposo !== "hidden") {
    throw new Error(`0) la respuesta se puede pintar con la tarjeta sin revelar (visibility=${enReposo}); así basta un fotograma de composición tardía para que se vea`);
  }

  // --- A) CONTROL: tocar la tarjeta la gira y la respuesta se ve TODO el giro ---
  await grabar(pagina, 700);
  await pagina.locator(".flip-container").click();
  await esperar(800);
  const a = await leer(pagina);
  console.log(`A) tocar la tarjeta: ${resumir(a)}`);
  const girando = a.filter((x) => x.g > 5 && x.g < 175);
  if (girando.length < 3) throw new Error(`A) el toque ya no anima: solo ${girando.length} fotogramas a medio giro`);
  const ocultaGirando = a.filter((x) => x.g > 5 && x.v !== "visible");
  if (ocultaGirando.length) {
    throw new Error(`A) la respuesta está oculta mientras la tarjeta gira hacia ella (${ocultaGirando.length} fotogramas): se vería la tarjeta en blanco`);
  }
  if (a[a.length - 1].g < 170) throw new Error(`A) no acaba enseñando el dorso: ${a[a.length - 1].g}°`);

  // --- B) EL FALLO: al pasar de tarjeta, ni un fotograma con la respuesta ---
  // La ventana se corta en el fotograma en que CAMBIA el texto de la cara
  // trasera, que es el instante exacto en que React ya ha puesto la tarjeta
  // nueva. Lo de antes de ese corte es la tarjeta vieja todavía revelada, que
  // es lo que se estaba mirando y tiene que verse; lo de después es la
  // respuesta de la que viene, y eso no puede pintarse ni un fotograma.
  await grabar(pagina, 700);
  await pagina.getByRole("button", { name: "Bien", exact: true }).click();
  await esperar(800);
  const b = await leer(pagina);
  const textoViejo = b[0] ? b[0].txt : "";
  const corte = b.findIndex((x) => x.txt !== textoViejo);
  console.log(`B) al pasar de tarjeta: ${resumir(b)}`);
  console.log(`B) la cara trasera pasa de ${JSON.stringify(textoViejo)} a ${JSON.stringify(corte >= 0 ? b[corte].txt : "")} en el fotograma ${corte} (${corte >= 0 ? b[corte].t : "?"} ms)`);
  console.log("B) desde ahí: " + b.slice(corte, corte + 6).map((x) => `${x.t}ms ${x.g}° ${x.v}`).join(" | "));
  if (corte < 0) throw new Error("B) la tarjeta no cambió: no hay nada que medir");
  const despues = b.slice(corte);
  const visibles = despues.filter((x) => x.v !== "hidden");
  const maximo = Math.max(...despues.map((x) => x.g));
  if (visibles.length) {
    const q = visibles[0];
    throw new Error(`B) la respuesta de la tarjeta que viene se puede pintar al pasar: ${visibles.length} de ${despues.length} fotogramas con visibility=${q.v} (el primero a los ${q.t} ms, giro ${q.g}°, texto ${JSON.stringify(q.txt)})`);
  }
  if (maximo > 15) {
    throw new Error(`B) además gira: el interior llega a ${maximo}° con la tarjeta nueva puesta (debería quedarse en 0°)`);
  }
  const textoDelante = await pagina.evaluate(`document.querySelector(".flip-container").innerText`);
  if (!/Frente/.test(textoDelante)) throw new Error("B) no se está enseñando el frente: " + textoDelante);

  // --- C) CONTROL: la siguiente gira igual, y el giro de VUELTA se ve entero ---
  await grabar(pagina, 700);
  await pagina.locator(".flip-container").click();
  await esperar(800);
  const c1 = await leer(pagina);
  console.log(`C) la tarjeta siguiente anima al tocarla: ${resumir(c1)}`);
  if (c1.filter((x) => x.g > 5 && x.g < 175).length < 3) {
    throw new Error("C) la tarjeta nueva ya no anima al tocarla");
  }
  // Y al tocarla otra vez, vuelve a la pregunta girando: la respuesta tiene que
  // seguir pintándose durante ese giro de vuelta, o se vería un hueco.
  await grabar(pagina, 700);
  await pagina.locator(".flip-container").click();
  await esperar(800);
  const c2 = await leer(pagina);
  console.log(`C) giro de vuelta a la pregunta: ${resumir(c2)}`);
  const huecos = c2.filter((x) => x.g > 95 && x.v !== "visible");
  if (huecos.length) {
    throw new Error(`C) al volver a la pregunta la respuesta desaparece antes de dejar de mirar al usuario (${huecos.length} fotogramas): se ve la tarjeta vacía`);
  }
  const alFinal = c2[c2.length - 1];
  if (alFinal.g > 15 || alFinal.v !== "hidden") {
    throw new Error(`C) al acabar el giro de vuelta no queda oculta: giro ${alFinal.g}°, visibility ${alFinal.v}`);
  }

  if (errores.length) throw new Error("errores JS: " + errores.join(" | "));
  await ctx.close();
  console.log("\nOK: al pasar de tarjeta la respuesta no se puede pintar en ningún fotograma, y los dos giros se siguen viendo enteros");
} catch (e) { fallo = e; } finally { await navegador.close(); servidor.kill(); }

if (fallo) { console.error("\nFALLA:", fallo.message); process.exit(1); }
