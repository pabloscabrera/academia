// La lógica que se puede comprobar sin pintar nada.
//
// Vivía dentro de App.jsx, mezclada con los componentes. Un fichero .jsx no
// se puede importar desde Node, así que cada comprobación acababa siendo una
// copia del código en un borrador que se tiraba al terminar: servía para
// pensar, no para enterarse de si un cambio de mañana rompe lo de hoy.
//
// Aquí solo entra lo que no toca React, ni Supabase, ni el navegador: se le
// dan datos y devuelve datos. Lo que dependa del entorno se queda fuera (o
// se le pasa como argumento, como `ahora` en reconstruirTirada).

// ---------- Exámenes ----------

// El `curso` de una pregunta es texto libre y mezcla etiquetas de examen
// ("PIR 22") con nombres de asignatura sueltos de importaciones antiguas.
// Ojo con `\b`: se apoya en [A-Za-z0-9_], así que una tilde cuenta como
// separador y /^pir\b/i daba por examen cosas como "Pirámide de Maslow".
export function esExamen(curso) {
  return typeof curso === "string" && /^pir(?:[\s\d]|$)/i.test(curso.trim());
}

// Los exámenes oficiales transcritos del PDF no traían tema, así que se les
// puso "Pregunta N" de relleno. No es un tema y no debe salir en las listas.
export const TEMA_PLACEHOLDER = /^pregunta\s*\d+$/i;

export function esTemaReal(tema) {
  const t = (tema || "").trim();
  return !!t && !TEMA_PLACEHOLDER.test(t);
}

export function temasDisponibles(preguntas) {
  const nombres = [...new Set(preguntas.map((q) => (q.tema || "").trim()).filter(esTemaReal))];
  return nombres.sort((a, b) => a.localeCompare(b, "es"));
}

// ---------- Elegir qué preguntas entran en una autoevaluación ----------

// origen: "todas" | "sinacertar" | "fallos".
// "sinacertar" incluye lo que no se ha visto nunca; "fallos", lo que consta
// como fallado alguna vez aunque después se acertara.
export function filtrarPreguntas(base, { curso, tema, origen }, acertadaPorId, falladaPorId) {
  return base.filter((q) => {
    if (curso && curso !== "Todos" && q.curso !== curso) return false;
    if (tema && tema !== "Todos" && (q.tema || "").trim() !== tema) return false;
    if (origen === "sinacertar" && acertadaPorId[q.id]) return false;
    if (origen === "fallos" && !falladaPorId[q.id]) return false;
    return true;
  });
}

export function indicePorId(filas, campo, condicion) {
  const m = {};
  (filas || []).forEach((f) => { if (!condicion || condicion(f)) m[f[campo]] = true; });
  return m;
}

// "Practicar" desde "Dónde fallas" llega con un examen o un tema ya elegido.
// Pero esa pantalla agrupa por el `curso` y el `tema` en crudo, y los
// desplegables de aquí no los listan todos: el de exámenes deja fuera las
// etiquetas que no son una edición ("Psicopatología"), y el de temas depende
// de si están incluidas las preguntas inventadas. Un valor que no esté en su
// lista dejaría el desplegable en blanco, así que se cae a "Todos".
export function aplicarFiltroPedido(filtro, { cursos, temas }) {
  const elegido = (valor, lista) => (valor && lista.includes(valor) ? valor : "Todos");
  return {
    curso: elegido(filtro && filtro.curso, cursos),
    tema: elegido(filtro && filtro.tema, temas),
    origen: (filtro && filtro.origen) || "todas",
  };
}

// ---------- Retomar una autoevaluación a medias ----------

export const MAX_EDAD_TIRADA_MS = 7 * 24 * 60 * 60 * 1000;

// Todo o nada: si falta una sola pregunta del pool, o el índice guardado no
// cae dentro, se descarta. Rellenar huecos descuadraría los índices contra
// las respuestas ya dadas.
export function reconstruirTirada(guardada, questions, ahora = Date.now()) {
  if (!guardada || !Array.isArray(guardada.poolIds) || questions.length === 0) return null;
  if (ahora - (guardada.guardadoEn || 0) > MAX_EDAD_TIRADA_MS) return null;
  const porId = new Map(questions.map((q) => [q.id, q]));
  const pool = guardada.poolIds.map((id) => porId.get(id));
  if (pool.length === 0 || pool.some((q) => !q)) return null;
  const poolOriginal = (guardada.poolOriginalIds || guardada.poolIds).map((id) => porId.get(id));
  if (poolOriginal.some((q) => !q)) return null;
  if (!(guardada.idx >= 0 && guardada.idx < pool.length)) return null;
  const answers = (guardada.answers || []).map((a) => ({ ...a, pregunta: porId.get(a.qId) }));
  if (answers.some((a) => !a.pregunta)) return null;
  const resultados = {};
  (guardada.resultados || []).forEach((a) => {
    const pregunta = porId.get(a.qId);
    if (pregunta) resultados[a.qId] = { ...a, pregunta };
  });
  return { ...guardada, pool, poolOriginal, answers, resultados };
}

// ---------- Aciertos por examen y por tema ----------

// No hay un contador de aciertos en ninguna tabla: se deduce de los intentos
// (`preguntas_progreso.veces`) menos los fallos (`fallos.veces`).
export function agruparAciertos(preguntas, clave, progresoPorId, fallosPorId) {
  const grupos = new Map();
  preguntas.forEach((q) => {
    const nombre = clave(q);
    if (!nombre) return;
    if (!grupos.has(nombre)) grupos.set(nombre, { nombre, total: 0, hechas: 0, intentos: 0, aciertos: 0 });
    const g = grupos.get(nombre);
    g.total += 1;
    const intentos = (progresoPorId[q.id] && progresoPorId[q.id].veces) || 0;
    if (intentos > 0) {
      const fallidas = (fallosPorId[q.id] && fallosPorId[q.id].veces) || 0;
      g.hechas += 1;
      g.intentos += intentos;
      g.aciertos += Math.max(0, intentos - fallidas);
    }
  });
  // `pct: null` y no 0 en lo que no se ha empezado: es ausencia de dato, no
  // un mal resultado, y así no encabeza la lista de "lo que peor llevas".
  return [...grupos.values()].map((g) => ({
    ...g,
    pct: g.intentos > 0 ? Math.round((g.aciertos / g.intentos) * 100) : null,
  }));
}

// ---------- Flashcards ----------

// Repetición espaciada. calidad: 0 = Otra vez, 3 = Difícil, 4 = Bien,
// 5 = Fácil.
//
// Cada botón multiplica el intervalo actual por 1, 2, 3 o 4. Y ya está.
//
// Antes esto era el SM-2 (1987) con los retoques de Anki: el intervalo
// crecía por un "factor de facilidad" que la propia tarjeta iba arrastrando,
// así que el mismo botón daba un número distinto en cada tarjeta y no había
// manera de saber a qué atenerse. Con multiplicadores fijos, el botón que
// pulsas es el que decide: sobre 9 días, Difícil son 18, Bien 27, Fácil 36.
// Se puede predecir de cabeza, que es lo que hace que elegir signifique algo.
const MULTIPLICADOR = { 3: 2, 4: 3, 5: 4 };

// La escalera arranca en un día: una tarjeta nueva es "x1", y de ahí para
// arriba. Sin esto, multiplicar 0 por lo que sea sigue siendo 0.
const INTERVALO_BASE = 1;

export const EASE_MINIMO = 1.3;

// La facilidad ya NO decide el intervalo, pero se sigue guardando: es el
// poso de todo el feedback dado en esa tarjeta y de ahí salen las
// "atascadas" de la pantalla de estadísticas (EASE_ATASCADA). Los saltos son
// los de Anki; el SM-2 original restaba 0.8 al fallar y con dos fallos la
// tarjeta se quedaba clavada en el suelo de 1.3 sin forma de rescatarla.
const CAMBIO_EASE = { 0: -0.2, 3: -0.15, 4: 0, 5: 0.15 };

// Techo de días. Multiplicar por 3 cada vez se dispara enseguida: 1, 3, 9,
// 27, 81… y una tarjeta que vuelve dentro de tres meses es una tarjeta que
// no vuelves a ver antes del examen. Dos meses es el horizonte que se
// declaró aquí, y por encima de eso nada.
export const MAX_INTERVALO = 60;

export function calcularSM2(progresoPrevio, calidad, hoy = new Date(), tope = MAX_INTERVALO) {
  const easePrevio = (progresoPrevio && progresoPrevio.ease_factor) || 2.5;
  let repeticiones = (progresoPrevio && progresoPrevio.repeticiones) || 0;
  let intervalo = (progresoPrevio && progresoPrevio.intervalo_dias) || 0;

  const ease = Math.max(EASE_MINIMO, Math.round((easePrevio + (CAMBIO_EASE[calidad] ?? 0)) * 100) / 100);
  const techo = Math.max(1, tope);

  if (calidad < 3) {
    // "Otra vez" es x1: vuelve al primer peldaño y se empieza de nuevo. Es
    // lo que dice el botón, y devolverla dentro de un mes porque llevara un
    // mes aguantando sería justo lo contrario de haberla fallado.
    repeticiones = 0;
    intervalo = INTERVALO_BASE;
  } else {
    repeticiones += 1;
    const base = Math.max(INTERVALO_BASE, intervalo);
    const bruto = base * MULTIPLICADOR[calidad];
    // Contra el techo no se recorta por las bravas: se ENCOGE la escalera
    // entera. Con Math.min, una tarjeta de 27 días daría 54 / 60 / 60 y
    // "Bien" y "Fácil" volverían a ser el mismo botón — que es exactamente
    // la queja que se arregló hace dos cambios. Reduciendo las tres opciones
    // en la misma proporción se mantiene el 2:3:4 intacto (30 / 45 / 60),
    // solo que sobre una base más corta.
    const mayor = base * MULTIPLICADOR[5];
    const factor = mayor > techo ? techo / mayor : 1;
    intervalo = Math.max(1, Math.min(techo, Math.round(bruto * factor)));
  }

  const proxima = new Date(hoy.getTime() + intervalo * 86400000);
  return {
    ease_factor: ease,
    intervalo_dias: intervalo,
    repeticiones,
    proxima_revision: proxima.toISOString().slice(0, 10),
    ultima_revision: hoy.toISOString(),
  };
}

// Lo ya aplazado con el criterio anterior sigue en la base de datos con su
// fecha lejana: una tarjeta mandada a 103 días no vuelve sola dentro del
// techo por mucho que ahora el techo exista. No se reescribe nada — se
// adelanta al leer, y la próxima vez que la repases ya se guarda bien.
export function dentroDelHorizonte(progreso, hoy, tope = MAX_INTERVALO) {
  const limite = new Date(new Date(hoy + "T00:00:00Z").getTime() + Math.max(1, tope) * 86400000)
    .toISOString()
    .slice(0, 10);
  return (progreso || []).map((p) =>
    p && p.proxima_revision && p.proxima_revision > limite ? { ...p, proxima_revision: limite } : p
  );
}

// Primero lo que se marcó "Muy difícil" (queda con repeticiones = 0), luego
// el resto de pendientes por antigüedad de vencimiento, y al final lo nunca
// visto. Así el orden reacciona a la dificultad ya declarada, no solo a la
// fecha de vencimiento.
export function ordenarPorPrioridad(lista, progresoPorId, azar = Math.random) {
  const conPrioridad = lista.map((f) => {
    const p = progresoPorId[f.grupo_id || f.id];
    if (!p) return { f, prioridad: 2, orden: azar() };
    if (p.repeticiones === 0) return { f, prioridad: 0, orden: p.ultima_revision || "" };
    return { f, prioridad: 1, orden: p.proxima_revision || "" };
  });
  conPrioridad.sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
    if (a.prioridad === 2) return a.orden - b.orden;
    return String(a.orden).localeCompare(String(b.orden));
  });
  return conPrioridad.map((x) => x.f);
}

// La cola completa: TODAS las tarjetas puestas en el orden en que les toca
// volver a salir, no solo las que vencen hoy.
//
// Por qué existe. El modelo de Anki da por hecho que repasas a diario: si hoy
// no vence nada, hoy no hay nada que hacer. Quien estudia a ratos abre la app,
// quiere ponerse, y se encuentra un "vuelve mañana" — que es lo contrario de
// lo que conviene. Las fechas siguen calculándose igual; lo que cambia es que
// aquí se usan como ORDEN y no como permiso: primero lo vencido (lo más
// atrasado delante, y lo marcado "Otra vez" por encima de todo), luego lo
// nunca visto, y después lo que aún no toca, empezando por lo que vuelve
// antes. Así siempre se puede seguir, y lo que sale es siempre lo que más
// cerca está de olvidarse.
export function colaDeRepaso(lista, progresoPorId, hoy, azar = Math.random) {
  const vencidas = [];
  const futuras = [];
  for (const f of lista) {
    const p = progresoPorId[f.grupo_id || f.id];
    if (!p || !p.proxima_revision || p.proxima_revision <= hoy) vencidas.push(f);
    else futuras.push({ f, cuando: p.proxima_revision });
  }
  futuras.sort((a, b) => String(a.cuando).localeCompare(String(b.cuando)));
  return [
    ...ordenarPorPrioridad(vencidas, progresoPorId, azar),
    ...futuras.map((x) => x.f),
  ];
}

export const parsearEtiquetas = (texto) => [
  ...new Set((texto || "").split(",").map((e) => e.trim()).filter(Boolean)),
];

// ---------- Fechas ----------

// Lunes de la semana de `fecha`, en YYYY-MM-DD. La liga semanal se reinicia
// ahí, y el domingo cuenta como final de la semana que empezó el lunes, no
// como principio de la siguiente.
export function lunesDeLaSemana(fecha) {
  const d = new Date(fecha);
  const dia = d.getDay();
  const diff = (dia === 0 ? -6 : 1) - dia;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ---------- Red ----------

// Una petición a un servidor inalcanzable no falla: se queda colgada. Sin
// esto, la carga inicial dejaba la app en la ruedecita para siempre, sin
// decir nada, que por fuera es idéntico a "la app no abre".
export const ESPERA_MAX_CARGA_MS = 12000;

export function conTiempoLimite(promesa, ms, mensaje) {
  let reloj;
  const limite = new Promise((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(mensaje)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(reloj));
}

// Lo que se le enseña al usuario. El mensaje técnico de supabase-js ("Failed
// to fetch") no le dice nada a nadie.
export function mensajeDeCarga(error) {
  const texto = (error && error.message) || "";
  if (/tardando|timeout|failed to fetch|networkerror|load failed/i.test(texto)) {
    return "No se pudo contactar con el servidor. Comprueba tu conexión a internet y vuelve a intentarlo. Si sigue igual, avisa a Pablo.";
  }
  if (/api key|apikey|jwt|unauthorized|401/i.test(texto)) {
    return "El servidor ha rechazado la conexión. Esto lo tiene que mirar Pablo.";
  }
  return texto || "No se pudo cargar la aplicación.";
}

// ---------- Estadísticas de flashcards ----------
//
// Lo que hay para trabajar es el ESTADO ACTUAL de cada tarjeta
// (`flashcards_progreso`), no un historial de repasos: no se guarda una fila
// por repaso, así que no se puede dibujar la curva de retención ni "aciertos
// por día" de Anki. Lo que sí sale de aquí, y es lo que de verdad decide qué
// estudiar:
//
//   - `ease_factor` es el poso de TODO el feedback de dificultad que has dado
//     en esa tarjeta (arranca en 2.5, baja mucho con "Muy difícil", sube poco
//     con "Muy fácil", suelo en 1.3). Es la medida de cuánto se te atraganta.
//   - `intervalo_dias` dice cuánto has consolidado: ver una tarjeta muchas
//     veces no es saberla; aguantar 21 días sin verla, sí.
//   - `proxima_revision` permite avisar de la carga que viene encima.

// Corte de "madura": el mismo que usa Anki. Por debajo, la tarjeta todavía
// depende de haberla visto hace poco.
export const DIAS_MADURA = 21;
// Por debajo de esto, el algoritmo ya ha decidido que esa tarjeta se te
// resiste: la estás fallando una y otra vez.
export const EASE_ATASCADA = 1.8;

export function clasificarTarjeta(p) {
  if (!p || (!p.ultima_revision && !p.repeticiones)) return "nueva";
  if ((p.repeticiones || 0) === 0) return "reaprendiendo";
  return (p.intervalo_dias || 0) >= DIAS_MADURA ? "madura" : "joven";
}

const sumarDias = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// El resumen de un conjunto de tarjetas: estados, carga que viene, y las que
// se atragantan.
export function estadisticasFlashcards(tarjetas, progresoPorId, hoy, diasPrevision = 14) {
  const conteo = { nueva: 0, reaprendiendo: 0, joven: 0, madura: 0 };
  let sumaEase = 0, conEase = 0, atrasadas = 0, pendientesHoy = 0, repasadasHoy = 0;
  const atascadas = [];
  const porFecha = {};

  tarjetas.forEach((f) => {
    const p = progresoPorId[f.grupo_id || f.id];
    conteo[clasificarTarjeta(p)] += 1;

    if (p && p.ease_factor) { sumaEase += p.ease_factor; conEase += 1; }
    if (p && p.ease_factor && p.ease_factor <= EASE_ATASCADA) {
      atascadas.push({ tarjeta: f, ease: p.ease_factor, intervalo: p.intervalo_dias || 0 });
    }
    if (p && p.ultima_revision && String(p.ultima_revision).slice(0, 10) === hoy) repasadasHoy += 1;

    if (!p || !p.proxima_revision) { pendientesHoy += 1; return; }
    if (p.proxima_revision < hoy) { atrasadas += 1; pendientesHoy += 1; return; }
    if (p.proxima_revision === hoy) { pendientesHoy += 1; }
    porFecha[p.proxima_revision] = (porFecha[p.proxima_revision] || 0) + 1;
  });

  const prevision = [];
  for (let i = 0; i < diasPrevision; i++) {
    const fecha = sumarDias(hoy, i);
    prevision.push({ fecha, cuantas: (porFecha[fecha] || 0) + (i === 0 ? atrasadas + conteo.nueva : 0) });
  }

  // Las peores primero, y a igualdad de dificultad la que menos aguanta.
  atascadas.sort((a, b) => a.ease - b.ease || a.intervalo - b.intervalo);

  const vistas = conteo.reaprendiendo + conteo.joven + conteo.madura;
  return {
    total: tarjetas.length,
    ...conteo,
    vistas,
    pendientesHoy,
    atrasadas,
    repasadasHoy,
    easeMedio: conEase > 0 ? Math.round((sumaEase / conEase) * 100) / 100 : null,
    // Sobre las vistas, no sobre el total: si no, añadir tarjetas nuevas
    // hundiría el porcentaje y parecería que vas peor por estudiar más.
    pctMaduras: vistas > 0 ? Math.round((conteo.madura / vistas) * 100) : null,
    atascadas,
    prevision,
  };
}

// Mismo cálculo troceado por mazo o por etiqueta. `claves(f)` devuelve una
// lista, porque una tarjeta puede llevar varias etiquetas y cuenta en todas.
export function agruparEstadisticas(tarjetas, progresoPorId, claves, hoy) {
  const grupos = new Map();
  tarjetas.forEach((f) => {
    claves(f).forEach((nombre) => {
      if (!nombre) return;
      if (!grupos.has(nombre)) grupos.set(nombre, []);
      grupos.get(nombre).push(f);
    });
  });
  return [...grupos.entries()]
    .map(([nombre, lista]) => ({ nombre, ...estadisticasFlashcards(lista, progresoPorId, hoy, 0) }))
    // Lo que peor llevas, arriba: primero lo más atragantado (ease bajo), y
    // entre dos que van igual, lo que tiene más tarjetas en juego.
    .sort((a, b) => {
      if (a.easeMedio === null && b.easeMedio === null) return b.total - a.total;
      if (a.easeMedio === null) return 1;
      if (b.easeMedio === null) return -1;
      return a.easeMedio - b.easeMedio || b.total - a.total;
    });
}

// ---------- Retención (necesita `flashcards_repasos`) ----------
//
// Retención = de lo que repasas, cuánto aciertas. Un repaso cuenta como
// acierto si no lo marcaste "Muy difícil" (calidad >= 3), que es justo el
// punto donde el algoritmo decide si te lo sabías o hay que reiniciar.
//
// Anki apunta a ~90%: por debajo estás olvidando demasiado y los intervalos
// son largos; muy por encima, te sobra repaso y estás perdiendo tiempo.
export const RETENCION_OBJETIVO = 90;

export function retencionGlobal(repasos) {
  if (!repasos || repasos.length === 0) return null;
  const aciertos = repasos.filter((r) => r.acierto).length;
  return { repasos: repasos.length, aciertos, pct: Math.round((aciertos / repasos.length) * 100) };
}

const inicioSemana = (iso) => {
  const d = new Date(iso);
  const dia = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + ((dia === 0 ? -6 : 1) - dia));
  return d.toISOString().slice(0, 10);
};

// Una fila por semana, de la más antigua a la más reciente. Las semanas sin
// un solo repaso salen con `pct: null`: no repasar no es fallar, y pintarlo
// como un 0% sería mentir sobre cómo lo llevas.
export function retencionPorSemana(repasos, hoy, semanas = 8) {
  const lunes = [];
  const base = inicioSemana(hoy + "T00:00:00Z");
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(base + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - i * 7);
    lunes.push(d.toISOString().slice(0, 10));
  }
  const cubos = {};
  lunes.forEach((l) => { cubos[l] = { semana: l, repasos: 0, aciertos: 0 }; });
  (repasos || []).forEach((r) => {
    const l = inicioSemana(r.creado_en);
    if (cubos[l]) { cubos[l].repasos += 1; if (r.acierto) cubos[l].aciertos += 1; }
  });
  return lunes.map((l) => {
    const c = cubos[l];
    return { ...c, pct: c.repasos > 0 ? Math.round((c.aciertos / c.repasos) * 100) : null };
  });
}

// El corte por intervalo es el que de verdad acciona algo: si a tres semanas
// aciertas el 60%, el problema no es que estudies poco, es que el algoritmo
// te las está espaciando más de lo que aguantas.
export const TRAMOS_INTERVALO = [
  { hasta: 1, texto: "1 día" },
  { hasta: 3, texto: "2-3 días" },
  { hasta: 7, texto: "4-7 días" },
  { hasta: 21, texto: "1-3 semanas" },
  { hasta: Infinity, texto: "más de 3 semanas" },
];

export function retencionPorIntervalo(repasos) {
  const cubos = TRAMOS_INTERVALO.map((t) => ({ texto: t.texto, repasos: 0, aciertos: 0 }));
  (repasos || []).forEach((r) => {
    const dias = r.intervalo_antes || 0;
    const i = TRAMOS_INTERVALO.findIndex((t) => dias <= t.hasta);
    const cubo = cubos[i === -1 ? cubos.length - 1 : i];
    cubo.repasos += 1;
    if (r.acierto) cubo.aciertos += 1;
  });
  return cubos.map((c) => ({ ...c, pct: c.repasos > 0 ? Math.round((c.aciertos / c.repasos) * 100) : null }));
}

// Lo que se hizo de verdad cada día, que no es lo mismo que lo que tocaba.
export function repasosPorDia(repasos, hoy, dias = 14) {
  const salida = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    const fecha = d.toISOString().slice(0, 10);
    const delDia = (repasos || []).filter((r) => String(r.creado_en).slice(0, 10) === fecha);
    salida.push({ fecha, cuantas: delDia.length });
  }
  return salida;
}

// ---------- Mezclar temas dentro de la sesión ----------
//
// Repasar agrupado por tema se siente más fácil y retiene peor: el cerebro
// coge carrerilla con el contexto y deja de recuperar de verdad. Alternar
// cuesta más durante la sesión y se recuerda mejor después.
//
// No se baraja del todo: eso tiraría por la borda el orden por urgencia. Se
// mira solo unas pocas posiciones por delante (`ventana`) buscando una
// tarjeta de otro tema; si no la hay cerca, manda la urgencia.
export function mezclarTemas(lista, claveDe, ventana = 5) {
  const pendientes = [...lista];
  const salida = [];
  let anterior = null;
  while (pendientes.length > 0) {
    let elegido = 0;
    if (anterior !== null) {
      const limite = Math.min(ventana, pendientes.length);
      for (let i = 0; i < limite; i++) {
        if (claveDe(pendientes[i]) !== anterior) { elegido = i; break; }
      }
    }
    const [carta] = pendientes.splice(elegido, 1);
    salida.push(carta);
    anterior = claveDe(carta);
  }
  return salida;
}

// El tema de una tarjeta a efectos de mezclar: su primera etiqueta, y si no
// tiene, su mazo. Sin esto, un mazo de un solo tema no se mezclaría nunca.
export const temaDeTarjeta = (f) =>
  ((f.etiquetas && f.etiquetas[0]) || f.mazo || "General");

// ---------- Llegar a una fecha con todo consolidado ----------
//
// Una tarjeta no se consolida el día que la empiezas: el algoritmo la va
// espaciando 1, 6, ~15 días… así que desde que la ves por primera vez hasta
// que aguanta tres semanas pasa aproximadamente un mes. Eso marca una fecha
// tope para EMPEZAR tarjetas nuevas, que es el dato que nadie calcula y el
// que de verdad aprieta.
export const DIAS_PARA_CONSOLIDAR = 30;

const diasEntre = (desde, hasta) =>
  Math.round((new Date(hasta + "T00:00:00Z") - new Date(desde + "T00:00:00Z")) / 86400000);

export function planHastaObjetivo(stats, hoy, fechaObjetivo) {
  if (!fechaObjetivo) return null;
  const dias = diasEntre(hoy, fechaObjetivo);
  if (dias < 0) return { dias, pasada: true };

  const sinConsolidar = stats.nueva + stats.reaprendiendo + stats.joven;
  // Último día con sentido para estrenar una tarjeta y que llegue madura.
  const diasParaEstrenar = dias - DIAS_PARA_CONSOLIDAR;
  const nuevasPorDia = diasParaEstrenar > 0 ? Math.ceil(stats.nueva / diasParaEstrenar) : null;

  return {
    dias,
    pasada: false,
    sinConsolidar,
    nuevas: stats.nueva,
    diasParaEstrenar,
    // null = ya no da tiempo a estrenar nada nuevo y que cuaje; a partir de
    // ahí lo que toca es consolidar lo empezado, no abrir frentes.
    nuevasPorDia,
    llegasConLoEmpezado: dias >= DIAS_PARA_CONSOLIDAR,
  };
}

// "36 d", "3 meses", "1,2 años": el número pelado de días deja de decir
// nada en cuanto pasa de un par de meses.
export function textoIntervalo(dias) {
  if (!dias || dias < 1) return "hoy";
  if (dias === 1) return "1 día";
  // Todo lo que cabe dentro del techo se dice en días: "36 días" sitúa mejor
  // que "1 mes" cuando estás decidiendo entre dos botones.
  if (dias <= MAX_INTERVALO) return `${dias} días`;
  if (dias < 365) {
    const meses = Math.round(dias / 30.4);
    return `${meses} ${meses === 1 ? "mes" : "meses"}`;
  }
  const anios = Math.round((dias / 365) * 10) / 10;
  return `${String(anios).replace(".", ",")} ${anios === 1 ? "año" : "años"}`;
}

// ---------- Ruleta diaria ----------
//
// La pregunta se elige AL PULSAR, no cuando termina la animación. Antes se
// sorteaba dentro del setTimeout de 3 segundos, y esos 3 segundos eran una
// ventana en la que todo se podía perder: la ruleta vive dentro de un
// desplegable de la cabecera, así que cualquier toque en la pantalla lo
// cierra, desmonta el componente y el resultado no llega a existir — pero el
// temporizador SÍ seguía corriendo y marcaba el giro como gastado en
// Supabase. Resultado: "ya has girado hoy" sin haber visto una sola
// pregunta, y hasta el día siguiente.

export const MAX_CURSOS_RULETA = 6;

export function cursosDeRuleta(questions, max = MAX_CURSOS_RULETA) {
  const reales = (questions || []).filter((q) => q && !q.inventada && q.curso);
  return [...new Set(reales.map((q) => q.curso))].slice(0, max);
}

// `azar` entra por argumento para poder fijarlo en una prueba.
export function elegirPreguntaRuleta(questions, cursos, azar = Math.random) {
  if (!cursos || cursos.length === 0) return null;
  const indice = Math.floor(azar() * cursos.length);
  const curso = cursos[Math.min(indice, cursos.length - 1)];
  const delCurso = (questions || []).filter((q) => q && !q.inventada && q.curso === curso);
  if (delCurso.length === 0) return null;
  const pregunta = delCurso[Math.min(Math.floor(azar() * delCurso.length), delCurso.length - 1)];
  return { indice: cursos.indexOf(curso), curso, pregunta };
}

// Se guarda el id, no la pregunta entera: así nunca resucita el texto viejo
// de una pregunta corregida por SQL entre medias, igual que en las tiradas.
export function reconstruirRuleta(guardada, questions, cursos, hoy) {
  if (!guardada || guardada.fecha !== hoy || !guardada.preguntaId) return null;
  const pregunta = (questions || []).find((q) => q && q.id === guardada.preguntaId);
  if (!pregunta) return null;
  const curso = guardada.curso || pregunta.curso;
  return { indice: (cursos || []).indexOf(curso), curso, pregunta };
}

// ---------------------------------------------------------------------------
// Cuándo volver a descargar el banco de preguntas
// ---------------------------------------------------------------------------
// El banco vive guardado en el navegador, y la pregunta en cada arranque es si
// la copia sigue siendo fiel. Comparar el RECUENTO detecta altas y bajas, pero
// no una corrección de texto: las erratas que se arreglan por SQL no cambian
// ningún número. Por eso se pide además el `actualizado_en` más reciente (una
// fila, unos 100 bytes), que sí se mueve con cada `update`.
//
// Un día antes de volver a fiarse solo del recuento. Solo se usa cuando no hay
// sello —la columna todavía no existe, o la consulta falló—, para que la app
// siga funcionando sin la migración en vez de quedarse con una copia eterna.
export const MAX_EDAD_CACHE_MS = 24 * 60 * 60 * 1000;

// El sello se saca de las filas DESCARGADAS, no de la consulta previa: si una
// corrección entra justo entre una y otra, guardar el sello de la consulta
// dejaría la copia vieja marcada como al día para siempre.
export function selloDeFilas(filas) {
  let mejor = null;
  let mejorMs = -Infinity;
  for (const fila of filas || []) {
    const valor = fila && fila.actualizado_en;
    if (!valor) continue;
    const ms = Date.parse(valor);
    if (Number.isNaN(ms) || ms <= mejorMs) continue;
    mejorMs = ms;
    mejor = valor;
  }
  return mejor;
}

// `count`/`sello` son lo que respondió el servidor; `null` significa que esa
// consulta no se pudo hacer.
export function hayQueDescargar(cache, { count = null, sello = null, ahora = Date.now(), maxEdad = MAX_EDAD_CACHE_MS } = {}) {
  if (!cache || !Array.isArray(cache.preguntas) || cache.preguntas.length === 0) return true;
  if (typeof count === "number" && count !== cache.preguntas.length) return true;
  // Con sello no hace falta caducar por tiempo: cualquier cambio en el banco
  // lo mueve, así que mientras coincida la copia es exacta.
  if (sello) return cache.sello !== sello;
  return ahora - (cache.guardadoEn || 0) >= maxEdad;
}

// ---------------------------------------------------------------------------
// ¿Es utilizable el banco que viene de la copia local?
// ---------------------------------------------------------------------------
// La copia guardada en el navegador puede quedarse en mal estado: una descarga
// cortada a medias, una versión antigua del formato, o filas repetidas por una
// paginación inestable. Y una fila rota no se nota al guardarla sino al
// dibujarla, que es cuando ya estorba.
//
// Es todo o nada, como la reconstrucción de una tirada a medias: si algo no
// cuadra se tira la copia entera y se vuelve a descargar, en vez de colar filas
// a medio hacer en la lista. Descargar de más es barato; una tarjeta que no
// responde al tocarla, no.
export function preguntaUsable(q) {
  if (!q || typeof q !== "object") return false;
  if (typeof q.id !== "string" || !q.id) return false;
  if (typeof q.pregunta !== "string" || !q.pregunta.trim()) return false;
  if (!Array.isArray(q.opciones) || q.opciones.length < 2) return false;
  return q.opciones.every((o) => typeof o === "string");
}

export function bancoUsable(preguntas) {
  if (!Array.isArray(preguntas) || preguntas.length === 0) return false;
  const vistos = new Set();
  for (const q of preguntas) {
    if (!preguntaUsable(q)) return false;
    // Un id repetido significa que la descarga trajo la misma fila dos veces;
    // React las dibuja con la misma clave y la lista deja de ser fiable.
    if (vistos.has(q.id)) return false;
    vistos.add(q.id);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Color e icono por mazo
// ---------------------------------------------------------------------------
// Un mazo no es una entidad: `mazo` es una etiqueta de texto repetida en cada
// tarjeta, y la lista sale de agrupar. El estilo vive aparte, en una tabla con
// clave (user_id, mazo), y puede no existir — un mazo sin estilo se ve como se
// veía antes. De ahí que esto no invente nada: devuelve null y decide quien
// dibuja.
//
// Los nombres que se guardan (el del icono y el de la clave de color) son
// texto, no objetos: la tabla no sabe nada de lucide ni de la paleta, así que
// quitar un icono del catálogo mañana no deja una fila ilegible, solo un mazo
// que vuelve a su aspecto por defecto. Por eso `estiloDeMazo` **valida contra
// los catálogos que se le pasan** en vez de confiar en lo guardado.
export function indiceEstilosMazo(filas) {
  const m = new Map();
  for (const f of filas || []) {
    if (!f || typeof f.mazo !== "string") continue;
    m.set(f.mazo, { icono: f.icono || null, color: f.color || null });
  }
  return m;
}

export function estiloDeMazo(estilos, mazo, iconosValidos, coloresValidos) {
  const guardado = (estilos && estilos.get && estilos.get(mazo)) || null;
  const icono = guardado && iconosValidos && iconosValidos.includes(guardado.icono)
    ? guardado.icono : null;
  const color = guardado && coloresValidos && coloresValidos.includes(guardado.color)
    ? guardado.color : null;
  return { icono, color };
}

// Al renombrar un mazo su estilo tiene que seguirle. Y "enviar un mazo a otro"
// es renombrarlo para que coincida con el destino, así que el destino puede ya
// tener estilo propio: en ese caso manda el suyo y el del origen se descarta,
// que es lo que uno espera al fundir dos mazos en uno.
export function estiloTrasRenombrar(estilos, viejo, nuevo) {
  const origen = (estilos && estilos.get && estilos.get(viejo)) || null;
  const destinoYaTiene = !!(estilos && estilos.get && estilos.get(nuevo));
  if (!origen || destinoYaTiene) return { mover: false, estilo: null };
  return { mover: true, estilo: origen };
}

// ---------------------------------------------------------------------------
// Cuadrícula de tarjetas, coloreada por la última calificación
// ---------------------------------------------------------------------------
// `flashcards_progreso` guarda el estado actual de cada tarjeta, pero NO qué
// botón se pulsó: eso solo está en `flashcards_repasos`, una fila por repaso.
// De ahí salen tres estados y no dos, y conviene no fundirlos:
//
//   "nueva"        — sin fila de progreso: nunca ha salido.
//   "sin-registro" — repasada, pero sin repaso suyo en lo cargado. Pasa con lo
//                    anterior a que existiera `flashcards_repasos` y con lo más
//                    viejo que la ventana que se descarga. Pintarlo de gris
//                    sería mentir: esa tarjeta sí se ha repasado.
//   0 | 3 | 4 | 5  — la calificación del repaso más reciente.
//
// Se va rellenando solo: en cuanto una tarjeta se repasa otra vez, pasa a tener
// calificación.
export function ultimaCalificacionPorTarjeta(repasos) {
  const ultima = new Map();
  for (const r of repasos || []) {
    if (!r || !r.flashcard_id || typeof r.calidad !== "number") continue;
    const previo = ultima.get(r.flashcard_id);
    // Sin `creado_en` se queda la primera vista, que es mejor que tirar la fila.
    if (!previo || String(r.creado_en || "") > String(previo.creado_en || "")) {
      ultima.set(r.flashcard_id, { calidad: r.calidad, creado_en: r.creado_en });
    }
  }
  const m = new Map();
  for (const [id, v] of ultima) m.set(id, v.calidad);
  return m;
}

export function estadoCuadricula(tarjeta, progresoPorId, ultimas) {
  const clave = tarjeta && (tarjeta.grupo_id || tarjeta.id);
  const progreso = progresoPorId && progresoPorId[clave];
  // Una fila de progreso sin repeticiones es una tarjeta que aún no ha salido.
  if (!progreso || !progreso.ultima_revision) return "nueva";
  const calidad = ultimas && ultimas.get ? ultimas.get(clave) : undefined;
  return typeof calidad === "number" ? calidad : "sin-registro";
}
