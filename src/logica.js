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

// Repetición espaciada estilo Anki (SM-2). calidad: 0 = Muy difícil (fallo,
// se reinicia), 3 = Difícil, 4 = Fácil, 5 = Muy fácil.
export function calcularSM2(progresoPrevio, calidad, hoy = new Date()) {
  let ease = (progresoPrevio && progresoPrevio.ease_factor) || 2.5;
  let repeticiones = (progresoPrevio && progresoPrevio.repeticiones) || 0;
  let intervalo = (progresoPrevio && progresoPrevio.intervalo_dias) || 0;

  if (calidad < 3) {
    repeticiones = 0;
    intervalo = 1;
  } else {
    repeticiones += 1;
    if (repeticiones === 1) intervalo = 1;
    else if (repeticiones === 2) intervalo = 6;
    else intervalo = Math.round(intervalo * ease);
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - calidad) * (0.08 + (5 - calidad) * 0.02)));

  const proxima = new Date(hoy.getTime() + intervalo * 86400000);
  return {
    ease_factor: Math.round(ease * 100) / 100,
    intervalo_dias: intervalo,
    repeticiones,
    proxima_revision: proxima.toISOString().slice(0, 10),
    ultima_revision: hoy.toISOString(),
  };
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

// ---------- Repartir los picos de carga ----------
//
// Que un jueves caigan 90 tarjetas no es un problema del algoritmo, es que
// se acumularon. Adelantar unas cuantas hoy lo deshace. Repasar antes de
// tiempo recorta un poco el espaciado, así que solo se propone cuando el
// pico es de verdad, no por tres tarjetas de más.
export const PICO_MINIMO = 25;

export function sugerirAdelanto(prevision, margen = 1.6) {
  if (!prevision || prevision.length < 3) return null;
  const futuros = prevision.slice(1);
  const conCarga = futuros.filter((d) => d.cuantas > 0);
  if (conCarga.length === 0) return null;

  const media = conCarga.reduce((a, d) => a + d.cuantas, 0) / conCarga.length;
  const pico = futuros.reduce((max, d) => (d.cuantas > max.cuantas ? d : max), futuros[0]);
  if (pico.cuantas < PICO_MINIMO || pico.cuantas < media * margen) return null;

  // Se propone bajar el pico hasta la media, sin pasarse: adelantar media
  // sesión de golpe cansa más de lo que ahorra.
  const aAdelantar = Math.min(Math.round(pico.cuantas - media), 25);
  if (aAdelantar < 5) return null;
  return { fecha: pico.fecha, cuantas: pico.cuantas, adelantar: aAdelantar, quedarian: pico.cuantas - aAdelantar };
}

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
