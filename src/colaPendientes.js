// Lo que se responde sin cobertura se apunta aquí y se sube al volver la red.
//
// No se guarda una lista de acciones para repetirlas después, sino **la fila
// tal y como debe quedar**. Es lo que hace que esto sea seguro: repetir
// acciones obliga a saber contra qué estado se aplicaron —y dos respuestas
// encoladas leerían el mismo contador y se pisarían—, mientras que una fila
// ya calculada se sube tal cual y da el mismo resultado se suba una vez o
// tres. Cada respuesta nueva sobrescribe la fila encolada de esa pregunta,
// que ya lleva acumulado lo anterior.
//
// Contrapartida asumida: si la misma cuenta estudiara a la vez en dos
// dispositivos y uno estuviera sin red, al reconectar su fila pisaría la del
// otro. Para el uso real de esto (una persona, un móvil) no pasa, y la
// alternativa —resolver conflictos campo a campo— no compensa.

const clave = (nombre) => `pir-pendientes-${nombre}`;

export function colaVacia() {
  return { fallos: {}, preguntas_progreso: {}, flashcards_progreso: {}, rachas: null };
}

// Un fallo de red, no un rechazo del servidor. Un error de permisos o de
// datos no se encola: repetirlo más tarde fallaría igual y taparía el fallo
// de verdad.
export function esFalloDeRed(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const mensaje = (error && (error.message || error.msg)) || "";
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout/i.test(mensaje);
}

export function leerCola(nombre) {
  try {
    const crudo = localStorage.getItem(clave(nombre));
    if (!crudo) return colaVacia();
    const datos = JSON.parse(crudo);
    return { ...colaVacia(), ...(datos || {}) };
  } catch {
    return colaVacia();
  }
}

export function escribirCola(nombre, cola) {
  try {
    if (contarCola(cola) === 0) localStorage.removeItem(clave(nombre));
    else localStorage.setItem(clave(nombre), JSON.stringify(cola));
  } catch {}
}

export function contarCola(cola) {
  if (!cola) return 0;
  return (
    Object.keys(cola.fallos || {}).length +
    Object.keys(cola.preguntas_progreso || {}).length +
    Object.keys(cola.flashcards_progreso || {}).length +
    (cola.rachas ? 1 : 0)
  );
}

// Añade o reemplaza una fila. `rachas` es una sola fila por usuario, así que
// las tres funciones que la tocan van fundiendo sus campos sobre la misma.
export function conFila(cola, tabla, claveFila, fila) {
  if (tabla === "rachas") return { ...cola, rachas: { ...(cola.rachas || {}), ...fila } };
  return { ...cola, [tabla]: { ...(cola[tabla] || {}), [claveFila]: fila } };
}

export function sinFila(cola, tabla, claveFila) {
  if (tabla === "rachas") return { ...cola, rachas: null };
  const resto = { ...(cola[tabla] || {}) };
  delete resto[claveFila];
  return { ...cola, [tabla]: resto };
}

// Todo lo pendiente, en una lista plana para recorrerla al reconectar.
export function filasPendientes(cola) {
  const salida = [];
  ["fallos", "preguntas_progreso", "flashcards_progreso"].forEach((tabla) => {
    Object.entries(cola[tabla] || {}).forEach(([claveFila, fila]) => {
      salida.push({ tabla, claveFila, fila });
    });
  });
  if (cola.rachas) salida.push({ tabla: "rachas", claveFila: "rachas", fila: cola.rachas });
  return salida;
}

export const CONFLICTO = {
  fallos: "name,pregunta_id",
  preguntas_progreso: "name,pregunta_id",
  flashcards_progreso: "name,flashcard_id",
  rachas: "name",
};
