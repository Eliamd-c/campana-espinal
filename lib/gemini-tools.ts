import { GoogleGenerativeAI } from "@google/generative-ai";
import { ejecutarHerramienta } from "./ia-tools";
import { logger } from "./logger";

// Patrón oficial de inicialización
const geminiKey = process.env.GEMINI_API_KEY;
const genAI = geminiKey && geminiKey !== "dummy_key" ? new GoogleGenerativeAI(geminiKey) : null;

/**
 * Agente de Inteligencia Electoral con Function Calling Nativo.
 * Ejecuta un loop agentico llamando a Gemini 2.5 Flash y ejecutando las herramientas
 * solicitadas hasta que el modelo decida responder de forma final.
 * 
 * @param pregunta Pregunta actual del coordinador electoral
 * @param historial Historial de conversación en formato compatible con Gemini
 * @param toolDefinitions Definiciones de herramientas registradas
 */
export async function generarConHerramientasV2(
  pregunta: string,
  historial: { role: "user" | "model"; parts: Array<{ text?: string; functionCall?: any; functionResponse?: any }> }[],
  toolDefinitions: any[]
): Promise<string> {
  if (!genAI) {
    throw new Error("GEMINI_API_KEY no está configurada o es inválida en el entorno.");
  }

  // Filtrar tool definitions para que coincidan con la firma esperada por Gemini SDK
  const formattedTools = toolDefinitions.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: tool.parameters.type,
      properties: tool.parameters.properties || {},
      required: tool.parameters.required || []
    }
  }));

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [
      {
        functionDeclarations: formattedTools
      }
    ]
  });

  // Convertir el historial al formato compatible de Gemini
  // Gemini requiere que los roles sean estrictamente "user" o "model"
  const messages: any[] = historial.map(h => ({
    role: h.role,
    parts: h.parts.map(p => {
      if (p.text !== undefined) return { text: p.text };
      if (p.functionCall !== undefined) return { functionCall: p.functionCall };
      if (p.functionResponse !== undefined) return { functionResponse: p.functionResponse };
      return { text: "" };
    })
  }));

  // Añadir la pregunta actual del coordinador al final del historial
  messages.push({
    role: "user",
    parts: [
      {
        text: `Eres el Analista Electoral de la Campaña El Espinal.
        
Pregunta actual: "${pregunta}"

Usa las herramientas disponibles para consultar la base de datos y obtener respuestas exactas.
Si necesitas datos para responder, usa las herramientas. Si ya tienes la respuesta o la pregunta es un saludo/agradecimiento, responde directamente.
IMPORTANTE SOBRE CLAVES: Para ejecutar_consulta_sql en modo de solo lectura (SELECT), NUNCA pidas una clave de administrador, haz la consulta directamente. SOLO debes pedir la clave de administrador al usuario si la solicitud implica modificar, actualizar, borrar o insertar datos (UPDATE, DELETE, INSERT).`
      }
    ]
  });

  let respuestaFinal = "No se pudo generar una respuesta.";
  let totalToolCalls = 0;
  const maxIterations = 5;
  const inicioTime = Date.now();

  for (let i = 0; i < maxIterations; i++) {
    logger.info(`[Agente IA] Iteración ${i + 1}/${maxIterations} en curso...`, { sesion: messages.length });
    
    const response = await model.generateContent({
      contents: messages
    });

    const candidate = response.response;
    const text = candidate.text();
    if (text) {
      respuestaFinal = text;
    }

    // Obtener todas las functionCalls solicitadas en este turno
    const functionCalls = candidate.functionCalls();
    
    // Si no hay llamadas a herramientas, significa que el modelo terminó y dio su respuesta final
    if (!functionCalls || functionCalls.length === 0) {
      logger.info(`[Agente IA] Bucle terminado por el modelo. Respuesta final obtenida.`, {
        iteraciones: i + 1,
        tiempoMs: Date.now() - inicioTime,
        herramientasEjecutadas: totalToolCalls
      });
      break;
    }

    totalToolCalls += functionCalls.length;
    logger.info(`[Agente IA] Gemini solicitó ejecutar ${functionCalls.length} herramientas`, {
      llamadas: functionCalls.map(c => c.name)
    });

    // Ejecutar las herramientas solicitadas en paralelo
    const toolResponses = await Promise.all(
      functionCalls.map(async (call) => {
        try {
          logger.info(`[Agente IA] Ejecutando tool: ${call.name}`, { args: call.args });
          const resultado = await ejecutarHerramienta(call.name, call.args);
          
          let parsedResult;
          try {
            parsedResult = JSON.parse(resultado);
          } catch {
            parsedResult = { rawResponse: resultado };
          }

          return {
            name: call.name,
            response: parsedResult
          };
        } catch (error: any) {
          logger.error(`[Agente IA] Error ejecutando tool ${call.name}`, error);
          return {
            name: call.name,
            response: { error: error.message || "Error desconocido ejecutando la herramienta." }
          };
        }
      })
    );

    // Añadir la solicitud del modelo y las respuestas al historial de mensajes
    messages.push({
      role: "user",
      parts: toolResponses.map(res => ({
        functionResponse: {
          name: res.name,
          response: res.response
        }
      }))
    });
  }

  return respuestaFinal;
}

/**
 * Agente de Inteligencia Electoral con Function Calling Nativo y Soporte de Streaming.
 * Ejecuta un loop agentico llamando a Gemini 2.5 Flash y ejecutando las herramientas
 * solicitadas hasta que el modelo decida responder de forma final. Cuando el modelo
 * responde con texto final, transmite los tokens en tiempo real a través del callback.
 */
export async function generarConHerramientasV2Stream(
  pregunta: string,
  historial: { role: "user" | "model"; parts: Array<{ text?: string; functionCall?: any; functionResponse?: any }> }[],
  toolDefinitions: any[],
  onToken: (token: string) => void
): Promise<string> {
  if (!genAI) {
    throw new Error("GEMINI_API_KEY no está configurada o es inválida en el entorno.");
  }

  const formattedTools = toolDefinitions.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: tool.parameters.type,
      properties: tool.parameters.properties || {},
      required: tool.parameters.required || []
    }
  }));

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [
      {
        functionDeclarations: formattedTools
      }
    ]
  });

  const messages: any[] = historial.map(h => ({
    role: h.role,
    parts: h.parts.map(p => {
      if (p.text !== undefined) return { text: p.text };
      if (p.functionCall !== undefined) return { functionCall: p.functionCall };
      if (p.functionResponse !== undefined) return { functionResponse: p.functionResponse };
      return { text: "" };
    })
  }));

  messages.push({
    role: "user",
    parts: [
      {
        text: `Eres el Analista Electoral de la Campaña El Espinal.
        
Pregunta actual: "${pregunta}"

Usa las herramientas disponibles para consultar la base de datos y obtener respuestas exactas.
Si necesitas datos para responder, usa las herramientas. Si ya tienes la respuesta o la pregunta es un saludo/agradecimiento, responde directamente.
IMPORTANTE SOBRE CLAVES: Para ejecutar_consulta_sql en modo de solo lectura (SELECT), NUNCA pidas una clave de administrador, haz la consulta directamente. SOLO debes pedir la clave de administrador al usuario si la solicitud implica modificar, actualizar, borrar o insertar datos (UPDATE, DELETE, INSERT).`
      }
    ]
  });

  let respuestaFinal = "";
  let totalToolCalls = 0;
  const maxIterations = 5;
  const inicioTime = Date.now();

  for (let i = 0; i < maxIterations; i++) {
    logger.info(`[Agente IA Stream] Iteración ${i + 1}/${maxIterations} en curso...`, { sesion: messages.length });
    
    const resultStream = await model.generateContentStream({
      contents: messages
    });

    // Esperar respuesta completa de esta iteración para comprobar llamadas a funciones
    const response = await resultStream.response;
    const functionCalls = response.functionCalls();
    
    // Si no hay llamadas a herramientas, transmitimos el stream final de texto
    if (!functionCalls || functionCalls.length === 0) {
      logger.info(`[Agente IA Stream] Bucle terminado por el modelo. Transmitiendo respuesta final...`, {
        iteraciones: i + 1,
        tiempoMs: Date.now() - inicioTime,
        herramientasEjecutadas: totalToolCalls
      });

      // Leer y transmitir el stream
      for await (const chunk of resultStream.stream) {
        const text = chunk.text();
        if (text) {
          respuestaFinal += text;
          onToken(text);
        }
      }
      break;
    }

    totalToolCalls += functionCalls.length;
    logger.info(`[Agente IA Stream] Gemini solicitó ejecutar ${functionCalls.length} herramientas`, {
      llamadas: functionCalls.map(c => c.name)
    });

    // Ejecutar las herramientas solicitadas en paralelo
    const toolResponses = await Promise.all(
      functionCalls.map(async (call) => {
        try {
          logger.info(`[Agente IA Stream] Ejecutando tool: ${call.name}`, { args: call.args });
          const resultado = await ejecutarHerramienta(call.name, call.args);
          
          let parsedResult;
          try {
            parsedResult = JSON.parse(resultado);
          } catch {
            parsedResult = { rawResponse: resultado };
          }

          return {
            name: call.name,
            response: parsedResult
          };
        } catch (error: any) {
          logger.error(`[Agente IA Stream] Error ejecutando tool ${call.name}`, error);
          return {
            name: call.name,
            response: { error: error.message || "Error desconocido ejecutando la herramienta." }
          };
        }
      })
    );

    // Registrar en el historial de mensajes
    messages.push({
      role: "model",
      parts: functionCalls.map(call => ({
        functionCall: call
      }))
    });

    messages.push({
      role: "user",
      parts: toolResponses.map(res => ({
        functionResponse: {
          name: res.name,
          response: res.response
        }
      }))
    });
  }

  return respuestaFinal;
}

