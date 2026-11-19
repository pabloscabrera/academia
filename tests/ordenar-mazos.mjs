// Ordenar la lista de mazos, en un navegador de verdad.
// NO la ejecuta `npm test` (necesita Playwright y un build hecho):
//
//   npm run build && node tests/ordenar-mazos.mjs
//
// Qué se comprueba y por qué:
//  1. Cada criterio reordena la lista DE VERDAD. `agruparMazosEnCarpetas`
//     ordenaba alfabéticamente por su cuenta, así que un criterio elegido
//     fuera no se notaba; eso es exactamente lo que vigila este test.
//  2. "Más falladas" ordena por PORCENTAJE y no por número de fallos: el mazo
//     grande acumula más fallos y falla menos, y tiene que quedar debajo.
//  3. Un mazo sin repasar va al final en los dos sentidos, no primero en
//     "menos falladas".
//  4. La elección sobrevive a recargar (va en localStorage).
//  5. Los mazos que están dentro de una carpeta no se salen de ella al
//     ordenar, y la página no se ensancha a 390 px.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4503, SB = "slwifwjwtipoqtkhbhbr.supabase.co";
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

// Grande: 6 tarjetas, 10 repasos con 4 fallos  -> 40 %
// Chico:  2 tarjetas,  4 repasos con 3 fallos  -> 75 % (menos fallos, peor tasa)
// Medio:  4 tarjetas,  4 repasos con 0 fallos  ->  0 %
// Virgen: 1 tarjeta,   sin repasos             -> sin dato
const defs = [["Grande", 6], ["Chico", 2], ["Medio", 4], ["Virgen", 1]];
const tarjetas = defs.flatMap(([m, n]) =>
  Array.from({ length: n }, (_, j) => ({
    id: `${m}-${j}`, user_id: "u1", mazo: m, frontal: `F ${m}${j}`, posterior: `D ${j}`,
    etiquetas: [], grupo_id: null,
  })));
const repaso = (id, acierto, i) => ({
  id: `r-${id}-${i}`, name: "prueba", flashcard_id: id, calidad: acierto ? 4 : 0,
  acierto, intervalo_antes: 1, creado_en: new Date(Date.now() - i * 86400000).toISOString(),
});
const repasos = [
  ...Array.from({ length: 10 }, (_, i) => repaso("Grande-0", i >= 4, i)),
  ...Array.from({ length: 4 }, (_, i) => repaso("Chico-0", i >= 3, i)),
  ...Array.from({ length: 4 }, (_, i) => repaso("Medio-0", true, i)),
];
// Medio vive dentro de una carpeta: ordenar no puede sacarlo de ahí.
const estilos = [
  { user_id: "u1", mazo: "Medio", carpeta: "Clínica", icono: null, color: null },
  { user_id: "u1", mazo: "Grande", carpeta: null, icono: null, color: "oro" },
  { user_id: "u1", mazo: "Chico", carpeta: null, icono: null, color: "tinta" },
];

const fallos = [];
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
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
await pagina.route(`**${SB}/rest/**`, (r) => json(r, []));
await pagina.route(`**${SB}/rest/v1/flashcards?**`, (r) => json(r, tarjetas));
await pagina.route(`**${SB}/rest/v1/flashcards_repasos?**`, (r) => json(r, repasos));
await pagina.route(`**${SB}/rest/v1/mazos_estilo?**`, (r) => json(r, estilos));
await pagina.route(`**${SB}/auth/**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

const entrar = async () => {
  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  await esperar(5000);
  await pagina.getByRole("button", { name: /Flashcards/i }).first().click();
  await esperar(1200);
};
// La lista tal y como se ve: carpetas y mazos, en orden, sin "Todas las tarjetas".
// El nombre se saca del `div` del título, no partiendo el textContent del
// botón: ahí van pegados el nombre, el recuento y la píldora ("Chico2
// tarjetas2 hoy") sin ningún salto de línea por medio.
const lista = () => pagina.evaluate(() =>
  [...document.querySelectorAll("button")]
    .filter((b) => /\d+\s*(tarjetas?|mazos?)/.test(b.textContent))
    .map((b) => {
      const t = b.querySelector("span > div");
      return t ? t.textContent.trim() : "";
    })
    .filter((n) => n && n !== "Todas las tarjetas"));
const elegir = async (clave) => {
  await pagina.selectOption("#orden-mazos", clave);
  await esperar(500);
  return lista();
};

await entrar();
const base = await lista();
console.log("0) alfabético ->", JSON.stringify(base));
if (JSON.stringify(base) !== JSON.stringify(["Clínica", "Chico", "Grande", "Virgen"])) {
  fallos.push(`[alfabético] salió ${JSON.stringify(base)}`);
}

const masTarjetas = await elegir("mas-tarjetas");
console.log("1) más tarjetas ->", JSON.stringify(masTarjetas));
if (JSON.stringify(masTarjetas.filter((t) => t !== "Clínica")) !== JSON.stringify(["Grande", "Chico", "Virgen"])) {
  fallos.push(`[más tarjetas] salió ${JSON.stringify(masTarjetas)}`);
}

const menosTarjetas = await elegir("menos-tarjetas");
console.log("2) menos tarjetas ->", JSON.stringify(menosTarjetas));
if (JSON.stringify(menosTarjetas.filter((t) => t !== "Clínica")) !== JSON.stringify(["Virgen", "Chico", "Grande"])) {
  fallos.push(`[menos tarjetas] salió ${JSON.stringify(menosTarjetas)}`);
}

// Chico falla el 75 % con 3 fallos; Grande el 40 % con 4. Por recuento saldría
// Grande primero, y eso sería la lista de los mazos grandes.
const masFalladas = await elegir("mas-falladas");
console.log("3) más falladas ->", JSON.stringify(masFalladas));
const sinCarpeta = masFalladas.filter((t) => t !== "Clínica");
if (JSON.stringify(sinCarpeta) !== JSON.stringify(["Chico", "Grande", "Virgen"])) {
  fallos.push(`[más falladas] salió ${JSON.stringify(masFalladas)}: ¿se está ordenando por número de fallos?`);
}

const menosFalladas = await elegir("menos-falladas");
console.log("4) menos falladas ->", JSON.stringify(menosFalladas));
if (menosFalladas[menosFalladas.length - 1] !== "Virgen") {
  fallos.push(`[menos falladas] el mazo sin repasar no quedó al final: ${JSON.stringify(menosFalladas)}`);
}

// ---------- La elección sobrevive a recargar ----------
await elegir("mas-tarjetas");
await entrar();
const trasRecargar = await pagina.evaluate(() => document.querySelector("#orden-mazos")?.value);
const listaTrasRecargar = await lista();
console.log("5) tras recargar ->", trasRecargar, JSON.stringify(listaTrasRecargar));
if (trasRecargar !== "mas-tarjetas") fallos.push(`[recarga] el criterio no se guardó: ${trasRecargar}`);
if (JSON.stringify(listaTrasRecargar.filter((t) => t !== "Clínica")) !== JSON.stringify(["Grande", "Chico", "Virgen"])) {
  fallos.push(`[recarga] la lista no salió ordenada: ${JSON.stringify(listaTrasRecargar)}`);
}

// ---------- La carpeta sigue conteniendo lo suyo, y nada desborda ----------
if (!listaTrasRecargar.includes("Clínica")) fallos.push("[carpeta] la carpeta desapareció al ordenar");
if (listaTrasRecargar.includes("Medio")) fallos.push("[carpeta] un mazo de dentro de la carpeta salió además suelto");
await pagina.getByRole("button", { name: /Clínica/ }).first().click();
await esperar(600);
const dentro = await lista();
console.log("6) dentro de la carpeta ->", JSON.stringify(dentro));
if (JSON.stringify(dentro) !== JSON.stringify(["Medio"])) fallos.push(`[carpeta] dentro salió ${JSON.stringify(dentro)}`);
const desborda = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (desborda) fallos.push("[390] la página se ensancha con el control de orden");

console.log("ERRORES JS:", errores.length ? errores.join(" | ") : "ninguno");
await navegador.close();
servidor.kill();
if (errores.length) fallos.push(`errores de JS: ${errores.join(" | ")}`);
if (fallos.length) {
  console.error("\nFALLOS:\n- " + fallos.join("\n- "));
  process.exit(1);
}
console.log("\nOK: los criterios reordenan de verdad, la tasa manda sobre el recuento y la elección se guarda.");
