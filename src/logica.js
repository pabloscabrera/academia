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

// Bancos que se practican como un examen más (salen en el desplegable de
// "Examen" con su propio nombre) pero que NO son una edición del PIR. Por eso
// esExamen les sigue diciendo que no, y el modo relámpago, que solo baraja
// ediciones del PIR, se queda sin ellos: lo pidió así el usuario ("en modo
// relámpago siguen siendo solo los exámenes").
export const BANCOS_COMO_EXAMEN = ["DSM-5-TR"];

export function esBancoComoExamen(curso) {
  return typeof curso === "string" && BANCOS_COMO_EXAMEN.includes(curso.trim());
}

// Lo que lista el desplegable de exámenes: "Todos", las ediciones del PIR de
// la más nueva a la más vieja, y detrás los bancos de BANCOS_COMO_EXAMEN.
// Van al final y no mezclados porque el orden de los PIR sale del número de
// la edición, y el "5" de "DSM-5-TR" no es ninguna edición: ordenado igual,
// el DSM caería entre los PIR como si fuera el de 2005.
export function cursosDelDesplegable(preguntas) {
  const presentes = [...new Set((preguntas || []).map((q) => q && q.curso))];
  const numero = (c) => parseInt(c.match(/\d+/), 10) || 0;
  const ediciones = presentes.filter(esExamen).sort((a, b) => numero(b) - numero(a));
  const bancos = presentes.filter(esBancoComoExamen)
    .sort((a, b) => BANCOS_COMO_EXAMEN.indexOf(a.trim()) - BANCOS_COMO_EXAMEN.indexOf(b.trim()));
  return ["Todos", ...ediciones, ...bancos];
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

// Aciertos y fallos para el marcador de la cabecera de una tirada, para ir
// sabiendo cómo vas sin esperar al final.
//
// Cuenta el PRIMER intento, que es la nota que de verdad vale: es lo que
// enseña la pantalla de resultados (`primerIntento`) y lo mismo que se guarda
// en Supabase, donde todo va limitado a `ronda === 1`. Si contara también los
// repasos, el marcador diría una cosa y el resumen final otra.
//
// Por eso a partir de la ronda 2 se queda CLAVADO: ahí `answers` se vacía y
// solo vuelven las falladas, así que acertar una que ya fallaste no te sube
// la nota — se lee de `primerIntento`, que ya está cerrado.
//
// `enCurso` es la pregunta que acabas de contestar pero que todavía no ha
// entrado en `answers` (se añade al pulsar "Siguiente"): `true` si la
// acertaste, `false` si no, `null` si aún no has elegido. Va aparte para que
// el número se mueva en el mismo instante en que la opción se pinta de verde
// o de rojo, y no un toque después.
export function marcadorTirada(answers, ronda, primerIntento, enCurso = null) {
  if (ronda > 1 && primerIntento) {
    const aciertos = primerIntento.correctCount || 0;
    return { aciertos, fallos: Math.max(0, (primerIntento.total || 0) - aciertos) };
  }
  const lista = answers || [];
  let aciertos = lista.filter((a) => a && a.correct).length;
  let fallos = lista.length - aciertos;
  if (enCurso === true) aciertos += 1;
  else if (enCurso === false) fallos += 1;
  return { aciertos, fallos };
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
//
// **El desempate es la parte delicada, y son dos criterios, en este orden.**
// Si contestas "Fácil" a todas, todas se van al mismo día, y entonces decide
// quien venga detrás. Al principio no venía nadie: mandaba el orden de la
// lista, siempre el mismo, así que repasabas la misma secuencia una y otra vez
// y acababas aprendiéndote el orden en vez de la tarjeta. Sortearlo arregló
// eso pero abrió lo contrario: con azar puro una tarjeta puede volver a
// tocarte mañana sin que las demás hayan salido todavía.
//
// Así que primero **la que hace más que no ves** (`ultima_revision`, que es un
// instante completo, no un día), y solo cuando eso también empata, el sorteo.
// Es un reparto SIN reemplazo y no hace falta guardar nada nuevo: repasar una
// actualiza su `ultima_revision` y la manda al final de su grupo ella sola, así
// que la rueda da la vuelta entera antes de repetir. El azar se queda para lo
// que de verdad está a la par — lo nunca visto, o lo que se repasó en el mismo
// instante.
export function ordenarPorPrioridad(lista, progresoPorId, azar = Math.random) {
  const conPrioridad = lista.map((f) => {
    const p = progresoPorId[f.grupo_id || f.id];
    const sorteo = azar();
    if (!p) return { f, prioridad: 2, orden: sorteo, visto: "", sorteo };
    const visto = p.ultima_revision || "";
    if (p.repeticiones === 0) return { f, prioridad: 0, orden: visto, visto, sorteo };
    return { f, prioridad: 1, orden: p.proxima_revision || "", visto, sorteo };
  });
  conPrioridad.sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
    if (a.prioridad === 2) return a.orden - b.orden;
    const porFecha = String(a.orden).localeCompare(String(b.orden));
    if (porFecha !== 0) return porFecha;
    const porVisto = String(a.visto).localeCompare(String(b.visto));
    return porVisto !== 0 ? porVisto : a.sorteo - b.sorteo;
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
// cerca está de olvidarse. Dentro de un mismo día sale primero la que hace más
// que no ves, así la rueda da la vuelta entera antes de repetir ninguna.
export function colaDeRepaso(lista, progresoPorId, hoy, azar = Math.random) {
  const vencidas = [];
  const futuras = [];
  for (const f of lista) {
    const p = progresoPorId[f.grupo_id || f.id];
    if (!p || !p.proxima_revision || p.proxima_revision <= hoy) vencidas.push(f);
    else futuras.push({ f, cuando: p.proxima_revision, visto: p.ultima_revision || "", sorteo: azar() });
  }
  // Mismo desempate que arriba: entre las que vuelven el mismo día, primero la
  // que hace más que no ves, y el azar solo si eso también empata.
  futuras.sort((a, b) => {
    const porFecha = String(a.cuando).localeCompare(String(b.cuando));
    if (porFecha !== 0) return porFecha;
    const porVisto = String(a.visto).localeCompare(String(b.visto));
    return porVisto !== 0 ? porVisto : a.sorteo - b.sorteo;
  });
  return [
    ...ordenarPorPrioridad(vencidas, progresoPorId, azar),
    ...futuras.map((x) => x.f),
  ];
}

// Baraja DENTRO de cada nivel, sin mezclar niveles.
//
// Esto nace de dos peticiones que parecen contradecirse y no lo son, y por eso
// conviene dejar escrito cómo se resuelven, no sea que alguien "arregle" una
// rompiendo la otra:
//
//   (a) "que no se repitan antes de que vuelvan a salir otras" — de ahí el
//       desempate por `ultima_revision` de `colaDeRepaso`.
//   (b) "aunque me las supiera, que salga b b a b a a a b, cada vez aleatorio
//       dentro de la misma dificultad, para no aprenderme el orden".
//
// El desempate de (a) las deja clavadas: `ultima_revision` es un instante
// exacto, así que no empata casi nunca y el sorteo que había detrás no llegaba
// a usarse — repasar una la manda al final de su grupo, y la vuelta siguiente
// sale en la MISMA secuencia. Eso es justo lo que se aprende de memoria en
// lugar de la tarjeta.
//
// La salida es separar dos cosas que estaban juntas: **`ultima_revision` elige
// QUIÉN entra en la sesión, y esta función decide EN QUÉ ORDEN sale.** Se
// aplica después de cortar a la cantidad pedida, así que el reparto sin
// repeticiones se mantiene intacto —son las mismas tarjetas— y lo único que
// cambia es la secuencia, que ahora es distinta cada vez.
//
// Lo que NO hace, y es la mitad del asunto: no mezcla niveles. Lo marcado
// "Otra vez" sigue delante de todo, lo vencido antes de lo nunca visto, y
// dentro de lo vencido lo más atrasado primero — "que salgan primero las que
// más cuestan" se mantiene. Se baraja solo entre las que están empatadas, que
// son las que producían el "a a a a b b b b".
export function barajarEnBloques(lista, progresoPorId, hoy, azar = Math.random) {
  const clave = (f) => {
    const p = progresoPorId[f.grupo_id || f.id];
    if (!p) return "2";                                  // nunca vista
    if (p.repeticiones === 0) return "0";                // recién marcada "Otra vez"
    const cuando = p.proxima_revision || "";
    // Las vencidas se agrupan por el día que les tocaba: así una atrasada diez
    // días no se baraja con una de ayer, pero las que comparten fecha —que son
    // las que se contestaron en la misma sesión, o sea el bloque entero— sí.
    if (!cuando || cuando <= hoy) return `1|${cuando}`;
    return `3|${cuando}`;                                // aún no toca
  };
  const grupos = new Map();
  for (const f of lista || []) {
    const k = clave(f);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(f);
  }
  // `Map` conserva el orden de inserción, así que los bloques salen en el
  // mismo orden en que venían: el nivel lo sigue decidiendo quien ordenó.
  const salida = [];
  for (const bloque of grupos.values()) {
    for (let i = bloque.length - 1; i > 0; i--) {
      // `Math.min` porque un `azar()` de 1 exacto se saldría del array. Ya
      // pasó en `elegirPreguntaRuleta`.
      const j = Math.min(i, Math.floor(azar() * (i + 1)));
      const t = bloque[i];
      bloque[i] = bloque[j];
      bloque[j] = t;
    }
    salida.push(...bloque);
  }
  return salida;
}

// ---------- Lo que fallas vuelve ANTES de acabar la sesión ----------
//
// Es el paso de aprendizaje de Anki, y es lo que faltaba para que el feedback
// sirviera de algo en el momento: hasta aquí, marcar "Otra vez" solo movía una
// fecha, así que la tarjeta que acababas de fallar no volvías a verla hasta el
// día siguiente — con la respuesta ya olvidada otra vez. Ahora se cuela de
// nuevo en la cola de ESTA sesión, por detrás de unas cuantas, para que llegue
// con el recuerdo ya un poco frío (verla otra vez acto seguido no enseña nada,
// la estarías leyendo, no recordándola).
//
// "Otra vez" vuelve pronto y "Difícil" más tarde, que es la diferencia entre
// no saberla y que te haya costado. "Bien" y "Fácil" no vuelven: ya está.
export const PASOS_REPETICION = { 0: 3, 3: 8 };

export function reinsertarEnSesion(sesion, idx, calidad) {
  const pasos = PASOS_REPETICION[calidad];
  if (!pasos || !sesion || idx < 0 || idx >= sesion.length) return sesion;
  const copia = [...sesion];
  // Si no quedan tantas por delante entra al final, que sigue siendo "antes de
  // acabar". `splice` con un índice mayor que la longitud ya empuja al final.
  copia.splice(Math.min(copia.length, idx + 1 + pasos), 0, sesion[idx]);
  return copia;
}

// Cuántas tarjetas DISTINTAS lleva una sesión. Las repetidas no cuentan dos
// veces: "has repasado 14 tarjetas" tiene que seguir siendo el número de
// tarjetas, no el de veces que has pulsado un botón.
export function tarjetasDistintas(sesion) {
  return new Set((sesion || []).map((c) => (c && (c.grupo_id || c.id)))).size;
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
// Una escritura es una sola ida y vuelta, así que no merece los 12 s de la
// carga entera: pasado este plazo el botón deja de girar y se dice qué pasa.
export const ESPERA_MAX_ESCRITURA_MS = 10000;
// Pero diez segundos mirando un botón gris que dice "Añadiendo..." y nada más
// son diez segundos en los que, por fuera, la app está colgada — y así lo vio
// el usuario ("se ha quedado pillado"). Pasados estos tres se avisa de que
// sigue intentándolo, para que la espera se vea en vez de adivinarse. No se
// acorta el plazo: una conexión mala tarda de verdad varios segundos y
// cortarla antes sería perder la escritura.
export const ESPERA_AVISO_ESCRITURA_MS = 3000;

export function mensajeDeEspera(queIba = "") {
  const frase = "está tardando más de lo normal. Seguimos intentándolo, no cierres la app.";
  return queIba ? `${queIba}: ${frase}` : frase;
}

export function conTiempoLimite(promesa, ms, mensaje) {
  let reloj;
  const limite = new Promise((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(mensaje)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(reloj));
}

// Un botón que se queda en "Guardando..." para siempre. El patrón de toda la
// app era `set(true)` → `await lo que sea` → `set(false)`, y ahí lo de en
// medio tiene DOS formas de no llegar nunca al `set(false)`: que lance (un
// `throw` salta las líneas que quedan, así que la bandera se queda en `true`
// y el botón muerto, sin aviso ninguno) o que no vuelva (una petición a un
// servidor mudo no falla, se queda colgada). Esto cierra la primera por
// construcción —el `finally` se ejecuta pase lo que pase— y de la segunda se
// ocupa `conTiempoLimite` en cada escritura. Entre las dos, un botón ya no
// puede quedarse pillado — y el usuario lo ha visto ("se ha quedado pillado"),
// así que no es una precaución teórica.
//
// Devuelve `false` si la tarea lanza, porque es lo que esperan los que
// llaman (`const ok = await ...; if (!ok) return;`); el motivo ya lo ha
// contado `escribir` con su barra de aviso.
export async function conBandera(poner, tarea) {
  poner(true);
  try {
    return await tarea();
  } catch (err) {
    console.error("Falló mientras guardaba:", err);
    return false;
  } finally {
    poner(false);
  }
}

// Lo mismo pero para una ESCRITURA, que falla por motivos distintos a los de
// la carga inicial y, sobre todo, tiene que decir en voz alta lo que antes se
// tragaba: la estrella de favoritos no se ponía amarilla y nadie contaba por
// qué. Aquí interesa distinguir los tres casos que de verdad pasan, porque
// cada uno lo arregla una persona distinta en un sitio distinto.
export function mensajeDeEscritura(error, queIba = "") {
  const texto = (error && (error.message || error.details || error.hint)) || "";
  const codigo = (error && error.code) || "";
  const di = (frase) => (queIba ? `${queIba}: ${frase}` : frase);

  if (/tardando|timeout|failed to fetch|networkerror|load failed/i.test(texto)) {
    return di("el servidor no contesta. Comprueba tu conexión y vuelve a intentarlo.");
  }
  // 42501 es el rechazo de una política RLS. No es culpa de quien lo pulsa.
  if (codigo === "42501" || /row-level security|permission denied|not authorized/i.test(texto)) {
    return di("el servidor no deja guardarlo (permisos de la base de datos). Esto lo tiene que mirar Pablo.");
  }
  // PGRST204: PostgREST (la capa REST de Supabase) no encuentra esa columna en
  // el esquema que tiene en memoria. Son DOS causas distintas y desde aquí no
  // se pueden distinguir: o la columna no existe, o acaba de crearse y la copia
  // en memoria es de antes. El mensaje decía solo lo segundo ("espera un
  // minuto") y eso era peor que no decir nada cuando la causa era la primera:
  // esperar no arregla una migración que nunca se ejecutó, así que lo nombra.
  if (codigo === "PGRST204" || /schema cache/i.test(texto)) {
    return di("esa columna no está en la base de datos, o acaba de crearse y el servidor aún no se ha enterado. Esto lo tiene que mirar Pablo.");
  }
  // 42P01 tabla que no existe, 42703 columna que no existe: una migración que
  // está en el repositorio pero que nunca llegó a ejecutarse en Supabase.
  if (codigo === "42P01" || codigo === "42703" || /does not exist|no existe/i.test(texto)) {
    return di("falta algo en la base de datos (una tabla o una columna sin crear). Esto lo tiene que mirar Pablo.");
  }
  if (codigo === "23505" || /duplicate key|already exists/i.test(texto)) {
    return di("eso ya estaba guardado.");
  }
  if (/jwt|api key|apikey|unauthorized|401/i.test(texto)) {
    return di("el servidor ha rechazado la sesión. Prueba a salir y volver a entrar.");
  }
  return di(texto || "no se pudo guardar.");
}

// ¿Este error es "la columna `carpeta` de `mazos_estilo` no está"?
//
// Importa porque esa columna la añade `supabase-mazos-carpeta.sql`, y mientras
// esa migración no se haya ejecutado el `upsert` que guarda el estilo de un
// mazo la lleva igualmente en el cuerpo — así que fallaba también al cambiar
// SOLO el color, que no tiene nada que ver con las carpetas. Reconocerlo
// permite reintentar sin ella y que el color se guarde con el esquema viejo.
//
// Se mira el nombre de la columna y el de la tabla, no solo el código: un
// PGRST204 sobre otra columna cualquiera no debe colar por aquí y perder un
// dato sin avisar. PostgREST lo manda como PGRST204 y Postgres como 42703.
export function faltaColumnaCarpeta(err) {
  if (!err) return false;
  const codigo = err.code || "";
  const texto = `${err.message || ""} ${err.details || ""}`;
  if (codigo !== "PGRST204" && codigo !== "42703" && !/schema cache/i.test(texto)) return false;
  return /carpeta/i.test(texto) && /mazos_estilo/i.test(texto);
}

// ---------- Copiar un mazo entero a otro ----------
//
// "Enviar a otro mazo" era un RENOMBRADO: las tarjetas cambiaban de etiqueta y
// desaparecían del mazo de origen. El usuario quería lo contrario ("que no se
// borre del mazo original, simplemente se mande una copia"), así que ahora se
// insertan filas nuevas.
//
// La memoria se comparte por `grupo_id`: el progreso SM-2 va indexado por
// `grupo_id || id`, así que dándole a la copia el grupo del original las dos
// leen y escriben la MISMA fila de `flashcards_progreso` — repasas en un mazo
// y el otro se entera. Es justo para lo que se añadió esa columna.
//
// Y no se duplica lo que ya está: copiar dos veces seguidas no deja la tarjeta
// repetida en el destino, porque se compara por grupo y no por texto.
export function copiasParaMazo(tarjetas, origen, destino) {
  const deMazo = (f) => (f && f.mazo) || "General";
  const grupo = (f) => f.grupo_id || f.id;
  const yaEnDestino = new Set(
    (tarjetas || []).filter((f) => deMazo(f) === destino).map(grupo)
  );
  return (tarjetas || [])
    .filter((f) => deMazo(f) === origen && !yaEnDestino.has(grupo(f)))
    .map((f) => ({
      mazo: destino,
      frontal: f.frontal,
      posterior: f.posterior,
      etiquetas: f.etiquetas || [],
      grupo_id: grupo(f),
    }));
}

// Y lo mismo para UNA tarjeta suelta. Es el mismo criterio que arriba, y
// existe aparte porque el botón de la tarjeta era un "Mover" de verdad —
// cambiaba su `mazo` y desaparecía del de origen—, que es la queja que quedó
// viva después de arreglar el envío del mazo entero: "se sigue eliminando".
export function copiaDeTarjeta(tarjetas, id, destino) {
  const lista = tarjetas || [];
  const original = lista.find((f) => f && f.id === id);
  if (!original) return null;
  const grupo = original.grupo_id || original.id;
  const yaEsta = lista.some(
    (f) => ((f.mazo || "General") === destino) && (f.grupo_id || f.id) === grupo
  );
  if (yaEsta) return null;
  return {
    mazo: destino,
    frontal: original.frontal,
    posterior: original.posterior,
    etiquetas: original.etiquetas || [],
    grupo_id: grupo,
  };
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
    m.set(f.mazo, { icono: f.icono || null, color: f.color || null, carpeta: f.carpeta || null });
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
// ---------------------------------------------------------------------------
// Carpetas de mazos
// ---------------------------------------------------------------------------
// Con trece mazos la lista vertical ya no se lee de un vistazo, así que se
// agrupan. La decisión que mantiene esto simple —y que es lo que lo separa del
// intento de carpetas que hubo que retirar— es que **una carpeta no es una
// entidad**: es el nombre que un mazo lleva escrito al lado, en la misma fila
// de `mazos_estilo` donde ya viven su icono y su color.
//
// De ahí salen tres cosas gratis, sin código que las vigile:
//   · no puede haber carpetas vacías (existen porque algún mazo las nombra),
//   · no hay nada que "mover" ni que borrar en cascada,
//   · quitar la carpeta de un mazo es escribir null, no deshacer una relación.
//
// Y lo que NO se hace, a propósito: ni carpetas dentro de carpetas, ni un mazo
// en dos carpetas. Un solo nivel, como se pidió.
export function carpetaDeMazo(estilos, mazo) {
  const guardado = (estilos && estilos.get && estilos.get(mazo)) || null;
  const nombre = guardado && typeof guardado.carpeta === "string" ? guardado.carpeta.trim() : "";
  return nombre || null;
}

// Las carpetas que de verdad hay ahora mismo, sacadas de los mazos que existen
// y no de una lista aparte: si el último mazo de "Psicoterapias" se borra o
// sale de ella, la carpeta deja de aparecer sin que nadie la limpie.
export function carpetasExistentes(mazos, estilos) {
  const vistas = new Set();
  for (const m of mazos || []) {
    const c = carpetaDeMazo(estilos, m);
    if (c) vistas.add(c);
  }
  return [...vistas].sort((a, b) => a.localeCompare(b, "es"));
}

// Devuelve lo que la pantalla pinta en la raíz: primero las carpetas (en orden
// alfabético, con sus mazos dentro también ordenados) y después los mazos que
// no están en ninguna. Las carpetas van delante a propósito: son los cajones, y
// lo suelto es lo que todavía no has colocado.
export function agruparMazosEnCarpetas(mazos, estilos) {
  // **Respeta el orden que recibe y no vuelve a ordenar.** Antes forzaba el
  // alfabético aquí dentro, lo que dejaba sin efecto cualquier criterio
  // elegido fuera (ver `ordenarMazos`). Las CARPETAS sí siguen yendo por
  // nombre: no tienen color ni fecha propios, y moverlas de sitio según lo que
  // lleven dentro haría que la lista cambiara de forma sin tocar nada.
  const lista = [...(mazos || [])];
  const porCarpeta = new Map();
  const sueltos = [];
  for (const m of lista) {
    const c = carpetaDeMazo(estilos, m);
    if (!c) { sueltos.push(m); continue; }
    if (!porCarpeta.has(c)) porCarpeta.set(c, []);
    porCarpeta.get(c).push(m);
  }
  const carpetas = [...porCarpeta.entries()]
    .map(([nombre, suyos]) => ({ nombre, mazos: suyos }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return { carpetas, sueltos };
}

// ---------- Ordenar la lista de mazos ----------
//
// Con veintitantos mazos el alfabético deja de responder a lo único que uno se
// pregunta al abrir la pantalla: por dónde empiezo. La clave de cada criterio
// viaja a `localStorage`, así que renombrarla deja la preferencia guardada sin
// sentido y se cae al alfabético (que es lo correcto, pero conviene saberlo).
export const CRITERIOS_ORDEN_MAZO = [
  { clave: "alfabetico", etiqueta: "A - Z" },
  { clave: "alfabetico-inv", etiqueta: "Z - A" },
  { clave: "mas-pendientes", etiqueta: "Pendientes hoy" },
  { clave: "mas-falladas", etiqueta: "Más falladas" },
  { clave: "menos-falladas", etiqueta: "Menos falladas" },
  { clave: "mas-tarjetas", etiqueta: "Más tarjetas" },
  { clave: "menos-tarjetas", etiqueta: "Menos tarjetas" },
  { clave: "color", etiqueta: "Por color" },
];

// El % de repasos fallados de cada mazo, con lo que haya en
// `flashcards_repasos` (los últimos 90 días, que es lo que se descarga).
//
// **Se usa la TASA y no el número de fallos, y esto no es un detalle**: un mazo
// de 96 tarjetas acumula más fallos que uno de 5 por el mero hecho de ser más
// grande, así que ordenar por el recuento daría la lista de los mazos grandes
// y no la de los que peor llevas, que es lo que se ha pedido.
//
// Un mazo sin repasos vale `null`, NO 0: no haber fallado nada por no haberlo
// abierto nunca no es ir bien. `ordenarMazos` los manda al final en los dos
// sentidos del criterio.
//
// Se cruza por `grupo_id || id`, que es lo que guarda
// `flashcards_repasos.flashcard_id`. Una tarjeta copiada a dos mazos comparte
// progreso, así que sus repasos cuentan en los dos: es lo coherente con que el
// repaso sea común, no un efecto secundario.
export function tasaDeFalloPorMazo(flashcards, repasos) {
  const mazosDeClave = new Map();
  for (const f of flashcards || []) {
    if (!f) continue;
    const clave = f.grupo_id || f.id;
    if (clave == null) continue;
    if (!mazosDeClave.has(clave)) mazosDeClave.set(clave, new Set());
    mazosDeClave.get(clave).add(f.mazo || "General");
  }
  const cuenta = new Map();
  for (const r of repasos || []) {
    const suyos = r && mazosDeClave.get(r.flashcard_id);
    if (!suyos) continue;
    for (const m of suyos) {
      if (!cuenta.has(m)) cuenta.set(m, { total: 0, fallos: 0 });
      const c = cuenta.get(m);
      c.total += 1;
      if (r.acierto === false) c.fallos += 1;
    }
  }
  const salida = new Map();
  for (const [m, c] of cuenta) salida.set(m, c.total ? c.fallos / c.total : null);
  return salida;
}

// Ordena los NOMBRES de los mazos. No toca nada más: la agrupación en carpetas
// se hace después y respeta el orden que reciba.
//
// Dos reglas que valen para todos los criterios:
//  - **Lo que no tiene dato va al final**, suba o baje el criterio. Un mazo sin
//    estrenar no es ni el que mejor llevas ni el que peor: es que no consta.
//    Colarlo arriba en "menos falladas" sería premiar no haberlo abierto.
//  - **Los empates se deshacen por orden alfabético**, nunca dejándolos como
//    vengan: la lista se dibuja muchas veces y un orden que baila es peor que
//    uno discutible.
export function ordenarMazos(mazos, criterio, datos = {}) {
  const lista = [...(mazos || [])];
  const { stats, estilos, fallos, colores } = datos;
  const alfa = (a, b) => a.localeCompare(b, "es");
  const campo = (m, cual) => {
    const s = stats && stats.get ? stats.get(m) : null;
    return s ? s[cual] || 0 : 0;
  };
  const porNumero = (valor, descendente) => (a, b) => {
    const va = valor(a);
    const vb = valor(b);
    const faltaA = va == null || Number.isNaN(va);
    const faltaB = vb == null || Number.isNaN(vb);
    if (faltaA && faltaB) return alfa(a, b);
    if (faltaA) return 1;
    if (faltaB) return -1;
    if (va !== vb) return descendente ? vb - va : va - vb;
    return alfa(a, b);
  };
  const tasa = (m) => (fallos && fallos.get ? fallos.get(m) : null);
  // "Por color" agrupa los del mismo color siguiendo el orden de la paleta, y
  // deja los que no tienen color al final — que son los que están sin decidir.
  const indiceColor = (m) => {
    const guardado = estilos && estilos.get ? estilos.get(m) : null;
    const color = guardado && guardado.color;
    if (!color || !colores) return null;
    const i = colores.indexOf(color);
    return i < 0 ? null : i;
  };
  switch (criterio) {
    case "alfabetico-inv": return lista.sort((a, b) => alfa(b, a));
    case "mas-pendientes": return lista.sort(porNumero((m) => campo(m, "pendientes"), true));
    case "mas-tarjetas": return lista.sort(porNumero((m) => campo(m, "total"), true));
    case "menos-tarjetas": return lista.sort(porNumero((m) => campo(m, "total"), false));
    case "mas-falladas": return lista.sort(porNumero(tasa, true));
    case "menos-falladas": return lista.sort(porNumero(tasa, false));
    case "color": return lista.sort(porNumero(indiceColor, false));
    default: return lista.sort(alfa);
  }
}

// Arrastrar un mazo y soltarlo: qué significa cada sitio donde se puede
// soltar. Es lo único del arrastre que se puede probar sin navegador, y
// conviene tenerlo aparte porque las dos reglas que evitan escrituras inútiles
// son fáciles de olvidar: soltar un mazo en la carpeta donde YA está, y
// soltar fuera uno que ya estaba fuera, no cambian nada y no deben mandar
// nada al servidor.
export const FUERA_DE_CARPETAS = "__fuera__";

export function interpretarSoltar(destino, carpetaActual) {
  const actual = carpetaActual || null;
  if (!destino) return { cambia: false, carpeta: actual };
  if (destino === FUERA_DE_CARPETAS) return { cambia: actual !== null, carpeta: null };
  const limpio = destino.trim();
  if (!limpio) return { cambia: false, carpeta: actual };
  return { cambia: limpio !== actual, carpeta: limpio };
}

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
//   0 | 3 | 4 | 5  — el resumen de TODAS sus respuestas, no la última.
//
// **Por qué una media y no el último botón.** Era el último, y eso mentía: lo
// que fallas vuelve a salir dentro de la misma sesión (ver `reinsertarEnSesion`),
// así que contestabas "Otra vez" y tres tarjetas después, con la respuesta
// todavía en la cabeza, "Bien" — y la tarjeta quedaba verde, idéntica a otra
// que te supiste a la primera. Lo dijo el usuario tal cual: "es normal que
// ponga bien por la repetición a corto plazo, pero no es real que esté
// clasificado como verde igual que una que he acertado a la primera".
//
// La media es exponencial: cada respuesta pesa `PESO_ULTIMO` y el resto queda
// para lo que ya había. Esa forma es la que hace lo que se pedía, y conviene
// ver los números antes de tocar el peso:
//
//   sesión 1: "Otra vez" (0) y luego "Bien" (4)  -> 0, luego 2,0  -> ROJO
//   sesión 2: "Bien" (4)                         -> 3,0           -> Difícil
//   sesión 3: "Bien" (4)                         -> 3,5           -> Bien
//   y de ahí va acercándose a 4; para llegar a verde hay que pulsar "Fácil".
//
// O sea: recuperarla en la misma sesión NO la limpia, y recuperarla en sesiones
// distintas sí, subiendo un escalón cada vez. Que es exactamente lo que se
// pidió ("ir haciendo la media y poner un color menos del difícil, y así").
export const PESO_ULTIMO = 0.5;

export function mediaCalificacionPorTarjeta(repasos, peso = PESO_ULTIMO) {
  // El orden importa: una media exponencial depende de en qué orden llegaron,
  // y las filas no vienen ordenadas por fuerza.
  const validos = (repasos || [])
    .filter((r) => r && r.flashcard_id && typeof r.calidad === "number")
    .slice()
    .sort((a, b) => String(a.creado_en || "").localeCompare(String(b.creado_en || "")));
  const medias = new Map();
  for (const r of validos) {
    const previo = medias.get(r.flashcard_id);
    // La primera respuesta no se promedia con nada: una tarjeta acertada a la
    // primera con "Fácil" vale 5 y sale verde, como debe ser.
    medias.set(r.flashcard_id, previo === undefined ? r.calidad : peso * r.calidad + (1 - peso) * previo);
  }
  return medias;
}

// De la media continua al color. Los cortes NO son el redondeo al valor más
// cercano: con eso, el 2,0 del ejemplo de arriba caería en "Difícil" y el caso
// que motivó todo esto seguiría sin salir rojo. El color **se gana**, así que
// cada escalón pide llegar hasta él.
export function bucketDeMedia(media) {
  if (typeof media !== "number" || Number.isNaN(media)) return null;
  if (media >= 4.5) return 5;
  if (media >= 3.5) return 4;
  if (media >= 3) return 3;
  return 0;
}

export function estadoCuadricula(tarjeta, progresoPorId, medias) {
  const clave = tarjeta && (tarjeta.grupo_id || tarjeta.id);
  const progreso = progresoPorId && progresoPorId[clave];
  // Una fila de progreso sin repeticiones es una tarjeta que aún no ha salido.
  if (!progreso || !progreso.ultima_revision) return "nueva";
  const bucket = bucketDeMedia(medias && medias.get ? medias.get(clave) : undefined);
  return bucket === null ? "sin-registro" : bucket;
}

