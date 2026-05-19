import { buscarDocumentosHibrido } from "./rag-hybrid-search";
import { crearPromptRAG } from "./rag-prompts";
import { generarAnalisis } from "./gemini";
import prisma from "./db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { traceAICall, traceBDOperation } from "./tracing-helpers";

export async function ejecutarRAG(
  pregunta: string,
  sesionId: string
): Promise<{
  respuesta: string;
  documentos_usados: Array<{ titulo: string; categoria: string }>;
  confianza: number;
}> {
  // 1. Buscar documentos relevantes usando búsqueda híbrida
  const documentos = await buscarDocumentosHibrido(pregunta, 3);

  if (documentos.length === 0) {
    return {
      respuesta:
        "No he encontrado información relevante en la documentación de campaña para responder esta pregunta.",
      documentos_usados: [],
      confianza: 0,
    };
  }

  // 2. Crear prompt con el contexto
  const prompt = crearPromptRAG(pregunta, documentos);

  // 3. Generar respuesta estática
  const respuesta = await traceAICall("gemini-2.5-flash-static-rag", () =>
    generarAnalisis(prompt)
  );

  // 4. Guardar en historial de chat memoria
  await traceBDOperation("save_chat_memory_rag_assistant", () =>
    prisma.chatMemoria.create({
      data: {
        sesion_id: sesionId,
        rol: "assistant",
        contenido: respuesta,
        tipo: "analista",
      },
    })
  );

  await traceBDOperation("save_chat_memory_rag_system", () =>
    prisma.chatMemoria.create({
      data: {
        sesion_id: sesionId,
        rol: "system",
        contenido: `[RAG Híbrido] Documentos consultados: ${documentos.map((d) => d.titulo).join(", ")}`,
        tipo: "analista",
      },
    })
  );

  // 5. Calcular confianza promedio (basada en score combinado de relevancia)
  const confianza =
    documentos.reduce((sum, doc) => sum + parseFloat(doc.relevancia), 0) /
    documentos.length;

  return {
    respuesta,
    documentos_usados: documentos.map((d) => ({
      titulo: d.titulo,
      categoria: d.categoria,
    })),
    confianza,
  };
}

/**
 * Versión Streaming de RAG Híbrido para la UI en tiempo real
 */
export async function ejecutarRAGStream(
  pregunta: string,
  sesionId: string,
  onChunk: (text: string) => void
): Promise<{
  documentos_usados: Array<{ titulo: string; categoria: string }>;
  confianza: number;
}> {
  // 1. Buscar documentos relevantes
  const documentos = await buscarDocumentosHibrido(pregunta, 3);

  if (documentos.length === 0) {
    onChunk("No he encontrado información relevante en la documentación de campaña para responder esta pregunta.");
    return { documentos_usados: [], confianza: 0 };
  }

  // 2. Crear prompt
  const prompt = crearPromptRAG(pregunta, documentos);

  // 3. Generar respuesta streaming
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey === "dummy_key") {
    onChunk("Error: No se ha configurado la API Key de Gemini en el archivo .env.");
    return { documentos_usados: documentos, confianza: 0.5 };
  }

  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const result = await traceAICall("gemini-2.5-flash-stream-rag", () =>
    model.generateContentStream(prompt)
  );

  let acumulado = "";
  for await (const chunk of result.stream) {
    const text = chunk.text();
    acumulado += text;
    onChunk(text);
  }

  // 4. Guardar en historial
  await traceBDOperation("save_chat_memory_rag_stream_assistant", () =>
    prisma.chatMemoria.create({
      data: {
        sesion_id: sesionId,
        rol: "assistant",
        contenido: acumulado,
        tipo: "analista",
      },
    })
  );

  await traceBDOperation("save_chat_memory_rag_stream_system", () =>
    prisma.chatMemoria.create({
      data: {
        sesion_id: sesionId,
        rol: "system",
        contenido: `[RAG Híbrido Stream] Documentos consultados: ${documentos.map((d) => d.titulo).join(", ")}`,
        tipo: "analista",
      },
    })
  );

  const confianza =
    documentos.reduce((sum, doc) => sum + parseFloat(doc.relevancia), 0) /
    documentos.length;

  return {
    documentos_usados: documentos.map((d) => ({
      titulo: d.titulo,
      categoria: d.categoria,
    })),
    confianza,
  };
}
