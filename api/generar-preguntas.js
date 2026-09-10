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

  const instruccion = req.body && typeof req.body.instruccion === "string" ? req.body.instruccion.trim() : "";
  if (!instruccion) {
    res.status(400).json({ error: "Falta describir qué preguntas quieres." });
    return;
  }
  if (instruccion.length > 500) {
    res.status(400).json({ error: "La instrucción es demasiado larga (máximo 500 caracteres)." });
    return;
  }

  let cantidad = parseInt(req.body && req.body.cantidad, 10);
  if (!Number.isFinite(cantidad)) cantidad = 3;
  cantidad = Math.max(1, Math.min(10, cantidad));

  const modelo = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const prompt = `Eres un generador de preguntas tipo test para preparar un examen de psicología (PIR), estilo manual APIR. Genera exactamente ${cantidad} preguntas nuevas siguiendo esta instrucción del usuario: "${instruccion}"

Cada pregunta debe tener 4 opciones de respuesta, con solo una correcta, y una breve explicación de por qué es correcta. Sé preciso y riguroso con el contenido de psicología clínica. No repitas la misma pregunta dos veces.

Devuelve ÚNICAMENTE un JSON con este formato exacto, sin texto adicional:
{
  "preguntas": [
    {
      "curso": "nombre del curso o área (ej. Psicopatología)",
      "tema": "nombre del tema concreto",
      "pregunta": "texto de la pregunta",
      "opciones": ["opción A", "opción B", "opción C", "opción D"],
      "correcta": 0,
      "explicacion": "por qué es correcta la respuesta"
    }
  ]
}
"correcta" es el índice (0 a 3) de la opción correcta dentro de "opciones".`;

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
      res.status(502).json({ error: "La IA devolvió una respuesta que no se pudo interpretar. Inténtalo de nuevo." });
      return;
    }

    const preguntas = Array.isArray(json.preguntas) ? json.preguntas : null;
    if (!preguntas || preguntas.length === 0) {
      res.status(502).json({ error: "La IA no generó ninguna pregunta." });
      return;
    }

    const validas = preguntas.filter((p) =>
      p && typeof p.pregunta === "string" && p.pregunta.trim() &&
      Array.isArray(p.opciones) && p.opciones.length === 4 && p.opciones.every((o) => typeof o === "string" && o.trim()) &&
      Number.isInteger(p.correcta) && p.correcta >= 0 && p.correcta <= 3
    );

    if (validas.length === 0) {
      res.status(502).json({ error: "La IA devolvió preguntas con un formato inválido." });
      return;
    }

    res.status(200).json({
      preguntas: validas.map((p) => ({
        curso: (typeof p.curso === "string" && p.curso.trim()) || "General",
        tema: (typeof p.tema === "string" && p.tema.trim()) || "General",
        pregunta: p.pregunta.trim(),
        opciones: p.opciones.map((o) => o.trim()),
        correcta: p.correcta,
        explicacion: typeof p.explicacion === "string" ? p.explicacion.trim() : "",
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "No se pudo contactar con la IA." });
  }
}
