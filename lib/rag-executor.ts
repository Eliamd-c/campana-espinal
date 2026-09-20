import { buscarDocumentosHibrido } from "./rag-hybrid-search";
import { logger } from "./logger";
import { crearPromptRAG } from "./rag-prompts";
import { generarAnalisis } from "./gemini";
import prisma from "./db";
import { traceAICall, traceBDOperation } from "./tracing-helpers";
import { generarConIAStream } from "./ia/generar";

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
  const respuesta = await traceAICall("ia-static-rag", () => generarAnalisis(prompt));

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

  /**
   * 3. Generar respuesta en streaming.
   *
   * Antes esto hablaba directamente con Gemini y, sin su clave, escribía el
   * aviso de configuración dentro del chat como si fuera la respuesta del
   * analista. Ahora lo atiende el proveedor configurado, con relevo al otro
   * si se quedó sin crédito.
   */
  let acumulado = "";

  const { proveedor } = await traceAICall("ia-stream-rag", () =>
    generarConIAStream({ modulo: "analisis", prompt }, (texto) => {
      acumulado += texto;
      onChunk(texto);
    })
  );

  logger.info("[rag] Respuesta transmitida", { proveedor });

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
