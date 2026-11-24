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
