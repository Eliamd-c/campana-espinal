import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/ratelimit";
import crypto from "crypto";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export const PROMPTS = {
  clasificar_mensaje: {
    version: "1.1",
    template: `
Analiza el siguiente mensaje de una persona dirigido a una campaña política:
"{texto}"

Responde ESTRICTAMENTE en formato JSON con la siguiente estructura:
{
  "categoria": "salud" | "seguridad" | "educacion" | "infraestructura" | "otro",
  "sentimiento": "positivo" | "negativo" | "neutral",
  "requiere_respuesta": boolean,
  "resumen": "string corto"
}

JSON:
`,
  },
  perfilar_voto: {
    version: "1.0",
    template: `
Analiza el mensaje para determinar la intención de voto hacia el candidato de la campaña:
Mensaje: "{texto}"

Categorías posibles:
- "positivo": Apoya claramente al candidato.
- "negativo": Se opone al candidato o apoya a otro.
- "indeciso": No tiene una posición clara o tiene dudas.
- "desconocido": El mensaje no revela intención de voto.

Responde solo con una palabra (la categoría).
`,
  },
};

export async function ejecutarPrompt(
  tipo: keyof typeof PROMPTS,
  variables: Record<string, string>
) {
  try {
    const promptDef = PROMPTS[tipo];
    let promptText = promptDef.template;

    for (const [key, value] of Object.entries(variables)) {
      promptText = promptText.replace(`{${key}}`, value);
    }

    // 1. Intentar obtener de Cache
    const cacheKey = `ia:prompt:${crypto.createHash("md5").update(promptText).digest("hex")}`;
    const cached = (await redis.get(cacheKey)) as string | null;
    
    if (cached) {
      logger.info("IA Cache hit", { tipo, cacheKey });
      return cached;
    }

    // 2. Ejecutar si no hay cache
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(promptText);
    const response = await result.response;
    const text = response.text();

    // 3. Guardar en Cache (24 horas)
    await redis.set(cacheKey, text, { ex: 24 * 60 * 60 });

    logger.info("IA Prompt ejecutado", { tipo, version: promptDef.version });
    return text;
  } catch (error) {
    logger.error("Error al ejecutar prompt de IA", { tipo, error });
    throw error;
  }
}
