// Guarda el banco de preguntas en el navegador para no volver a descargarlo
// entero en cada carga.
//
// El banco ronda las 2100 preguntas con sus opciones y explicaciones: varios
// megas que hasta ahora viajaban por la red cada vez que alguien abría la
// app, y con datos móviles eso se nota tanto en la espera como en la factura.
//
// IndexedDB y no localStorage: localStorage ronda los 5 MB —demasiado cerca
// del tamaño del banco— y además es síncrono, así que serializarlo bloquearía
// la interfaz justo durante el arranque.
//
// Todo va envuelto en try/catch y devuelve null al fallar: en navegación
// privada, con el almacenamiento lleno o con las cookies bloqueadas, esto
// tiene que degradar a "descargar como siempre", nunca a romper la app.

import { bancoUsable } from "./logica.js";

const NOMBRE_BD = "autopir";
const ALMACEN = "cache";
const CLAVE = "preguntas";
const VERSION_BD = 1;

function abrirBD() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador no tiene IndexedDB."));
      return;
    }
    const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains(ALMACEN)) bd.createObjectStore(ALMACEN);
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
    peticion.onblocked = () => reject(new Error("IndexedDB bloqueada."));
  });
}

function operar(modo, hacer) {
  return new Promise((resolve, reject) => {
    abrirBD().then((bd) => {
      const tx = bd.transaction(ALMACEN, modo);
      const peticion = hacer(tx.objectStore(ALMACEN));
      tx.oncomplete = () => { bd.close(); resolve(peticion ? peticion.result : undefined); };
      tx.onerror = () => { bd.close(); reject(tx.error); };
      tx.onabort = () => { bd.close(); reject(tx.error); };
    }).catch(reject);
  });
}

// Devuelve { preguntas, guardadoEn, sello } o null si no hay nada utilizable.
// `sello` es el `actualizado_en` más reciente del banco en el momento de
// guardarlo: es lo que permite enterarse de una corrección de texto, que no
// cambia el recuento. Las copias guardadas antes de que existiera no lo
// traen, y entonces manda la caducidad por tiempo.
export async function leerPreguntasCache() {
  try {
    const guardado = await operar("readonly", (almacen) => almacen.get(CLAVE));
    if (!guardado) return null;
    // Una copia con filas rotas o repetidas se descarta entera y se vuelve a
    // descargar: es más barato que dibujar una lista en la que algo falla.
    if (!bancoUsable(guardado.preguntas)) return null;
    return guardado;
  } catch {
    return null;
  }
}

export async function guardarPreguntasCache(preguntas, sello = null) {
  // Tampoco se guarda lo que no se aceptaría al leer, o la copia mala
  // sobreviviría a los reinicios.
  if (!bancoUsable(preguntas)) return false;
  try {
    await operar("readwrite", (almacen) =>
      almacen.put({ preguntas, guardadoEn: Date.now(), sello }, CLAVE)
    );
    return true;
  } catch {
    return false;
  }
}

// Se llama cuando el admin toca el banco desde la propia app: su copia local
// deja de ser fiel al momento de editar, no en la siguiente comprobación.
export async function borrarPreguntasCache() {
  try {
    await operar("readwrite", (almacen) => almacen.delete(CLAVE));
    return true;
  } catch {
    return false;
  }
}
