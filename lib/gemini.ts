import { GoogleGenerativeAI } from "@google/generative-ai";

export async function generarAnalisis(prompt: string): Promise<string> {
  const openAiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (openAiKey && openAiKey.trim() !== "" && openAiKey !== "dummy_key") {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openAiKey}` },
        body: JSON.stringify({ model: "gpt-3.5-turbo", messages: [{ role: "user", content: prompt }] })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || "Error OpenAI"); }
      const data = await res.json();
      return data.choices[0].message.content;
    } catch (error: any) {
      return `Error de IA (ChatGPT): ${error.message}`;
    }
  }

  if (!geminiKey || geminiKey === "dummy_key") {
    return "Error: No se ha configurado la API Key de IA en el archivo .env.";
  }

  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error: any) {
    return `Error de IA (Gemini): ${error.message}`;
  }
}

/**
 * Agente de Herramientas — Tool Routing Manual
 * Usa generarAnalisis internamente → compatible con OpenAI y Gemini.
 */
export async function generarConHerramientas(
  pregunta: string,
  historial: { rol: string; contenido: string }[],
  toolDefs: any[],
  ejecutarTool: (nombre: string, args: any) => Promise<string>
): Promise<string> {

  const toolsDesc = toolDefs.map(t =>
    `- ${t.name}: ${t.description}\n  Parámetros disponibles: ${Object.keys(t.parameters.properties || {}).join(", ")}`
  ).join("\n");

  const historialStr = historial.length > 0
    ? `\nCONVERSACIÓN PREVIA (usa este contexto para entender referencias como "esos", "ellos", etc.):\n${historial.slice(-6).map(h => `${h.rol === "user" ? "Coordinador" : "IA"}: ${h.contenido}`).join("\n")}\n`
    : "";

  // ── PASO 1: La IA decide qué herramientas invocar ─────────────────────
  const promptPaso1 = `Eres el Analista Electoral de la Campaña El Espinal.
Tienes estas herramientas disponibles para consultar la base de datos:
${toolsDesc}
${historialStr}
PREGUNTA ACTUAL: "${pregunta}"

Responde ÚNICAMENTE con un bloque JSON sin texto adicional, indicando qué herramientas invocar:
{
  "herramientas": [
    { "nombre": "nombre_de_la_herramienta", "argumentos": { } }
  ]
}
Si puedes responder sin datos adicionales (ej: saludos), usa: { "herramientas": [] }`;

  const respPaso1 = await generarAnalisis(promptPaso1);
  let texto1 = respPaso1.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let herramientasSolicitadas: { nombre: string; argumentos: any }[] = [];
  try {
    const parsed = JSON.parse(texto1);
    herramientasSolicitadas = Array.isArray(parsed.herramientas) ? parsed.herramientas : [];
  } catch {
    herramientasSolicitadas = [];
  }

  // ── PASO 2: Ejecutar las herramientas ─────────────────────────────────
  let resultadosStr = "";
  if (herramientasSolicitadas.length > 0) {
    const resultados: string[] = [];
    for (const tool of herramientasSolicitadas) {
      console.log(`[Agente] Ejecutando: ${tool.nombre}`, tool.argumentos);
      const resultado = await ejecutarTool(tool.nombre, tool.argumentos || {});
      resultados.push(`[${tool.nombre}]:\n${resultado}`);
    }
    resultadosStr = resultados.join("\n\n");
  }

  // ── PASO 3: Respuesta final con los datos reales ──────────────────────
  const promptPaso2 = `Eres el Analista Electoral de la Campaña El Espinal, Colombia.
${historialStr}
PREGUNTA: "${pregunta}"
${resultadosStr ? `\nDATOS REALES DE LA BASE DE DATOS:\n${resultadosStr}\n` : ""}
Instrucciones:
- Responde directamente usando los números exactos obtenidos. No inventes datos.
- Si los datos están vacíos o son 0, dilo claramente.
- Sé conciso y profesional. Sin emojis excesivos.
- Usa markdown si la respuesta tiene múltiples datos.`;

  return await generarAnalisis(promptPaso2);
}



// Funciones prefabricadas para prompts comunes de la campaña

export function promptAnalisisLider(nombre: string, score: number, numContactos: number): string {
  return `Actúa como un estratega político experto.
Analiza brevemente el desempeño del líder "${nombre}". 
Su puntuación actual de desempeño es de ${score} puntos y ha traído ${numContactos} contactos a la campaña.
Dime:
1. Una evaluación rápida de su rendimiento.
2. Dos recomendaciones estratégicas de motivación o trabajo de campo para este líder.
Mantén la respuesta concisa y en formato markdown.`;
}

export function promptMensajeMasivo(contexto: string): string {
  return `Actúa como el jefe de comunicaciones de una campaña política moderna y empática en El Espinal, Colombia.
Necesito que redactes un mensaje corto para enviar por WhatsApp masivo a los simpatizantes.
Contexto o motivo del mensaje: "${contexto}"
Reglas:
- El mensaje debe ser cálido, respetuoso y persuasivo.
- Incluye la variable {{nombre}} donde corresponda saludar a la persona por su nombre de pila.
- Usa emojis de forma moderada.
- No superes los 3 párrafos cortos.
- Ve directo al punto.`;
}

export function promptAnalistaContexto(pregunta: string, stats: string): string {
  return `Eres el Analista de Inteligencia Electoral de la campaña en El Espinal.
Tu fuente de datos es la siguiente (PRIORIZA los números exactos sobre cualquier ejemplo):
${stats}

Pregunta del coordinador: "${pregunta}"

Reglas estrictas:
- USA SIEMPRE los números del bloque "ESTADÍSTICAS EN TIEMPO REAL" como fuente principal. NO uses el ejemplo de registro para hacer conteos.
- Si tienes el número exacto, dilo sin rodeos. Ejemplo: "Tenemos 34 personas habilitadas."
- Sé directo, profesional y sin emojis excesivos.
- Si el dato no está disponible, dilo claramente en lugar de inventar.
- Usa markdown para estructurar respuestas largas.`;
}

export function promptClasificarIntencionVoto(mensajeUsuario: string): string {
  return `Actúa como un analizador de sentimiento político.
Un ciudadano de El Espinal respondió a nuestro mensaje de WhatsApp con el siguiente texto:
"${mensajeUsuario}"

Clasifica su intención de voto basándote en este mensaje. Las opciones SON ESTRICTAMENTE UNA DE LAS SIGUIENTES:
positivo
negativo
indeciso

Reglas:
- Si el mensaje muestra apoyo, amabilidad hacia la campaña, o disposición a votar, responde "positivo".
- Si el mensaje muestra rechazo, insultos, apoyo a otro candidato, o dice que no lo contacten, responde "negativo".
- Si el mensaje es una pregunta neutra, duda, o no es claro, responde "indeciso".

IMPORTANTE: TU RESPUESTA DEBE SER ÚNICAMENTE LA PALABRA CLASIFICADA (positivo, negativo, o indeciso) en minúsculas y sin ningún texto adicional, ni puntuación.`;
}
