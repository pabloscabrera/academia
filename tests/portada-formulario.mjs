// La portada llena la pantalla sin marco ni desplazamiento, y el teclado pasa
// de un campo al siguiente. NO la ejecuta `npm test`: necesita Playwright y
// un build hecho.
//
//   npm run build && node tests/portada-formulario.mjs
//
// Las dos quejas, desde el icono de la pantalla de inicio del iPad: "no estaba
// bien calibrada y se mueve" —el body conservaba los 8 px de margen del
// navegador, así que la foto tenía un marco blanco y la página medía 16 px más
// que la pantalla— y "el tabulador no funciona para pasar del nombre a la
// contraseña" —la app pone user-select: none en todo y los campos lo heredaban.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PUERTO = 4533;
const servidor = spawn("npx", ["--yes", "serve", "-s", "dist", "-l", String(PUERTO)], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(4000);

let fallo = null;
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
try {
  for (const [ancho, alto] of [[1024, 768], [390, 844]]) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto } });
    // Sin sesión: Supabase inalcanzable a propósito, sale el formulario.
    await ctx.route("**/*.supabase.co/rest/**", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/0" }, body: "[]" }));
    await ctx.route("**/*.supabase.co/auth/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
    await p.getByPlaceholder("Nombre de usuario").waitFor({ timeout: 15000 });
    await esperar(500);

    const medidas = await p.evaluate(() => {
      const foto = document.querySelector('img[src="/img/portada.jpg"]').getBoundingClientRect();
      return {
        margenBody: getComputedStyle(document.body).marginTop,
        foto: [Math.round(foto.left), Math.round(foto.top), Math.round(foto.width), Math.round(foto.height)],
        alto: document.documentElement.scrollHeight, ancho: document.documentElement.scrollWidth,
        vista: [innerWidth, innerHeight],
        rebote: getComputedStyle(document.documentElement).overscrollBehaviorY,
        seleccion: getComputedStyle(document.querySelector('input[name="username"]')).userSelect,
      };
    });
    console.log(`${ancho}px) ${JSON.stringify(medidas)}`);
    if (medidas.margenBody !== "0px") throw new Error(`${ancho}px: el body sigue con margen ${medidas.margenBody}`);
    if (medidas.foto[0] !== 0 || medidas.foto[1] !== 0 || medidas.foto[2] !== ancho) throw new Error(`${ancho}px: la foto no llega a los bordes ${medidas.foto}`);
    if (medidas.alto > alto || medidas.ancho > ancho) throw new Error(`${ancho}px: la página es más grande que la pantalla (${medidas.ancho}x${medidas.alto})`);
    if (medidas.rebote !== "none") throw new Error(`${ancho}px: la portada sigue rebotando`);
    if (medidas.seleccion === "none") throw new Error(`${ancho}px: el campo hereda user-select: none`);

    // Se escribe nada más entrar, sin tocar el campo: aunque el foco no
    // esté en él (en el iPad sale marcado pero las teclas no le llegan), una
    // tecla que cae en la página se escribe en el nombre.
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await p.keyboard.type("pablo");
    const directo = await p.evaluate(() => [document.querySelector('input[name="username"]').value, document.activeElement.getAttribute("name")]);
    console.log(`   sin tocar nada -> ${JSON.stringify(directo)}`);
    if (directo[0] !== "pablo" || directo[1] !== "username") throw new Error(`${ancho}px: escribir sin tocar el campo no escribe en el nombre ${JSON.stringify(directo)}`);
    // Y tocar la foto lleva al campo que toca (el nombre ya tiene texto, así
    // que la contraseña, que está vacía).
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await p.mouse.click(ancho / 2, 120);
    const trasToque = await p.evaluate(() => document.activeElement.getAttribute("name"));
    console.log(`   tocar la foto -> ${trasToque}`);
    if (trasToque !== "password") throw new Error(`${ancho}px: tocar la foto no llevó al campo vacío (${trasToque})`);

    // En el iPad el Tab no pasaba de campo: la app lo cancelaba y movía el
    // foco a mano, y iOS no acepta ese foco. Ahora el Tab NO se cancela (lo
    // hace el navegador, y los campos van en un <form>, que es lo que iOS
    // recorre), y si el foco no se movió se mueve a mano. Un Tab sintético no
    // mueve el foco por sí solo, así que sirve para probar ese respaldo.
    const tabSintetico = await p.evaluate(async () => {
      const nombre = document.querySelector('input[name="username"]');
      nombre.focus();
      const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      nombre.dispatchEvent(ev);
      await new Promise((r) => setTimeout(r, 30));
      return { cancelado: ev.defaultPrevented, foco: document.activeElement.getAttribute("name"), enForm: !!nombre.closest("form") && nombre.form === document.querySelector('input[name="password"]').form };
    });
    console.log(`   Tab sintético -> ${JSON.stringify(tabSintetico)}`);
    if (tabSintetico.cancelado) throw new Error(`${ancho}px: la app cancela el Tab (en el iPad eso lo deja sin hacer nada)`);
    if (tabSintetico.foco !== "password") throw new Error(`${ancho}px: si el navegador no mueve el foco, la app tampoco (${tabSintetico.foco})`);
    if (!tabSintetico.enForm) throw new Error(`${ancho}px: los campos no van dentro de un formulario`);

    // El Tab real del iPad no llega a la página: lo único que llega es que
    // el campo pierde el foco y lo recupera en el mismo instante (medido con
    // ?depurar=teclas). Esa huella tiene que llevar a la contraseña.
    const huella = await p.evaluate(async () => {
      const nombre = document.querySelector('input[name="username"]');
      nombre.focus();
      await new Promise((r) => setTimeout(r, 120));
      nombre.blur();
      nombre.focus();
      await new Promise((r) => setTimeout(r, 30));
      const tras = document.activeElement.getAttribute("name");
      // Volver de otra app: también pierde y recupera el mismo campo, pero
      // con tiempo de por medio. Eso NO es un Tab.
      nombre.focus();
      await new Promise((r) => setTimeout(r, 120));
      nombre.blur();
      await new Promise((r) => setTimeout(r, 300));
      nombre.focus();
      await new Promise((r) => setTimeout(r, 30));
      return { tras, trasVolver: document.activeElement.getAttribute("name") };
    });
    console.log(`   huella del Tab del iPad -> ${JSON.stringify(huella)}`);
    if (huella.tras !== "password") throw new Error(`${ancho}px: la huella del Tab del iPad no lleva a la contraseña (${huella.tras})`);
    if (huella.trasVolver !== "username") throw new Error(`${ancho}px: volver al campo tras un rato se toma por un Tab (${huella.trasVolver})`);

    // Tab del nombre a la contraseña, y Mayúsculas+Tab de vuelta.
    await p.getByPlaceholder("Nombre de usuario").click();
    await p.keyboard.type("admin");
    await p.keyboard.press("Tab");
    const trasTab = await p.evaluate(() => document.activeElement.getAttribute("placeholder"));
    await p.keyboard.press("Shift+Tab");
    const trasVuelta = await p.evaluate(() => document.activeElement.getAttribute("placeholder"));
    // Intro es "Entrar" desde cualquier campo (no avanza): con la contraseña
    // vacía, entrar dice que falta, y el foco no se mueve.
    await p.keyboard.press("Enter");
    await esperar(150);
    const trasIntro = await p.evaluate(() => document.activeElement.getAttribute("placeholder"));
    const avisoIntro = await p.getByText("Escribe tu contraseña.").count();
    console.log(`   Tab -> ${trasTab} · Mayús+Tab -> ${trasVuelta} · Intro -> ${trasIntro}`);
    if (trasTab !== "Contraseña") throw new Error(`${ancho}px: Tab no llevó a la contraseña (${trasTab})`);
    if (trasVuelta !== "Nombre de usuario") throw new Error(`${ancho}px: Mayús+Tab no volvió al nombre (${trasVuelta})`);
    if (trasIntro !== "Nombre de usuario" || !avisoIntro) throw new Error(`${ancho}px: Intro no hizo de "Entrar" (${trasIntro}, aviso ${avisoIntro})`);
    // Y lo escrito se escribe donde toca.
    await p.getByPlaceholder("Contraseña").click();
    await p.keyboard.type("secreta");
    const valores = await p.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.value));
    if (valores[0] !== "pabloadmin" || valores[1] !== "secreta") throw new Error(`${ancho}px: los campos no recibieron lo tecleado ${JSON.stringify(valores)}`);

    if (errores.length) throw new Error("errores JS: " + errores.join(" | "));
    await ctx.close();
  }
  // En pantalla táctil (iPad, móvil) no se marca ningún campo al entrar: iOS
  // no deja escribir en un foco puesto sin un toque, así que salía marcado y
  // no escribía. Tocar la foto sí lleva al nombre.
  {
    const ctx = await navegador.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    await ctx.addInitScript(() => Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 }));
    await ctx.route("**/*.supabase.co/rest/**", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/0" }, body: "[]" }));
    await ctx.route("**/*.supabase.co/auth/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    const p = await ctx.newPage();
    await p.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
    await p.getByPlaceholder("Nombre de usuario").waitFor({ timeout: 15000 });
    await esperar(600);
    const alEntrar = await p.evaluate(() => document.activeElement.tagName);
    await p.touchscreen.tap(512, 140);
    const trasTocar = await p.evaluate(() => document.activeElement.getAttribute("name"));
    console.log(`táctil) al entrar -> ${alEntrar} · tocar la foto -> ${trasTocar}`);
    if (alEntrar === "INPUT") throw new Error("en pantalla táctil sale un campo marcado al entrar");
    // Arrastrar desde abajo no mueve la portada: el arrastre se cancela (que
    // es lo único que para el rebote de iOS, aunque haya overscroll-behavior)
    // y la portada está clavada a la ventana.
    const arrastre = await p.evaluate(() => {
      const foto = document.querySelector('img[src="/img/portada.jpg"]');
      const t = new Touch({ identifier: 1, target: foto, clientX: 500, clientY: 740 });
      const ev = new TouchEvent("touchmove", { touches: [t], targetTouches: [t], changedTouches: [t], cancelable: true, bubbles: true });
      foto.dispatchEvent(ev);
      const raiz = foto.parentElement;
      return { cancelado: ev.defaultPrevented, posicion: getComputedStyle(raiz).position, desplazable: document.documentElement.scrollHeight > innerHeight, overflow: getComputedStyle(document.documentElement).overflow, fondo: getComputedStyle(document.body).backgroundColor };
    });
    console.log(`táctil) arrastre -> ${JSON.stringify(arrastre)}`);
    if (!arrastre.cancelado) throw new Error("arrastrar sobre la portada no se cancela: iOS la hace rebotar");
    if (arrastre.posicion !== "fixed") throw new Error("la portada no está clavada a la ventana");
    if (arrastre.desplazable || arrastre.overflow !== "hidden") throw new Error("el documento se puede desplazar bajo la portada");
    if (arrastre.fondo !== "rgb(17, 17, 17)") throw new Error("si rebota asoma el fondo claro: " + arrastre.fondo);
    // Con un campo activo iOS desplaza la página para dejar sitio a la barra
    // del teclado aunque no haya nada que desplazar. Aquí se imita haciendo
    // el documento más alto y desplazándolo: tiene que volver solo a 0.
    const desplazado = await p.evaluate(async () => {
      const relleno = document.createElement("div");
      relleno.style.height = "3000px";
      document.documentElement.appendChild(relleno);
      window.scrollTo(0, 300);
      await new Promise((r) => setTimeout(r, 150));
      const y = window.scrollY;
      relleno.remove();
      return y;
    });
    console.log(`táctil) desplazada a 300 -> ${desplazado}`);
    if (desplazado !== 0) throw new Error("la portada se queda desplazada (como al activar un campo en el iPad): " + desplazado);
    // Cinco toques en el logo abren el panel de diagnóstico del teclado (desde
    // el icono no se puede poner ?depurar=teclas en la dirección); sin ellos
    // no está.
    const panel = () => p.evaluate(() => [...document.querySelectorAll("div")].some((d) => d.textContent.startsWith("teclas ·")));
    const antesPanel = await panel();
    const logo = await p.getByText("AUTO", { exact: true }).first().boundingBox();
    for (let k = 0; k < 5; k++) await p.touchscreen.tap(logo.x + logo.width / 2, logo.y + logo.height / 2);
    const trasPanel = await panel();
    console.log(`táctil) panel de teclas -> antes ${antesPanel} · tras 5 toques ${trasPanel}`);
    if (antesPanel || !trasPanel) throw new Error("los cinco toques en el logo no abren el panel de teclas");
    if (trasTocar !== "username") throw new Error(`en pantalla táctil tocar la foto no lleva al nombre (${trasTocar})`);
    await ctx.close();
  }
  console.log("\nOK: la portada llena la pantalla sin desplazarse, Tab pasa de campo e Intro entra");
} catch (e) { fallo = e; } finally { await navegador.close(); servidor.kill(); }

if (fallo) { console.error("\nFALLA:", fallo.message); process.exit(1); }
