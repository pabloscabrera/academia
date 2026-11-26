// Una pregunta no puede estar en dos exámenes sin que alguien lo haya
// comprobado contra el cuadernillo oficial.
//
// Nace de un fallo que cazó el usuario en la app: la de las teorías
// factoriales (16PF) salía en PIR 16 y en PIR 19, y "una de las dos miente".
// Con los datos solos no se puede saber cuál: ya pasó con PIR 20, que traía 25
// preguntas del examen de 2024 colgadas de un documento mezclado, y la
// explicación ("el PIR repite preguntas") era falsa. Por eso esta prueba no
// decide quién tiene razón: obliga a que CADA coincidencia entre dos exámenes
// de los transcritos en el repositorio esté escrita aquí, con su estado.
//
//  - Una coincidencia NUEVA (un fichero de importación futuro que se cuela en
//    otro curso) hace fallar la prueba hasta que se mire y se apunte.
//  - Una apuntada que ya no coincide también falla: se corrigió, y la lista
//    no puede quedarse con avisos viejos.
//
// Solo mira los ficheros `supabase-pir*-preguntas.sql`. PIR 21-25 vinieron de
// un volcado sin fichero y se vigilan con `supabase-detectar-preguntas-repetidas.sql`
// contra la base de datos real.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// Estado de cada coincidencia conocida.
//   "pendiente": no se ha comprobado contra los cuadernillos oficiales.
//   "verificada": se miró el cuadernillo de los dos años y la repetición es real.
const CONOCIDAS = {
  "PIR 16 #39 = PIR 19 #94": "pendiente", // 16PF; el texto de las opciones difiere en la forma
  "PIR 18 #115 = PIR 20 #Psicología Clínica": "pendiente", // PIR 20 sale de un documento de APIR ya mezclado
};

// Sin tildes, sin mayúsculas y sin puntuación, PERO conservando `+ - % / < > =`:
// en este banco son contenido ("1++" y "1+" son niveles de evidencia distintos,
// "p<0,05", "DSM-5"). Es la misma lección del diagnóstico SQL de opciones
// repetidas, y esta prueba la cazó al primer intento.
export const normalizar = (t) =>
  t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9+\-%/<>=]+/g, "");

const FILA = /^\('(PIR \d+)', '((?:[^']|'')*)', '((?:[^']|'')*)', '(\[.*\])'::jsonb, (\d+)/;
const MIN_LONGITUD = 60; // por debajo, "En la bulimia nerviosa:" aparece en todas partes

export function leerPreguntas() {
  const filas = [];
  for (const f of readdirSync(RAIZ).filter((n) => /^supabase-pir\d+-preguntas\.sql$/.test(n)).sort()) {
    for (const linea of readFileSync(join(RAIZ, f), "utf8").split("\n")) {
      const m = FILA.exec(linea);
      if (!m) continue;
      filas.push({ curso: m[1], tema: m[2].replace(/''/g, "'"), pregunta: m[3].replace(/''/g, "'"), opciones: JSON.parse(m[4]), fichero: f });
    }
  }
  return filas;
}

const etiqueta = (p) => `${p.curso} #${p.tema.replace(/^Pregunta /, "")}`;

export function coincidenciasEntreCursos(filas) {
  const porClave = new Map();
  for (const p of filas) {
    const k = normalizar(p.pregunta);
    if (k.length < MIN_LONGITUD) continue;
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k).push(p);
  }
  const pares = [];
  for (const grupo of porClave.values()) {
    for (let i = 0; i < grupo.length; i += 1) for (let j = i + 1; j < grupo.length; j += 1) {
      if (grupo[i].curso !== grupo[j].curso) pares.push(`${etiqueta(grupo[i])} = ${etiqueta(grupo[j])}`);
    }
  }
  return pares.sort();
}

test("la lectura de los ficheros encuentra las preguntas de los exámenes transcritos", () => {
  const filas = leerPreguntas();
  const por = {};
  for (const p of filas) por[p.curso] = (por[p.curso] || 0) + 1;
  // Si el formato de una fila cambia y el lector deja de verla, la prueba de
  // abajo pasaría "en vacío": esto lo impide.
  assert.equal(por["PIR 15"], 226);
  assert.equal(por["PIR 16"], 228);
  assert.equal(por["PIR 18"], 235);
  assert.equal(por["PIR 19"], 180);
  assert.equal(por["PIR 20"], 198);
});

test("no hay ninguna pregunta repetida entre exámenes que no esté apuntada y revisada", () => {
  const halladas = coincidenciasEntreCursos(leerPreguntas());
  const nuevas = halladas.filter((p) => !(p in CONOCIDAS));
  assert.deepEqual(nuevas, [], "pregunta repetida entre dos exámenes sin revisar: compárala con los cuadernillos oficiales y apúntala en CONOCIDAS (o corrige el curso equivocado)");
  const viejas = Object.keys(CONOCIDAS).filter((p) => !halladas.includes(p));
  assert.deepEqual(viejas, [], "esta coincidencia apuntada ya no existe: quítala de CONOCIDAS");
});

test("el normalizador no confunde dos preguntas que solo se parecen", () => {
  assert.equal(normalizar("¿Qué es la p?: El valor de p."), normalizar("que es la P el valor de p"));
  assert.notEqual(normalizar("Nivel de evidencia 1++"), normalizar("Nivel de evidencia 1+"));
});
