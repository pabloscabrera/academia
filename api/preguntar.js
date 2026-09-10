import { TEMARIO } from "../src/temario.js";

function construirContexto() {
  return TEMARIO.map((curso) => {
    const temas = curso.temas.map((t) => `- ${t.nombre}: ${t.contenido}`).join("\n");
    return `## ${curso.curso}\n${temas}`;
  }).join("\n\n");
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

  const pregunta = req.body && typeof req.body.pregunta === "string" ? req.body.pregunta.trim() : "";
  if (!pregunta) {
    res.status(400).json({ error: "Falta la pregunta." });
    return;
  }
  if (pregunta.length > 1000) {
    res.status(400).json({ error: "La pregunta es demasiado larga (máximo 1000 caracteres)." });
    return;
  }

  const modelo = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const prompt = `Eres un tutor que ayuda a preparar un examen de psicología (PIR) usando exclusivamente el temario de esta app. Responde solo con información del siguiente temario. Si la pregunta no se puede responder con este temario, dilo claramente en vez de inventar información. Responde en español, de forma clara y breve.

TEMARIO:
${construirContexto()}

PREGUNTA DEL ESTUDIANTE:
${pregunta}`;

  try {
    const respuesta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
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

    res.status(200).json({ respuesta: texto });
  } catch (err) {
    res.status(500).json({ error: "No se pudo contactar con la IA." });
  }
}
