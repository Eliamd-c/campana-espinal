import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { buscarDocumentosUltra } from "@/lib/rag-hybrid-search-v2";
import { validarPreguntaRAG } from "@/lib/rag-validator";
import { crearPromptRAGEstrict } from "@/lib/rag-prompts-v2";
import { validarRespuestaRAG, obtenerRecomendacion } from "@/lib/rag-post-validator";
import { traceAICall, traceBDOperation } from "@/lib/tracing-helpers";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const inicio = Date.now();

  try {
    const { pregunta, sesionId } = await req.json();

    // ==================== VALIDAR INPUT ====================
    if (!pregunta || pregunta.length < 5) {
      return NextResponse.json(
        { error: "PREGUNTA_INVÁLIDA", mensaje: "La pregunta debe tener al menos 5 caracteres." },
        { status: 400 }
      );
    }

    if (!sesionId) {
      return NextResponse.json(
        { error: "SESION_REQUERIDA", mensaje: "Se requiere un ID de sesión." },
        { status: 400 }
      );
    }

    // ==================== CAPA 1: BÚSQUEDA ====================
    logger.info(`[RAG v2] Iniciando búsqueda ultra-inteligente para: "${pregunta}"`);
    const documentos = await buscarDocumentosUltra(pregunta, 5);

    // ==================== CAPA 2: VALIDACIÓN PREVIA ====================
    logger.info(`[RAG v2] Validando ${documentos.length} documentos encontrados`);
    const validacionPrevia = await validarPreguntaRAG(pregunta, documentos);

    if (!validacionPrevia.valida) {
      logger.warn(`[RAG v2] ❌ Validación previa falló: ${validacionPrevia.razon}`);

      // Guardar el rechazo para auditoría en BD
      await traceBDOperation("save_rag_rejection_pre_validation", () =>
        prisma.respuestaRAG.create({
          data: {
            sesion_id: sesionId,
            pregunta,
            respuesta: "",
            documentos_usados: [],
            confianza_promedio: validacionPrevia.confianzaPromedio || 0,
            score_validacion: 0,
            problemas_detectados: [validacionPrevia.razon || "DESCONOCIDO"],
            rechazada: true,
            razon_rechazo: validacionPrevia.detalles,
          },
        })
      );

      return NextResponse.json(
        {
          error: "PREGUNTA_NO_RESPALDADA",
          razon: validacionPrevia.razon,
          mensaje: validacionPrevia.detalles,
          documentosDisponibles: documentos.length,
        },
        { status: 400 }
      );
    }

    // ==================== CAPA 3: CREAR PROMPT + GENERAR ====================
    logger.info(`[RAG v2] ✅ Validación previa exitosa. Generando respuesta RAG.`);

    const prompt = crearPromptRAGEstrict(
      pregunta,
      documentos.map((d) => ({
        titulo: d.titulo,
        contenido: d.contenido,
        categoria: d.categoria,
        fuente: d.fuente,
      }))
    );

    const respuesta = await traceAICall("gemini-2.5-flash-rag-v2-inference", () =>
      generarAnalisisRAG(prompt, {
        temperature: 0.1, // MUY CONSERVADOR Y DETERMINÍSTICO
        maxTokens: 600,
      })
    );

    // ==================== CAPA 4: VALIDACIÓN POST-RESPUESTA ====================
    logger.info(`[RAG v2] Realizando auditoría post-respuesta para detectar alucinaciones`);
    const validacionRespuesta = await validarRespuestaRAG(respuesta, documentos);

    logger.info(`[RAG v2] Score de validación post-respuesta: ${validacionRespuesta.score}/100`);

    if (validacionRespuesta.score < 50) {
      logger.error(`[RAG v2] ❌ Respuesta rechazada - Score de auditoría muy bajo: ${validacionRespuesta.score}`);

      // Guardar el rechazo post-auditoría
      await traceBDOperation("save_rag_rejection_post_validation", () =>
        prisma.respuestaRAG.create({
          data: {
            sesion_id: sesionId,
            pregunta,
            respuesta,
            documentos_usados: documentos.map((d) => d.id),
            confianza_promedio: validacionPrevia.confianzaPromedio || 0,
            score_validacion: validacionRespuesta.score,
            problemas_detectados: validacionRespuesta.problemas,
            rechazada: true,
            razon_rechazo: `Score bajo en validación: ${validacionRespuesta.problemas.join(", ")}`,
          },
        })
      );

      return NextResponse.json(
        {
          error: "RESPUESTA_NO_CONFIABLE",
          problemas: validacionRespuesta.problemas,
          mensaje: "La respuesta generada contiene posibles inconsistencias numéricas o falta de referencias. Intenta ser más específico.",
          scoreValidacion: validacionRespuesta.score,
        },
        { status: 400 }
      );
    }

    // ==================== CAPA 5: GUARDAR EN HISTORIAL Y AUDITORÍA ====================
    logger.info(`[RAG v2] ✅ Respuesta aprobada por el validador. Persistiendo e indexando.`);

    await traceBDOperation("persist_verified_rag_v2_interaction", () =>
      Promise.all([
        prisma.chatMemoria.create({
          data: {
            sesion_id: sesionId,
            rol: "user",
            contenido: pregunta,
            tipo: "analista",
          },
        }),
        prisma.chatMemoria.create({
          data: {
            sesion_id: sesionId,
            rol: "assistant",
            contenido: respuesta,
            tipo: "analista",
          },
        }),
        prisma.respuestaRAG.create({
          data: {
            sesion_id: sesionId,
            pregunta,
            respuesta,
            documentos_usados: documentos.map((d) => d.id),
            confianza_promedio: validacionPrevia.confianzaPromedio || 0,
            score_validacion: validacionRespuesta.score,
            problemas_detectados: validacionRespuesta.problemas,
            rechazada: false,
          },
        }),
      ])
    );

    const duracion = Date.now() - inicio;

    return NextResponse.json({
      exito: true,
      respuesta,
      documentos_usados: documentos.map((d) => ({
        id: d.id,
        titulo: d.titulo,
        categoria: d.categoria,
        relevancia: d.relevancia,
        confianza: d.confianza,
      })),
      validacion: {
        confianza_promedio_documentos: (validacionPrevia.confianzaPromedio || 0).toFixed(2),
        score_respuesta: validacionRespuesta.score,
        recomendacion: obtenerRecomendacion(validacionRespuesta.score),
        problemas: validacionRespuesta.problemas,
        advertencias: validacionRespuesta.advertencias,
      },
      metadata: {
        duracion_ms: duracion,
        documentos_buscados: documentos.length,
        sesion_id: sesionId,
      },
    });
  } catch (error: any) {
    logger.error("[RAG v2] Error fatal en controlador:", error);

    return NextResponse.json(
      {
        error: "ERROR_INTERNO",
        mensaje: "Error interno al procesar el análisis RAG ultra-seguro.",
        detalles: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * Invoca a la API de Gemini con temperatura muy baja para respuestas consistentes
 */
async function generarAnalisisRAG(
  prompt: string,
  options: { temperature: number; maxTokens: number }
): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "dummy_key") {
    throw new Error("No se ha configurado la API Key de Gemini en las variables de entorno.");
  }

  const genai = new GoogleGenerativeAI(key);
  const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
      topP: 0.9,
      topK: 40,
    },
  });

  return result.response.text();
}
