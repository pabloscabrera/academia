import { test } from "node:test";
import assert from "node:assert/strict";
import { medidasReducidas, hayQueReducir, rutaApunte, apuntesDeMazo, MAX_LADO_APUNTE, MAX_BYTES_SIN_REDUCIR } from "../src/logica.js";

test("reducir deja el lado mayor en el máximo y conserva la proporción", () => {
  assert.deepEqual(medidasReducidas(4800, 3600), { ancho: MAX_LADO_APUNTE, alto: 1800 });
  assert.deepEqual(medidasReducidas(1000, 4000, 2000), { ancho: 500, alto: 2000 });
});

test("reducir nunca agranda una imagen pequeña", () => {
  assert.deepEqual(medidasReducidas(800, 600), { ancho: 800, alto: 600 });
});

test("unas medidas que no valen no se inventan", () => {
  assert.equal(medidasReducidas(0, 600), null);
  assert.equal(medidasReducidas(undefined, undefined), null);
});

test("una captura pequeña en PNG se sube tal cual, sin emborronar la letra", () => {
  assert.equal(hayQueReducir({ tipo: "image/png", bytes: 370 * 1024, ancho: 2212, alto: 1658 }), false);
});

test("se reduce lo que pesa mucho, lo enorme y lo que el bucket no admite", () => {
  assert.equal(hayQueReducir({ tipo: "image/png", bytes: MAX_BYTES_SIN_REDUCIR + 1, ancho: 2212, alto: 1658 }), true);
  assert.equal(hayQueReducir({ tipo: "image/jpeg", bytes: 1000, ancho: 6000, alto: 4000 }), true);
  assert.equal(hayQueReducir({ tipo: "image/heic", bytes: 1000, ancho: 100, alto: 100 }), true);
  assert.equal(hayQueReducir({ tipo: "", bytes: 1000 }), true);
});

test("la ruta empieza por la carpeta del usuario, que es lo que miran las políticas", () => {
  assert.equal(rutaApunte("u1", "abc"), "u1/abc.jpg");
  assert.equal(rutaApunte("u1", "abc", "image/png"), "u1/abc.png");
  assert.equal(rutaApunte("u1", "abc", "image/webp"), "u1/abc.webp");
  assert.equal(rutaApunte(null, "abc"), null);
});

test("los apuntes de un mazo salen solos y en el orden en que se subieron", () => {
  const todos = [
    { id: "b", mazo: "Young", created_at: "2026-11-24T10:00:02Z" },
    { id: "x", mazo: "Otro", created_at: "2026-11-24T10:00:00Z" },
    { id: "a", mazo: "Young", created_at: "2026-11-24T10:00:01Z" },
  ];
  assert.deepEqual(apuntesDeMazo(todos, "Young").map((a) => a.id), ["a", "b"]);
  assert.deepEqual(apuntesDeMazo(todos, "Nada"), []);
  assert.deepEqual(apuntesDeMazo(null, "Young"), []);
  // No reordena la lista que recibe.
  assert.deepEqual(todos.map((a) => a.id), ["b", "x", "a"]);
});

test("sin el bucket creado, el aviso dice que falta algo en el servidor y no un 'Bucket not found' en inglés", async () => {
  const { mensajeDeEscritura } = await import("../src/logica.js");
  const texto = mensajeDeEscritura({ message: "Bucket not found", statusCode: "404" }, "Subir la imagen");
  assert.match(texto, /^Subir la imagen: falta crear en el servidor/);
  assert.doesNotMatch(texto, /Bucket not found/);
});

// ---------- Visor ----------
import {
  encajarImagen, vistaDePellizco, zoomAlrededor, encuadrarVista, vistaDeArrastre,
  opacidadFondoVisor, cierraVisor, leerMedidasApuntes, conMedidaApunte, urlFirmadaVigente,
  UMBRAL_CIERRE_VISOR, MAX_MEDIDAS_APUNTES,
} from "../src/logica.js";

const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} frente a ${b}`);

test("encajar: entera y centrada, con margen, y agranda si hace falta", () => {
  // Una tabla apaisada en un escenario más alto que ancho: manda el ancho.
  assert.deepEqual(encajarImagen(1000, 800, 2000, 1000), { x: 0, y: 150, ancho: 1000, alto: 500 });
  assert.deepEqual(encajarImagen(1000, 800, 2000, 1000, 12), { x: 12, y: 156, ancho: 976, alto: 488 });
  assert.deepEqual(encajarImagen(1000, 800, 100, 100), { x: 100, y: 0, ancho: 800, alto: 800 });
  assert.equal(encajarImagen(0, 800, 10, 10), null);
  assert.equal(encajarImagen(100, 100, 0, 10), null);
});

test("pellizco: el punto entre los dedos se queda entre los dedos", () => {
  const base = { x: 10, y: 20, ancho: 400, alto: 300 };
  const inicial = { escala: 1, x: 0, y: 0 };
  const punto = { x: 110, y: 120 }; // 100 px dentro de la imagen en cada eje
  const v = zoomAlrededor(inicial, 2, punto, base);
  // El punto de la imagen (100,100) sigue en (110,120) con escala 2.
  cerca(base.x + v.x + 100 * v.escala, 110, "x");
  cerca(base.y + v.y + 100 * v.escala, 120, "y");
  // Si los dedos se desplazan 30 px a la derecha, la imagen va con ellos.
  const w = vistaDePellizco(inicial, punto, 2, { x: 140, y: 120 }, base);
  cerca(w.x - v.x, 30, "arrastre con dos dedos");
});

test("encuadrar: centra lo que cabe y no deja hueco en lo que no", () => {
  const escenario = { ancho: 1000, alto: 800 };
  const base = encajarImagen(1000, 800, 2000, 1000); // { x:0, y:150, 1000×500 }
  // Sin ampliar: vuelve a su sitio aunque se haya movido.
  assert.deepEqual(encuadrarVista({ escala: 1, x: 40, y: -60 }, base, escenario), { escala: 1, x: 0, y: 0 });
  // Al doble mide 2000×1000: no puede dejar hueco por la izquierda ni por arriba…
  const v = encuadrarVista({ escala: 2, x: 300, y: 100 }, base, escenario);
  assert.equal(v.x, 0);
  assert.equal(v.y, -150);
  // …ni por la derecha ni por abajo.
  const w = encuadrarVista({ escala: 2, x: -5000, y: -5000 }, base, escenario);
  assert.equal(w.x, 1000 - 2000);
  assert.equal(w.y, 800 - 1000 - 150);
  // Con resistencia, lo que se pasa se mueve solo esa parte.
  const r = encuadrarVista({ escala: 2, x: 300, y: -150 }, base, escenario, 1 / 3);
  assert.equal(r.x, 100);
});

test("arrastrar para cerrar: sigue al dedo, encoge desde el centro y aclara el fondo", () => {
  const base = { x: 0, y: 150, ancho: 1000, alto: 500 };
  const v = vistaDeArrastre(200, 800, base);
  assert.ok(v.escala < 1 && v.escala >= 0.85);
  // El centro de la imagen se ha movido exactamente lo arrastrado.
  cerca(v.x + (base.ancho * v.escala) / 2, base.ancho / 2, "centro x");
  cerca(v.y + (base.alto * v.escala) / 2, base.alto / 2 + 200, "centro y");
  assert.equal(opacidadFondoVisor(0, 800), 1);
  assert.ok(opacidadFondoVisor(200, 800) < opacidadFondoVisor(100, 800));
  assert.equal(opacidadFondoVisor(-200, 800), opacidadFondoVisor(200, 800), "hacia arriba igual que hacia abajo");
  assert.ok(opacidadFondoVisor(5000, 800) >= 0.2);
});

test("cerrar al soltar: por distancia o por un golpe rápido en la misma dirección", () => {
  const alto = 800;
  assert.equal(cierraVisor({ dy: alto * UMBRAL_CIERRE_VISOR, alto }), true);
  assert.equal(cierraVisor({ dy: -alto * UMBRAL_CIERRE_VISOR, alto }), true, "hacia arriba también");
  assert.equal(cierraVisor({ dy: 60, velocidad: 0.1, alto }), false, "corto y lento vuelve");
  assert.equal(cierraVisor({ dy: 60, velocidad: 0.9, alto }), true, "corto pero rápido cierra");
  assert.equal(cierraVisor({ dy: 60, velocidad: -0.9, alto }), false, "volver el dedo al final no cuenta");
  assert.equal(cierraVisor({ dy: 10, velocidad: 2, alto }), false, "un roce no cierra");
  assert.equal(cierraVisor({ dy: 0, alto }), false);
});

test("medidas guardadas: se validan al leer y se recortan las más viejas", () => {
  assert.deepEqual(leerMedidasApuntes('{"a":[2000,1000],"b":"x","c":[0,5],"d":[1,2,3]}'), { a: [2000, 1000] });
  assert.deepEqual(leerMedidasApuntes("no es json"), {});
  assert.deepEqual(leerMedidasApuntes("[1,2]"), {});
  const m = conMedidaApunte({}, "r1", 2732, 1362);
  assert.deepEqual(m, { r1: [2732, 1362] });
  assert.equal(conMedidaApunte(m, "r1", 2732, 1362), m, "sin cambios devuelve el mismo objeto");
  assert.equal(conMedidaApunte(m, "r2", 0, 10), m);
  let grande = {};
  for (let i = 0; i < MAX_MEDIDAS_APUNTES + 5; i++) grande = conMedidaApunte(grande, `r${i}`, 10, 10);
  assert.equal(Object.keys(grande).length, MAX_MEDIDAS_APUNTES);
  assert.ok(!("r0" in grande) && `r${MAX_MEDIDAS_APUNTES + 4}` in grande);
});

test("URL firmada: se reutiliza mientras le quede margen", () => {
  const ahora = 1_000_000;
  assert.equal(urlFirmadaVigente({ url: "u", caduca: ahora + 3600_000 }, ahora), "u");
  assert.equal(urlFirmadaVigente({ url: "u", caduca: ahora + 60_000 }, ahora), null, "a punto de caducar no vale");
  assert.equal(urlFirmadaVigente(null, ahora), null);
  assert.equal(urlFirmadaVigente({ url: "", caduca: ahora + 3600_000 }, ahora), null);
});
