// Recorrido del rediseño completo en un navegador de verdad:
// portada con su foto, fuentes cargadas, las cinco pestañas sin errores,
// Estadísticas y Perfil separados, y nada que desborde a 390 px.
//
//   npm run build && node tests/rediseno-pantallas.mjs

import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4405;
const URL_SUPABASE = "slwifwjwtipoqtkhbhbr.supabase.co";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const PREGUNTAS = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: `p${n}`, curso: "PIR 25", tema: `Pregunta ${n}`, pregunta: `Enunciado ${n}`,
  opciones: ["A", "B", "C", "D"], correcta: 0, explicacion: null, inventada: false,
  created_at: "2026-01-01T00:00:00+00:00", actualizado_en: "2026-10-01T10:00:00+00:00",
}));

const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
await esperar(4000);
const fallos = [];
const ejecutable = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const navegador = await chromium.launch(ejecutable ? { executablePath: ejecutable } : {});
const rutas = async (ctx) => {
  await ctx.route(`**${URL_SUPABASE}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route(`**${URL_SUPABASE}/rest/**`, (ruta) => {
    const url = ruta.request().url();
    const tabla = (url.split("/rest/v1/")[1] || "").split("?")[0];
    if (tabla === "favoritos") return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ pregunta_id: "p1", name: "prueba" }]) });
    if (tabla === "fallos") return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ pregunta_id: "p2", name: "prueba", veces: 2 }]) });
    if (tabla !== "preguntas") return ruta.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (ruta.request().method() === "HEAD" || /\bselect=id\b/.test(url)) {
      return ruta.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": `0-0/${PREGUNTAS.length}` }, body: "" });
    }
    if (/select=actualizado_en/.test(url)) return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ actualizado_en: "2026-10-01T10:00:00+00:00" }]) });
    return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PREGUNTAS) });
  });
};
const desborda = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

try {
  // 1) Portada, sin sesión.
  const c1 = await navegador.newContext({ viewport: { width: 390, height: 844 } });
  await rutas(c1);
  const p1 = await c1.newPage();
  const e1 = []; p1.on("pageerror", (e) => e1.push(e.message));
  await p1.goto(`http://localhost:${PUERTO}/`, { waitUntil: "load" });
  await p1.getByText("Iniciar sesión").waitFor({ timeout: 20000 });
  await esperar(800);
  const portada = await p1.evaluate(async () => {
    await document.fonts.ready;
    const img = document.querySelector('img[src="/img/portada.jpg"]');
    return {
      foto: !!img && img.complete && img.naturalWidth > 0,
      cabinet: document.fonts.check("800 30px 'Cabinet Grotesk'"),
      switzer: document.fonts.check("500 16px 'Switzer'"),
      inputs: document.querySelectorAll("input").length,
      texto: document.body.innerText.slice(0, 120),
    };
  });
  console.log("1) portada ->", JSON.stringify(portada));
  if (!portada.foto) fallos.push("la foto de la portada no carga");
  if (!/Bienvenido/i.test(portada.texto)) fallos.push("la portada no dice Bienvenido");
  if (portada.inputs < 2) fallos.push("faltan los campos de usuario y contraseña");
  if (await desborda(p1)) fallos.push("la portada desborda a 390 px");
  await p1.getByRole("button", { name: "Crear cuenta" }).first().click();
  if ((await p1.locator("input").count()) < 4) fallos.push("crear cuenta no muestra los cuatro campos");
  if (e1.length) fallos.push("errores en la portada: " + e1.join(" | "));

  // 2) Dentro, con sesión: las cinco pestañas.
  const c2 = await navegador.newContext({ viewport: { width: 390, height: 844 } });
  await c2.addInitScript(() => {
    sessionStorage.setItem("pir-pruebas-sin-portada", "1");
    localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
      access_token: "x", refresh_token: "y", expires_at: 9999999999,
      user: { id: "u1", email: "prueba@ruta-pir.local", user_metadata: { username: "prueba" } },
    }));
  });
  await rutas(c2);
  const p2 = await c2.newPage();
  const e2 = []; p2.on("pageerror", (e) => e2.push(e.message));
  await p2.goto(`http://localhost:${PUERTO}/`, { waitUntil: "load" });
  await p2.getByText("Elige", { exact: false }).first().waitFor({ timeout: 20000 });
  const fuentes = await p2.evaluate(async () => { await document.fonts.ready; return document.fonts.check("800 30px 'Cabinet Grotesk'"); });
  if (!fuentes) fallos.push("dentro de la app no carga Cabinet Grotesk");
  for (const [pestana, espera] of [["Flashcards", /Flashcards/i], ["Duelo", /Tres vidas cada uno/i], ["Estadísticas", /Tu PIR, en números/i], ["Perfil", /Favoritas \(1\)/i], ["Exámenes", /Elige/i]]) {
    await p2.locator("nav button", { hasText: pestana }).first().click();
    await esperar(700);
    const t = await p2.locator("body").innerText();
    console.log(`2) ${pestana} ->`, espera.test(t) ? "ok" : "NO", "| desborda:", await desborda(p2));
    if (t.includes("Algo se ha roto")) fallos.push(`${pestana} rompe la app`);
    if (!espera.test(t)) fallos.push(`${pestana} no pinta lo esperado`);
    if (await desborda(p2)) fallos.push(`${pestana} desborda a 390 px`);
  }
  // 3) Perfil: favoritas primero, se contesta antes de ver la respuesta; falladas con su recuento.
  await p2.locator("nav button", { hasText: "Perfil" }).first().click();
  await esperar(500);
  await p2.getByRole("button", { name: /Falladas \(1\)/ }).click();
  const tf = await p2.locator("body").innerText();
  if (!/fallada 2 veces/i.test(tf)) fallos.push("Falladas no muestra el recuento");
  // 4) Las pestañas van ARRIBA, bajo la cabecera, y se quedan ahí al
  // desplazar; los iconos van en la misma fila que la marca, a la derecha.
  await p2.evaluate(() => window.scrollTo(0, 3000));
  await esperar(200);
  const nav = await p2.evaluate(() => {
    const n = document.querySelector("nav.nav-app").getBoundingClientRect();
    const marca = document.querySelector(".cabecera-marca").getBoundingClientRect();
    const iconos = document.querySelector(".cabecera-iconos").getBoundingClientRect();
    const svg = document.querySelector(".cabecera-iconos svg").getBoundingClientRect();
    return {
      arriba: Math.round(n.top), alto: Math.round(n.height),
      mismaFila: Math.abs((marca.top + marca.height / 2) - (iconos.top + iconos.height / 2)) < 14,
      iconosDerecha: Math.round(window.innerWidth - iconos.right), icono: Math.round(svg.width),
      ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
    };
  });
  console.log("4) navegación ->", JSON.stringify(nav));
  if (nav.arriba > 120) fallos.push("las pestañas no se quedan arriba al desplazar");
  if (!nav.mismaFila) fallos.push("los iconos no van en la fila de la marca");
  if (nav.iconosDerecha > 20) fallos.push("los iconos no van a la derecha");
  if (nav.icono > 16) fallos.push("los iconos de la cabecera no son pequeños");
  if (nav.ancho > nav.vista) fallos.push("la página se ensancha");
  // 5) La pantalla de carga, con el JavaScript bloqueado para que se quede:
  // las letras de AUTOPIR (PIR fino) y una raya que barre; sin texto ni
  // asterisco.
  const c3 = await navegador.newContext({ viewport: { width: 390, height: 844 } });
  await c3.route("**/assets/*.js", (r) => r.abort());
  const p3 = await c3.newPage();
  await p3.goto(`http://localhost:${PUERTO}/`, { waitUntil: "load" });
  await esperar(1500);
  const carga = await p3.evaluate(() => {
    const a = document.getElementById("arranque");
    const letras = [...a.querySelectorAll(".carga-marca span")];
    return {
      texto: a.innerText.replace(/\s+/g, "").trim(),
      letras: letras.length,
      pesoAuto: getComputedStyle(letras[0]).fontWeight,
      pesoPir: getComputedStyle(letras[4]).fontWeight,
      raya: !!a.querySelector(".carga-via i"),
      asterisco: !!a.querySelector(".carga-piensa"),
    };
  });
  console.log("5) carga ->", JSON.stringify(carga));
  if (carga.texto !== "AUTOPIR") fallos.push("la carga tiene algo más que AUTOPIR: " + carga.texto);
  if (carga.letras !== 7 || !carga.raya || carga.asterisco) fallos.push("la carga no es letras + raya");
  if (!(Number(carga.pesoAuto) > Number(carga.pesoPir))) fallos.push("AUTO no es más gordo que PIR");
  await c3.close();

  const conSesion = async (opciones = {}, sinPortada = false) => {
    const c = await navegador.newContext({ viewport: { width: 390, height: 844 }, ...opciones });
    await c.addInitScript((saltar) => {
      if (saltar) sessionStorage.setItem("pir-pruebas-sin-portada", "1");
      localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
        access_token: "x", refresh_token: "y", expires_at: 9999999999,
        user: { id: "u1", email: "prueba@ruta-pir.local", user_metadata: { username: "prueba" } },
      }));
    }, sinPortada);
    await rutas(c);
    return c;
  };
  const activa = (p) => p.evaluate(() => document.querySelector("nav.nav-app button.activa")?.textContent);

  // 6) Con sesión, al ABRIR la app sale la portada con un solo "Entrar", y
  // vuelve a salir al recargar (antes se apuntaba como vista y dejaba de
  // salir en una pestaña que no se cierra).
  const c4 = await conSesion();
  const p4 = await c4.newPage();
  await p4.goto(`http://localhost:${PUERTO}/`, { waitUntil: "load" });
  await p4.getByText(/sesión iniciada como/).waitFor({ timeout: 20000 });
  if ((await p4.locator("input").count()) !== 0) fallos.push("con sesión la portada pide datos");
  await p4.getByRole("button", { name: "Entrar", exact: true }).click();
  await p4.locator("nav.nav-app").waitFor({ timeout: 20000 });
  // A mitad de la transición la portada se está difuminando, no ha
  // desaparecido de golpe.
  await esperar(250);
  const enTransicion = await p4.evaluate(() => {
    const o = document.querySelector(".portada-sale");
    return o ? Number(getComputedStyle(o).opacity) : null;
  });
  await esperar(900);
  console.log("6) transición de la portada ->", enTransicion);
  if (!(enTransicion > 0 && enTransicion < 1)) fallos.push("la portada no se desvanece al entrar: " + enTransicion);
  if (await p4.getByText(/sesión iniciada como/).count()) fallos.push("Entrar no quita la portada");
  if (await p4.evaluate(() => !!document.querySelector(".app-entra, .portada-sale"))) fallos.push("las clases de la transición se quedan puestas");
  // Flechas del teclado: derecha pasa a Flashcards, izquierda vuelve.
  await p4.keyboard.press("ArrowRight");
  await esperar(700);
  const tras = await activa(p4);
  await p4.keyboard.press("ArrowLeft");
  await esperar(700);
  const vuelta = await activa(p4);
  console.log("6) portada con sesión y flechas ->", tras, "/", vuelta);
  if (tras !== "Flashcards" || vuelta !== "Exámenes") fallos.push("las flechas no cambian de pestaña");
  await p4.reload();
  await p4.getByText(/sesión iniciada como/).waitFor({ timeout: 20000 }).catch(() => fallos.push("al recargar no vuelve la portada"));
  await c4.close();

  // 7) Dedo: la página SIGUE al dedo mientras se arrastra, y al soltar lejos
  // pasa a la siguiente; un arrastre corto vuelve a su sitio.
  const c5 = await conSesion({ hasTouch: true, isMobile: true }, true);
  const p5 = await c5.newPage();
  await p5.goto(`http://localhost:${PUERTO}/`, { waitUntil: "load" });
  await p5.locator("nav.nav-app").waitFor({ timeout: 20000 });
  const arrastrar = (desde, hasta, pasos) => p5.evaluate(async ({ desde, hasta, pasos }) => {
    const ev = (tipo, x) => {
      const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 400 });
      document.body.dispatchEvent(new TouchEvent(tipo, { touches: tipo === "touchend" ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
    };
    ev("touchstart", desde);
    let enMedio = null;
    for (let k = 1; k <= pasos; k++) {
      ev("touchmove", desde + ((hasta - desde) * k) / pasos);
      await new Promise((r) => setTimeout(r, 16));
      if (k === Math.floor(pasos / 2)) enMedio = getComputedStyle(document.querySelector("main.main-app")).transform;
    }
    ev("touchend", hasta);
    return enMedio;
  }, { desde, hasta, pasos });
  const corto = await arrastrar(300, 270, 6);
  await esperar(500);
  const trasCorto = await activa(p5);
  const enMedio = await arrastrar(320, 100, 12);
  await esperar(700);
  const deslizada = await activa(p5);
  const limpio = await p5.evaluate(() => document.querySelector("main.main-app").style.transform);
  console.log("7) dedo ->", JSON.stringify({ trasCorto, enMedio, deslizada, limpio }));
  if (trasCorto !== "Exámenes") fallos.push("un arrastre corto cambió de pestaña");
  if (!enMedio || enMedio === "none") fallos.push("la página no sigue al dedo");
  if (deslizada !== "Flashcards") fallos.push("deslizar no cambia de pestaña");
  if (limpio) fallos.push("el transform se queda puesto al terminar: " + limpio);
  await c5.close();

  // 8) Trackpad: dos dedos de lado llegan como rueda con deltaX. La página
  // sigue a los dedos, pasa UNA sola página aunque detrás venga la cola de
  // inercia, un gesto corto y lento vuelve a su sitio, y una rueda vertical
  // no hace nada.
  const c6 = await conSesion({ viewport: { width: 1024, height: 768 } }, true);
  const p6 = await c6.newPage();
  await p6.goto(`http://localhost:${PUERTO}/`, { waitUntil: "load" });
  await p6.locator("nav.nav-app").waitFor({ timeout: 20000 });
  await p6.mouse.move(500, 500);
  const gesto = async (deltas) => { for (const d of deltas) { await p6.mouse.wheel(d, 0); await esperar(16); } };
  // Empujón y su inercia: sube, y luego decae durante medio segundo.
  const conInercia = [6, 14, 24, 32, 36, 34, 30, 26, 22, 19, 16, 14, 12, 10, 9, 8, 7, 6, 5, 5, 4, 4, 3, 3, 2, 2, 2, 1, 1, 1];
  await gesto(conInercia.slice(0, 4));
  const siguiendo = await p6.evaluate(() => getComputedStyle(document.querySelector("main.main-app")).transform);
  await gesto(conInercia.slice(4));
  await esperar(900);
  const trasRueda = await activa(p6);
  // Un segundo gesto, después de que se calle la inercia, pasa otra.
  await gesto(conInercia);
  await esperar(900);
  const trasSegundo = await activa(p6);
  // Volver atrás para el resto.
  await gesto(conInercia.map((d) => -d));
  await esperar(900);
  // Corto y lento: vuelve.
  await gesto([2, 3, 3, 3, 3, 2, 2]);
  await esperar(700);
  const trasCorto6 = await activa(p6);
  // Vertical un poco torcido: ni se mueve ni cambia.
  let movida = false;
  for (let k = 0; k < 12; k++) {
    await p6.mouse.wheel(10, 30); await esperar(16);
    if (await p6.evaluate(() => !!document.querySelector("main.main-app").style.transform)) movida = true;
  }
  await esperar(400);
  // Rueda vertical: nada.
  for (let k = 0; k < 12; k++) { await p6.mouse.wheel(0, 60); await esperar(16); }
  await esperar(500);
  const trasVertical = await activa(p6);
  console.log("8) trackpad ->", JSON.stringify({ siguiendo, trasRueda, trasSegundo, trasCorto6, movida, trasVertical }));
  if (trasSegundo !== "Duelo") fallos.push("el segundo gesto de trackpad no pasó otra página: " + trasSegundo);
  if (movida) fallos.push("un desplazamiento vertical torcido arrastró la página de lado");
  if (!siguiendo || siguiendo === "none") fallos.push("la página no sigue a los dedos del trackpad");
  if (trasRueda !== "Flashcards") fallos.push("un gesto de trackpad con inercia no pasó exactamente una página: " + trasRueda);
  if (trasCorto6 !== "Flashcards") fallos.push("un gesto corto de trackpad cambió de página");
  if (trasVertical !== "Flashcards") fallos.push("desplazar en vertical cambió de pestaña");
  // 9) El ratón sombrea la pestaña al pasar por encima, sin pulsar.
  await p6.locator("nav button", { hasText: "Duelo" }).hover();
  await esperar(250);
  const sombra = await p6.evaluate(() => {
    const b = [...document.querySelectorAll("nav.nav-app button")].find((x) => x.textContent === "Duelo");
    return { clase: b.className, fondo: getComputedStyle(b).backgroundColor };
  });
  console.log("9) pestaña bajo el ratón ->", JSON.stringify(sombra));
  if (!/encima/.test(sombra.clase) || sombra.fondo === "rgba(0, 0, 0, 0)") fallos.push("la pestaña no se sombrea al pasar el ratón");
  // 10) El número de preguntas: vacío hasta que escribes (la cantidad por
  // defecto en gris), y al tocarlo se vacía para que lo que escribes lo
  // sustituya, sin cursor delante de nada.
  await p6.locator("nav button", { hasText: "Exámenes" }).click();
  await esperar(900);
  const campo = p6.getByLabel("Cuántas preguntas");
  const inicio = await campo.evaluate((i) => [i.value, i.placeholder, i.inputMode]);
  await campo.click();
  await p6.keyboard.type("3");
  await p6.keyboard.press("Enter");
  const trasEscribir = await campo.inputValue();
  await campo.click();
  const alTocar = await campo.evaluate((i) => [i.value, i.placeholder]);
  await p6.keyboard.type("5");
  await campo.evaluate((i) => i.blur());
  const trasCambiar = await campo.inputValue();
  await campo.click();
  await campo.evaluate((i) => i.blur());
  const sinEscribir = await campo.inputValue();
  console.log("10) número de preguntas ->", JSON.stringify({ inicio, trasEscribir, alTocar, trasCambiar, sinEscribir }));
  if (inicio[0] !== "" || inicio[1] !== "6") fallos.push("el número no empieza vacío con la cantidad en gris: " + inicio);
  if (trasEscribir !== "3") fallos.push("escribir no pone el número: " + trasEscribir);
  if (alTocar[0] !== "" || alTocar[1] !== "3") fallos.push("tocar el número no lo vacía dejándolo en gris: " + alTocar);
  if (trasCambiar !== "5") fallos.push("el número nuevo no sustituye al anterior: " + trasCambiar);
  if (sinEscribir !== "5") fallos.push("tocar y salir sin escribir pierde el número: " + sinEscribir);
  await c6.close();
  if (e2.length) fallos.push("errores dentro: " + e2.join(" | "));
} catch (err) {
  fallos.push(err.message);
} finally {
  await navegador.close();
  servidor.kill();
}
if (fallos.length) { console.error("FALLOS:\n- " + fallos.join("\n- ")); process.exit(1); }
console.log("OK: portada con foto y fuentes, cinco pestañas sin errores ni desbordes, Estadísticas y Perfil separados.");
