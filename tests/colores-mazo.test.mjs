// Los colores de mazo tienen que cumplir dos cosas, y las dos son medibles:
//
//   1. El texto que va encima es BLANCO (ver `relleno`/`sobreColor` en
//      FilaMazoEditable), así que el blanco sobre el color tiene que dar
//      4,5:1 o más, que es lo que pide WCAG AA para leer. Es la razón de que
//      la paleta sea oscura, y ya estuvo a punto de romperse: con crema en
//      vez de blanco el `oro` se quedaba en 4,06.
//
//   2. Tienen que distinguirse ENTRE SÍ. Dos colores parecidos son dos mazos
//      que se ven iguales en la lista, o sea el color sin servir para nada.
//      El listón es ΔE >= 18 en CIELAB porque el par más justo de la paleta
//      original (aviso/oro) está en 18,4: se fija lo que ya había, no un
//      ideal que obligaría a tocar colores que el usuario ya tiene puestos.
//
// COLORES_MAZO vive en App.jsx, que no se puede importar desde Node (es JSX),
// así que se lee el fichero como texto y se sacan los hex de ahí. Es feo, pero
// la alternativa —copiar la paleta aquí— comprobaría la copia y no la paleta,
// que es justo el fallo que se quiere impedir.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fuente = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

function leerPaleta() {
  const bloque = fuente.match(/const COLORES_MAZO = \{([\s\S]*?)\n\};/);
  assert.ok(bloque, "no se encontró COLORES_MAZO en App.jsx");
  const tokens = {};
  for (const [, nombre, hex] of fuente.matchAll(/^const ([A-Z_]+) = "(#[0-9A-Fa-f]{6})";/gm)) {
    tokens[nombre] = hex;
  }
  const paleta = {};
  for (const linea of bloque[1].split("\n")) {
    const m = linea.match(/^\s*([a-zA-Z_]+):\s*(?:"(#[0-9A-Fa-f]{6})"|([A-Z_]+)),/);
    if (!m) continue;
    const valor = m[2] || tokens[m[3]];
    assert.ok(valor, `no se pudo resolver el color de "${m[1]}"`);
    paleta[m[1]] = valor;
  }
  return paleta;
}

const aLineal = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const aRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminancia = (hex) => {
  const [r, g, b] = aRgb(hex).map(aLineal);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const l1 = luminancia(a), l2 = luminancia(b);
  const [alto, bajo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (alto + 0.05) / (bajo + 0.05);
};
function aLab(hex) {
  const [r, g, b] = aRgb(hex).map(aLineal);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const distancia = (a, b) => {
  const A = aLab(a), B = aLab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};

const PALETA = leerPaleta();
const CLAVES = Object.keys(PALETA);

test("la paleta de mazos se lee entera de App.jsx", () => {
  assert.ok(CLAVES.length >= 16, `solo se leyeron ${CLAVES.length} colores`);
  for (const [k, v] of Object.entries(PALETA)) {
    assert.match(v, /^#[0-9A-Fa-f]{6}$/, `${k} no es un hex`);
  }
});

test("el texto blanco se lee sobre todos los colores (WCAG AA, 4,5:1)", () => {
  for (const [k, v] of Object.entries(PALETA)) {
    const c = contraste("#FFFFFF", v);
    assert.ok(c >= 4.5, `blanco sobre "${k}" (${v}) da ${c.toFixed(2)}:1, hace falta 4,5`);
  }
});

test("ningún color se confunde con otro (ΔE >= 18)", () => {
  for (let i = 0; i < CLAVES.length; i++) {
    for (let j = i + 1; j < CLAVES.length; j++) {
      const d = distancia(PALETA[CLAVES[i]], PALETA[CLAVES[j]]);
      assert.ok(d >= 18, `"${CLAVES[i]}" y "${CLAVES[j]}" se parecen demasiado (ΔE ${d.toFixed(1)})`);
    }
  }
});

// No se puede medir que no falte una clave, pero sí que no falte NINGUNA de
// las que había: quitar una deja sin color, en silencio, a los mazos que ya
// la tuvieran guardada, porque estiloDeMazo valida contra el catálogo.
test("no se ha retirado ninguno de los ocho colores originales", () => {
  for (const k of ["tinta", "acento", "aviso", "oro", "correcto", "turquesa", "azul", "morado"]) {
    assert.ok(k in PALETA, `falta el color "${k}", que ya podía estar guardado en mazos_estilo`);
  }
});

// La crema es el color de la casa y es lo que uno pondría sin pensar; está
// aquí para que el motivo de NO usarla quede en una prueba y no en un
// comentario que alguien pueda deshacer de buena fe.
test("la crema de la casa NO vale como texto de relleno", () => {
  const malos = Object.entries(PALETA).filter(([, v]) => contraste("#F2E7CE", v) < 4.5);
  assert.ok(malos.length > 0, "si la crema ya valiera en todos, este razonamiento habría caducado");
});
