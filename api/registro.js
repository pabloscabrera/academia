import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";

// Alta de cuentas con código de invitación, hecha en el servidor.
//
// Por qué aquí y no en el cliente: la anon key viaja en el bundle, así que
// cualquier comprobación de código escrita en App.jsx se salta abriendo las
// herramientas del navegador. Este endpoint es el único sitio donde el código
// y la service_role key existen, y ninguno de los dos llega nunca al navegador.
//
// Variables de entorno necesarias (Vercel → Settings → Environment Variables):
//   CODIGO_INVITACION          uno o varios códigos separados por comas
//   SUPABASE_SERVICE_ROLE_KEY  Supabase → Settings → API → service_role
//
// Con esto puesto hay que desactivar el alta pública en Supabase
// (Authentication → Sign In / Providers → Email → "Allow new users to sign
// up"): la API de admin que usamos abajo sigue funcionando igual, pero el
// signUp directo contra la anon key deja de funcionar, que es justo lo que
// queremos cerrar.

const supabaseUrl = "https://slwifwjwtipoqtkhbhbr.supabase.co";
const DOMINIO_CUENTAS = "ruta-pir.local";
const ADMIN_USERNAME = "pabloadmin";

// Ventana y tope de intentos por IP. Nadie crea 8 cuentas en una hora de
// forma legítima, así que esto no molesta a nadie y corta el ir probando
// códigos a mano.
const LIMITE_INTENTOS = 8;
const VENTANA_MINUTOS = 60;

function mismoCodigo(a, b) {
  // Comparación en tiempo constante sobre el hash: así no se filtra la
  // longitud del código ni cuántos caracteres iniciales ha acertado.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function ipDePeticion(req) {
  const cabecera = req.headers["x-forwarded-for"];
  if (typeof cabecera === "string" && cabecera.trim()) return cabecera.split(",")[0].trim();
  if (Array.isArray(cabecera) && cabecera.length) return String(cabecera[0]).trim();
  return (req.socket && req.socket.remoteAddress) || "desconocida";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const codigosValidos = (process.env.CODIGO_INVITACION || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!serviceKey || codigosValidos.length === 0) {
    res.status(500).json({ error: "El registro no está configurado en el servidor. Avisa a Pablo." });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ip = ipDePeticion(req);
  const desde = new Date(Date.now() - VENTANA_MINUTOS * 60 * 1000).toISOString();
  const { count: intentosRecientes } = await supabase
    .from("registro_intentos")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("creado_en", desde);
  if ((intentosRecientes || 0) >= LIMITE_INTENTOS) {
    res.status(429).json({ error: "Demasiados intentos. Prueba otra vez en un rato." });
    return;
  }

  const cuerpo = req.body || {};
  const usuario = typeof cuerpo.usuario === "string" ? cuerpo.usuario.trim() : "";
  const password = typeof cuerpo.password === "string" ? cuerpo.password : "";
  const codigo = typeof cuerpo.codigo === "string" ? cuerpo.codigo.trim() : "";

  // El intento queda registrado pase lo que pase, para que el tope de arriba
  // cuente también los fallidos.
  const anotar = async (exito) => {
    await supabase.from("registro_intentos").insert([{ ip, usuario: usuario || null, exito }]);
    // Limpieza oportunista: no hace falta guardar historial de esto.
    const caducados = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("registro_intentos").delete().lt("creado_en", caducados);
  };

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(usuario)) {
    res.status(400).json({ error: "El usuario debe tener entre 3 y 20 letras, números o _ (sin espacios ni acentos)." });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    return;
  }
  if (!codigo) {
    res.status(400).json({ error: "Escribe el código de invitación." });
    return;
  }

  if (!codigosValidos.some((valido) => mismoCodigo(codigo.toLowerCase(), valido.toLowerCase()))) {
    await anotar(false);
    res.status(403).json({ error: "El código de invitación no es válido. Pídeselo a Pablo." });
    return;
  }

  // El admin se decide por nombre de usuario (ADMIN_NAME en App.jsx), así que
  // dejar que alguien lo registre sería regalarle los permisos de admin.
  if (usuario.toLowerCase() === ADMIN_USERNAME) {
    await anotar(false);
    res.status(409).json({ error: "Ese nombre de usuario no está disponible. Elige otro." });
    return;
  }

  const { error } = await supabase.auth.admin.createUser({
    email: `${usuario.toLowerCase()}@${DOMINIO_CUENTAS}`,
    password,
    // No hay buzón real en este dominio inventado: la cuenta nace confirmada.
    email_confirm: true,
    user_metadata: { username: usuario },
  });

  if (error) {
    await anotar(false);
    const mensaje = error.message || "";
    if (/already|registered|exists|duplicate/i.test(mensaje)) {
      res.status(409).json({ error: "Ese nombre de usuario ya está en uso. Elige otro." });
      return;
    }
    res.status(500).json({ error: "No se pudo crear la cuenta. Inténtalo de nuevo." });
    return;
  }

  await anotar(true);
  res.status(200).json({ ok: true });
}
