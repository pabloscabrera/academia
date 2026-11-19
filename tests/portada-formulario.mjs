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

    // Tab del nombre a la contraseña, y Mayúsculas+Tab de vuelta.
    await p.getByPlaceholder("Nombre de usuario").click();
    await p.keyboard.type("admin");
    await p.keyboard.press("Tab");
    const trasTab = await p.evaluate(() => document.activeElement.getAttribute("placeholder"));
    await p.keyboard.press("Shift+Tab");
    const trasVuelta = await p.evaluate(() => document.activeElement.getAttribute("placeholder"));
    // Intro con la contraseña vacía también avanza, en vez de intentar entrar.
    await p.keyboard.press("Enter");
    const trasIntro = await p.evaluate(() => document.activeElement.getAttribute("placeholder"));
    console.log(`   Tab -> ${trasTab} · Mayús+Tab -> ${trasVuelta} · Intro -> ${trasIntro}`);
    if (trasTab !== "Contraseña") throw new Error(`${ancho}px: Tab no llevó a la contraseña (${trasTab})`);
    if (trasVuelta !== "Nombre de usuario") throw new Error(`${ancho}px: Mayús+Tab no volvió al nombre (${trasVuelta})`);
    if (trasIntro !== "Contraseña") throw new Error(`${ancho}px: Intro no pasó a la contraseña (${trasIntro})`);
    // Y lo escrito se escribe donde toca.
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
    if (trasTocar !== "username") throw new Error(`en pantalla táctil tocar la foto no lleva al nombre (${trasTocar})`);
    await ctx.close();
  }
  console.log("\nOK: la portada llena la pantalla sin desplazarse, y Tab e Intro pasan de campo");
} catch (e) { fallo = e; } finally { await navegador.close(); servidor.kill(); }

if (fallo) { console.error("\nFALLA:", fallo.message); process.exit(1); }
