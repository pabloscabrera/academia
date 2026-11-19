// Ningún botón de guardar puede quedarse en "Guardando..." para siempre.
// NO la ejecuta `npm test` (que solo coge `tests/*.test.mjs`): necesita
// Playwright y un build hecho.
//
//   npm run build && node tests/boton-no-se-queda-pillado.mjs
//
// El usuario mandó una captura con el botón "Añadiendo..." gris y nada más
// pasando ("Se ha quedado pillado"). El patrón de toda la app era
// `set(true)` → `await` → `set(false)`, y eso tiene DOS agujeros:
//
//  1. Si lo de en medio LANZA, el `throw` se salta el `set(false)` y la
//     bandera se queda en `true`: botón muerto para siempre y sin aviso.
//     Lo cierra `conBandera`, cuyo `finally` se ejecuta pase lo que pase.
//  2. Si lo de en medio NO VUELVE, el `set(false)` tampoco llega. De eso se
//     ocupa `conTiempoLimite` dentro de `escribir`... salvo donde se escribía
//     sin pasar por `escribir`, que era justo el caso de `deleteFlashcard`:
//     tras borrar la tarjeta esperaba a un `delete` de `flashcards_progreso`
//     SIN plazo y cuyo resultado nadie lee. Con ese endpoint mudo, "Borrando..."
//     se quedaba ahí para siempre. Ese es el escenario A, y es el que FALLA
//     con el código viejo.
//
// Lo que se mira es el TEXTO del botón, no la captura: la bandera es
// exactamente lo que ese texto dibuja.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4476, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

// Un mazo con UNA tarjeta: al borrarla no quedan copias del grupo, que es la
// condición que dispara la limpieza del progreso.
const tarjetas = [{
  id: "t0", user_id: "u1", mazo: "Porcentajes", frontal: "Frente 0", posterior: "Dorso 0",
  etiquetas: [], grupo_id: null,
}];

let fallo = null;
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });

async function abrirMazo(comoResponde) {
  const ctx = await navegador.newContext({ viewport: { width: 430, height: 950 } });
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
  // El comodín va PRIMERO: en Playwright gana la ruta registrada después.
  await pagina.route(`**${SB}/rest/**`, (r) => json(r, []));
  await pagina.route(`**${SB}/rest/v1/flashcards?**`, (r) => {
    const m = r.request().method();
    if (m === "GET") return json(r, tarjetas);
    if (comoResponde.flashcards === "mudo") return;            // nunca contesta
    if (comoResponde.flashcards === "rechaza") {
      return json(r, { code: "42501", message: "new row violates row-level security policy" }, 403);
    }
    return json(r, [{ ...tarjetas[0], id: "nueva", frontal: "F", posterior: "D" }]);
  });
  await pagina.route(`**${SB}/rest/v1/flashcards_progreso?**`, (r) => {
    if (r.request().method() === "GET") return json(r, []);
    if (comoResponde.progreso === "mudo") return;              // nunca contesta
    return json(r, []);
  });
  await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await esperar(5000);
  await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
  await esperar(800);
  await pagina.getByText("Porcentajes", { exact: false }).first().click();
  await esperar(900);
  // Los botones de una tarjeta (Editar/Borrar) y el formulario de añadir
  // viven en la lista, que está plegada: hay que desplegarla.
  await pagina.getByRole("button", { name: /Ver, añadir y editar/ }).click();
  await esperar(700);
  return { pagina, ctx, errores, texto: () => pagina.locator("body").innerText() };
}

// Espera hasta `limite` ms a que el botón deje de decir `ocupado`. Devuelve
// cuánto tardó, o null si seguía pillado al agotarse el tiempo.
async function esperarADesbloquear(boton, ocupado, limite) {
  const t0 = Date.now();
  while (Date.now() - t0 < limite) {
    const t = (await boton.innerText()).trim();
    if (!new RegExp(ocupado, "i").test(t)) return Date.now() - t0;
    await esperar(250);
  }
  return null;
}

try {
  // --- A) Borrar una tarjeta con el `delete` del PROGRESO mudo -------------
  // El borrado de la tarjeta sale bien; lo que no contesta es la limpieza del
  // progreso, que iba con un `await` SIN plazo. Honestamente: el botón ahí no
  // se veía pillado, porque la fila se quita de la lista antes de esa espera y
  // se lleva el botón con ella — pero `deleteFlashcard` se quedaba colgada
  // para siempre, y lo que viene después (quitar el progreso huérfano de la
  // copia local) no llegaba a ejecutarse nunca. Lo que se comprueba es que el
  // borrado termina: la tarjeta se va y la lista queda vacía.
  {
    const { pagina, ctx, errores, texto } = await abrirMazo({ progreso: "mudo" });
    await pagina.getByRole("button", { name: /Frente 0/ }).first().click();
    await esperar(400);
    await pagina.getByRole("button", { name: /^Borrar$/ }).first().click();
    await esperar(300);
    await pagina.getByRole("button", { name: /Seguro\? Borrar/ }).first().click();
    // 6 s: por debajo de los 10 del plazo de escritura, así que si termina es
    // porque ya no espera a esa limpieza, no porque un plazo lo haya rescatado.
    let sigue = true;
    for (let i = 0; i < 24 && sigue; i++) { await esperar(250); sigue = /Frente 0/.test(await texto()); }
    console.log("A) progreso mudo · ¿sigue la tarjeta?:", sigue);
    if (sigue) throw new Error("A) la tarjeta no se quitó: el borrado no terminó");
    if (errores.length) throw new Error("A) errores JS: " + errores.join(" | "));
    await ctx.close();
  }

  // --- B) Añadir una tarjeta con el servidor MUDO -------------------------
  // Aquí el rescate es el plazo de 10 s de `escribir`, así que se le dan 14.
  // Dos cosas: que el botón vuelva Y que a los 3 s la pantalla DIGA que sigue
  // intentándolo. Sin ese aviso son diez segundos de botón gris mudo, que es
  // exactamente lo que el usuario vio y llamó "se ha quedado pillado".
  {
    const { pagina, ctx, errores, texto } = await abrirMazo({ flashcards: "mudo" });
    await pagina.getByRole("button", { name: /Añadir tarjeta/ }).first().click();
    await esperar(400);
    const areas = pagina.locator("textarea");
    await areas.nth(0).fill("Pregunta de prueba");
    await areas.nth(1).fill("Respuesta de prueba");
    await esperar(200);
    const boton = pagina.getByRole("button", { name: /^(Añadir tarjeta|Añadiendo\.\.\.)$/ }).last();
    await boton.click();
    await esperar(700);
    const enMarcha = (await boton.innerText()).trim();
    // A los 4 s (el aviso salta a los 3) tiene que haber un cartel, y NO el
    // rojo de fallo: todavía no ha fallado nada.
    await esperar(3500);
    const esperando = (await texto()).match(/[^\n]*tardando más de lo normal[^\n]*/);
    const recargarDurante = await pagina.getByRole("button", { name: "Recargar la página" }).count();
    const tardo = await esperarADesbloquear(boton, "Añadiendo", 14000);
    const aviso = (await texto()).match(/[^\n]*Añadir la tarjeta[^\n]*/);
    console.log("B) servidor mudo · mientras:", enMarcha, "· se desbloqueó en:", tardo, "ms");
    console.log("B) aviso de espera:", esperando && esperando[0], "| ¿botón de recargar?:", recargarDurante);
    console.log("B) aviso final:", aviso && aviso[0]);
    if (!/Añadiendo/i.test(enMarcha)) throw new Error("B) el botón no llegó a decir 'Añadiendo...': " + enMarcha);
    if (!esperando) throw new Error("B) la pantalla se quedó muda durante la espera");
    // Recargar a mitad de una escritura abandona lo que se está guardando, así
    // que ese botón no puede estar en el aviso de espera.
    if (recargarDurante !== 0) throw new Error("B) el aviso de espera ofrecía recargar");
    if (tardo === null) throw new Error("B) 'Añadiendo...' se quedó pillado con el servidor mudo");
    if (!aviso || !/no contesta|conexión/i.test(aviso[0])) {
      throw new Error("B) no se avisó de que el servidor no contesta: " + (aviso && aviso[0]));
    }
    if (errores.length) throw new Error("B) errores JS: " + errores.join(" | "));
    await ctx.close();
  }

  // --- C) Añadir una tarjeta con el servidor RECHAZANDO (42501) -----------
  // Un rechazo vuelve enseguida, así que el botón tiene que recuperarse rápido
  // Y salir el aviso de permisos. Y lo escrito no se pierde.
  {
    const { pagina, ctx, errores, texto } = await abrirMazo({ flashcards: "rechaza" });
    await pagina.getByRole("button", { name: /Añadir tarjeta/ }).first().click();
    await esperar(400);
    const areas = pagina.locator("textarea");
    await areas.nth(0).fill("Pregunta rechazada");
    await areas.nth(1).fill("Respuesta rechazada");
    await esperar(200);
    const boton = pagina.getByRole("button", { name: /^(Añadir tarjeta|Añadiendo\.\.\.)$/ }).last();
    await boton.click();
    const tardo = await esperarADesbloquear(boton, "Añadiendo", 6000);
    const aviso = (await texto()).match(/[^\n]*Añadir la tarjeta[^\n]*/);
    const sigueEscrito = await areas.nth(0).inputValue();
    console.log("C) servidor rechaza · se desbloqueó en:", tardo, "ms");
    console.log("C) aviso:", aviso && aviso[0]);
    if (tardo === null) throw new Error("C) 'Añadiendo...' se quedó pillado con el servidor rechazando");
    if (!aviso || !/permisos/i.test(aviso[0])) {
      throw new Error("C) un rechazo del servidor no se dijo en voz alta: " + (aviso && aviso[0]));
    }
    // Si el formulario se vaciara, lo escrito se perdería por un fallo que no
    // es del usuario y habría que teclearlo otra vez.
    if (sigueEscrito !== "Pregunta rechazada") throw new Error("C) se vació el formulario tras un fallo: " + sigueEscrito);
    if (errores.length) throw new Error("C) errores JS: " + errores.join(" | "));
    await ctx.close();
  }

  console.log("OK: ningún botón se queda pillado — ni con el servidor mudo, ni rechazando, ni con una limpieza que no vuelve.");
} catch (e) { fallo = e; } finally { await navegador.close(); servidor.kill(); }
if (fallo) { console.error("FALLO:", fallo.message); process.exit(1); }
