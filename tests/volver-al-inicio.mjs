// Tocar la pestaña en la que ya estás te saca de donde estés metido y te lleva
// al menú de esa sección, como el botón de inicio de X. NO la ejecuta
// `npm test`: necesita Playwright y un build hecho.
//
//   npm run build && node tests/volver-al-inicio.mjs
//
// Lo que motivó esto: entrar sin querer en un mazo o en un repaso y no tener
// cómo salir con un toque. Desde que las pestañas se esconden en vez de
// desmontarse, lo que dejabas abierto se quedaba abierto para siempre.
//
// Lo que vigila, además de que salga: (a) que NADA se pierda — la tirada queda
// como "Te quedaste a medias" y se puede continuar; (b) que tocar OTRA pestaña
// siga siendo cambiar de pestaña, no reiniciar; (c) que con un duelo en marcha
// se pregunte antes de abandonarlo.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4551, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", process.env.DIST || "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

const PREGUNTAS = Array.from({ length: 8 }, (_, i) => ({
  id: "q" + i, curso: i < 4 ? "PIR 25" : "PIR 24", tema: "Tema " + i,
  pregunta: `Enunciado número ${i}:`, opciones: ["Correcta", "Mala 1", "Mala 2", "Mala 3"],
  correcta: 0, explicacion: null, inventada: false, created_at: "2026-01-01T00:00:00Z",
}));
const TARJETAS = Array.from({ length: 4 }, (_, i) => ({
  id: "t" + i, user_id: "u1", mazo: "Porcentajes", frontal: "Frente " + i, posterior: "Dorso " + i,
  etiquetas: [], grupo_id: null,
}));

let fallo = null;
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const json = (r, b, h) => r.fulfill({ status: 200, contentType: "application/json", headers: h, body: typeof b === "string" ? b : JSON.stringify(b) });
const pestana = (p, nombre) => p.locator(".nav-app button", { hasText: new RegExp(nombre, "i") });
const texto = (p) => p.evaluate(() => document.querySelector("main").innerText);
const activa = (p) => p.evaluate(() => document.querySelector(".nav-app button.activa").textContent.trim());

try {
  const ctx = await navegador.newContext({ viewport: { width: 1024, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem("sb-slwifwjwtipoqtkhbhbr-auth-token", JSON.stringify({
      access_token: "x", refresh_token: "y", expires_at: 9999999999,
      user: { id: "u1", email: "prueba@ruta-pir.local", user_metadata: { username: "prueba" } },
    }));
  });
  await ctx.route(`**${SB}/rest/**`, (r) => json(r, []));
  await ctx.route(`**${SB}/auth/**`, (r) => json(r, {}));
  await ctx.route(`**${SB}/rest/v1/flashcards?**`, (r) => json(r, r.request().method() === "GET" ? TARJETAS : []));
  await ctx.route(`**${SB}/rest/v1/preguntas*`, (r) => {
    const url = r.request().url();
    const tabla = (url.split("/rest/v1/")[1] || "").split("?")[0];
    if (tabla !== "preguntas") return json(r, []);
    if (r.request().method() === "HEAD" || /\bselect=id\b/.test(url)) return json(r, "", { "content-range": `0-0/${PREGUNTAS.length}` });
    if (/select=actualizado_en/.test(url)) return json(r, [{ actualizado_en: null }]);
    return json(r, PREGUNTAS);
  });
  const p = await ctx.newPage();
  const errores = [], dialogos = [];
  p.on("pageerror", (e) => errores.push(e.message));
  p.on("dialog", async (d) => { dialogos.push(d.message()); await d.dismiss(); });
  await p.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await esperar(5000);

  // --- 1) Flashcards: dentro de un REPASO, tocar la pestaña lleva a la lista de mazos ---
  await pestana(p, "flashcards").click();
  await esperar(900);
  await p.getByText("Porcentajes").first().click();
  await esperar(600);
  await p.getByRole("button", { name: "Empezar repaso" }).click();
  await esperar(700);
  const enRepaso = /Tarjeta \d+ de \d+/.test(await texto(p));
  await pestana(p, "flashcards").click();
  await esperar(700);
  const t1 = await texto(p);
  const enLista = !/Tarjeta \d+ de \d+/.test(t1) && !/Empezar repaso/.test(t1) && /Porcentajes/.test(t1);
  console.log(`1) repaso abierto=${enRepaso} -> tras tocar la pestaña: lista de mazos=${enLista}; sigue en "${await activa(p)}"`);
  if (!enRepaso) throw new Error("1) el montaje no llegó a abrir el repaso");
  if (!enLista) throw new Error("1) tocar Flashcards no sacó del repaso a la lista de mazos");
  if (!/flashcards/i.test(await activa(p))) throw new Error("1) cambió de pestaña en vez de quedarse en Flashcards");

  // --- 2) Flashcards: dentro de un MAZO (sin repaso), también ---
  await p.getByText("Porcentajes").first().click();
  await esperar(600);
  const dentroMazo = /Empezar repaso/.test(await texto(p));
  await pestana(p, "flashcards").click();
  await esperar(600);
  const t2 = await texto(p);
  console.log(`2) dentro del mazo=${dentroMazo} -> tras tocar: botón Empezar repaso=${/Empezar repaso/.test(t2)}`);
  if (!dentroMazo) throw new Error("2) el montaje no entró en el mazo");
  if (/Empezar repaso/.test(t2)) throw new Error("2) tocar la pestaña no salió del mazo");

  // --- 3) Exámenes: una tirada a medias se cierra SIN perderse ---
  await pestana(p, "exámenes").click();
  await esperar(900);
  await p.getByLabel("Cuántas preguntas").fill("5");
  await p.getByLabel("Cuántas preguntas").blur();
  await p.getByRole("button", { name: "Empezar", exact: true }).click();
  await esperar(700);
  await p.getByRole("button", { name: /Correcta/ }).first().click();
  await esperar(300);
  await p.getByRole("button", { name: /^Siguiente$/ }).click();
  await esperar(500);
  const enTirada = /Pregunta 2 de 5/.test(await texto(p));
  const enun = ((await texto(p)).match(/Enunciado número \d/) || [])[0];
  await pestana(p, "exámenes").click();
  await esperar(700);
  const t3 = await texto(p);
  const fuera = !/Pregunta \d+ de \d+/.test(t3) && /Te quedaste a medias/i.test(t3);
  console.log(`3) tirada abierta=${enTirada} -> tras tocar: fuera=${fuera} y queda "Te quedaste a medias"`);
  if (!enTirada) throw new Error("3) el montaje no llegó a la pregunta 2");
  if (!fuera) throw new Error("3) tocar Exámenes no sacó de la tirada o la perdió");
  await p.getByRole("button", { name: /Continuar/ }).click();
  await esperar(700);
  const retomada = await texto(p);
  console.log(`   Continuar la retoma: pregunta 2=${/Pregunta 2 de 5/.test(retomada)}, mismo enunciado=${retomada.includes(enun)}`);
  if (!/Pregunta 2 de 5/.test(retomada) || !retomada.includes(enun)) throw new Error("3) lo guardado no se pudo retomar tras salir con un toque");

  // --- 4) tocar OTRA pestaña sigue siendo cambiar de pestaña, no reiniciar ---
  await pestana(p, "perfil").click();
  await esperar(900);
  await pestana(p, "exámenes").click();
  await esperar(900);
  const t4 = await texto(p);
  console.log(`4) ir a otra pestaña y volver conserva la tirada: ${/Pregunta 2 de 5/.test(t4)}`);
  if (!/Pregunta 2 de 5/.test(t4)) throw new Error("4) cambiar de pestaña reinició la sección (solo debe reiniciar al tocar la ya abierta)");

  // --- 5) tocar la pestaña abierta también vuelve arriba del todo ---
  await pestana(p, "perfil").click();
  await esperar(900);
  await p.evaluate(() => { document.querySelector("main").style.minHeight = "4000px"; window.scrollTo(0, 700); });
  await esperar(200);
  await pestana(p, "perfil").click();
  await esperar(500);
  const y = await p.evaluate(() => window.scrollY);
  console.log(`5) tras tocar la pestaña abierta, scrollY=${y}`);
  if (y > 2) throw new Error("5) no volvió arriba del todo: " + y);

  // --- 6) Duelo: con un combate en marcha se PREGUNTA, y "cancelar" no abandona ---
  await pestana(p, "duelo").click();
  await esperar(900);
  // Sin combate: tocar la pestaña no pregunta nada.
  await pestana(p, "duelo").click();
  await esperar(500);
  if (dialogos.length) throw new Error("6) preguntó por un duelo que no existía: " + dialogos[0]);
  // Se imita un combate con la misma marca que pone la pantalla del duelo.
  await p.evaluate(() => {
    const m = document.createElement("div");
    m.setAttribute("data-sin-deslizar", ""); m.id = "combate-falso"; m.textContent = "combate";
    document.querySelector('[data-pestana="duelo"]').appendChild(m);
  });
  await pestana(p, "duelo").click();   // el diálogo se descarta (Cancelar)
  await esperar(500);
  const sigue = await p.evaluate(() => !!document.getElementById("combate-falso"));
  console.log(`6) con combate en marcha: preguntó=${dialogos.length === 1} ("${dialogos[0]}"), tras Cancelar sigue dentro=${sigue}`);
  if (dialogos.length !== 1 || !/duelo en marcha/i.test(dialogos[0])) throw new Error("6) no preguntó antes de abandonar el duelo");
  if (!sigue) throw new Error("6) abandonó el duelo aunque se canceló");
  p.removeAllListeners("dialog");
  p.on("dialog", (d) => d.accept());
  await pestana(p, "duelo").click();   // ahora se acepta
  await esperar(500);
  const salio = await p.evaluate(() => !document.getElementById("combate-falso"));
  console.log(`   tras Aceptar: salió=${salio}`);
  if (!salio) throw new Error("6) aceptando tampoco salió del duelo");

  if (errores.length) throw new Error("errores JS: " + errores.join(" | "));
  await ctx.close();
  console.log("\nOK: tocar la pestaña abierta vuelve al menú, sin perder nada y preguntando antes de dejar un duelo");
} catch (e) { fallo = e; } finally { await navegador.close(); servidor.kill(); }

if (fallo) { console.error("\nFALLA:", fallo.message); process.exit(1); }
