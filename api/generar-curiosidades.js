import { createClient } from "@supabase/supabase-js";
import { TEMARIO } from "../src/temario.js";

const supabaseUrl = "https://slwifwjwtipoqtkhbhbr.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2lmd2p3dGlwb3F0a2hiaGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NjA0OTcsImV4cCI6MjEwNDUzNjQ5N30.1doJMfmoNSSl5L6bPWrjVSfwWATewbpKlZIBl3u33EM";
const supabase = createClient(supabaseUrl, supabaseKey);

const MAX_CURIOSIDADES = 400;
const CANTIDAD_POR_LOTE = 4;

function temaAlAzar() {
  const cursos = TEMARIO.filter((c) => c.temas && c.temas.length > 0);
  if (cursos.length === 0) return null;
  const curso = cursos[Math.floor(Math.random() * cursos.length)];
  const tema = curso.temas[Math.floor(Math.random() * curso.temas.length)];
  return { curso: curso.curso, tema };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en el servidor." });
    return;
  }

  const { count, error: countError } = await supabase
    .from("curiosidades")
    .select("id", { count: "exact", head: true });
  if (countError) {
    res.status(500).json({ error: "No se pudo comprobar el banco de curiosidades." });
    return;
  }
  if ((count || 0) >= MAX_CURIOSIDADES) {
    res.status(200).json({ curiosidades: [] });
    return;
  }

  const elegido = temaAlAzar();
  if (!elegido) {
    res.status(500).json({ error: "No hay temario disponible para generar curiosidades." });
    return;
  }

  const modelo = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const prompt = `Eres un divulgador de psicología que prepara datos curiosos para gente que estudia para el examen PIR. Genera exactamente ${CANTIDAD_POR_LOTE} curiosidades distintas, breves y sorprendentes, basadas ÚNICAMENTE en el siguiente contenido del tema "${elegido.tema.nombre}" (curso "${elegido.curso}"). No inventes datos que no estén aquí.

CONTENIDO DEL TEMA:
${elegido.tema.contenido}

Cada curiosidad debe tener:
- "texto": el dato curioso en sí, de 1 a 3 frases, en tono ameno y cercano (nada acartonado), que enganche a quien lo lea.
- "pregunta_mini": una pregunta corta relacionada con ese dato, para que el lector se la plantee a sí mismo.
- "respuesta_mini": la respuesta breve a esa pregunta.

Devuelve ÚNICAMENTE un JSON con este formato exacto, sin texto adicional:
{
  "curiosidades": [
    { "texto": "...", "pregunta_mini": "...", "respuesta_mini": "..." }
  ]
}`;

  try {
    const respuesta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      const mensaje = (datos && datos.error && datos.error.message) || "Error al contactar con la IA.";
      res.status(502).json({ error: mensaje });
      return;
    }

    const partes = datos && datos.candidates && datos.candidates[0] && datos.candidates[0].content && datos.candidates[0].content.parts;
    const texto = Array.isArray(partes) ? partes.map((p) => p.text || "").join("") : "";
    if (!texto) {
      res.status(502).json({ error: "La IA no devolvió respuesta." });
      return;
    }

    let json;
    try {
      json = JSON.parse(texto);
    } catch {
      res.status(502).json({ error: "La IA devolvió una respuesta que no se pudo interpretar." });
      return;
    }

    const lista = Array.isArray(json.curiosidades) ? json.curiosidades : null;
    if (!lista || lista.length === 0) {
      res.status(502).json({ error: "La IA no generó ninguna curiosidad." });
      return;
    }

    const validas = lista.filter((c) => c && typeof c.texto === "string" && c.texto.trim());
    if (validas.length === 0) {
      res.status(502).json({ error: "La IA devolvió curiosidades con un formato inválido." });
      return;
    }

    const filas = validas.map((c) => ({
      curso: elegido.curso,
      tema: elegido.tema.nombre,
      texto: c.texto.trim(),
      pregunta_mini: typeof c.pregunta_mini === "string" && c.pregunta_mini.trim() ? c.pregunta_mini.trim() : null,
      respuesta_mini: typeof c.respuesta_mini === "string" && c.respuesta_mini.trim() ? c.respuesta_mini.trim() : null,
    }));

    const { data: insertadas, error: insertError } = await supabase
      .from("curiosidades")
      .insert(filas)
      .select();
    if (insertError) {
      res.status(500).json({ error: "No se pudieron guardar las curiosidades." });
      return;
    }

    res.status(200).json({ curiosidades: insertadas || [] });
  } catch (err) {
    res.status(500).json({ error: "No se pudo contactar con la IA." });
  }
}
