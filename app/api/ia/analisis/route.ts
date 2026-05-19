import { NextRequest, NextResponse } from "next/server";
import { generarAnalisis, promptAnalisisLider, promptMensajeMasivo } from "@/lib/gemini";
import { generarConHerramientasV2, generarConHerramientasV2Stream } from "@/lib/gemini-tools";
import { TOOL_DEFINITIONS } from "@/lib/ia-tools";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { getHistorialOptimizado, comprimirHistorialChat } from "@/lib/chat-compression";
import { ejecutarRAG, ejecutarRAGStream } from "@/lib/rag-executor";
import { traceBDOperation, traceAICall } from "@/lib/tracing-helpers";

// ═══════════════════════════════════════════════════════════════
// POST /api/ia/analisis
// ═══════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const { tipo, liderId, contextoMensaje, preguntaAnalista, sesionId, stream } = await req.json();

    // ── MODO EVALUAR LÍDER ─────────────────────────────────────
    if (tipo === "evaluar_lider" && liderId) {
      const lider = await traceBDOperation("get_lider_for_evaluation", () =>
        prisma.lider.findUnique({
          where: { id: parseInt(liderId) },
          include: { contactos: true, reuniones: true }
        })
      );
      if (!lider) return NextResponse.json({ error: "Líder no encontrado" }, { status: 404 });
      const prompt = promptAnalisisLider(lider.nombre || "Sin Nombre", lider.score || 0, lider.contactos.length);
      const respuesta = await traceAICall("gemini-2.5-flash-evaluar-lider", () =>
        generarAnalisis(prompt)
      );
      return NextResponse.json({ data: respuesta });
    }

    // ── MODO REDACTAR MENSAJE ──────────────────────────────────
    if (tipo === "redactar_mensaje" && contextoMensaje) {
      const respuesta = await traceAICall("gemini-2.5-flash-redactar-mensaje", () =>
        generarAnalisis(promptMensajeMasivo(contextoMensaje))
      );
      return NextResponse.json({ data: respuesta });
    }

    // ── MODO ANALISTA CON RAG HÍBRIDO (SEMANTIC + KEYWORD) ──────
    if (tipo === "analista_rag" && preguntaAnalista && sesionId) {
      const startTime = Date.now();

      // Guardar la pregunta del usuario en la memoria
      await traceBDOperation("save_chat_memory_user_rag", () =>
        prisma.chatMemoria.create({
          data: { sesion_id: sesionId, rol: "user", contenido: preguntaAnalista, tipo: "analista" }
        })
      );

      // Si se solicita streaming, usar el ejecutor RAG streaming
      if (stream === true) {
        const encoder = new TextEncoder();
        const responseStream = new ReadableStream({
          async start(controller) {
            try {
              const { documentos_usados, confianza } = await ejecutarRAGStream(
                preguntaAnalista,
                sesionId,
                (token) => {
                  controller.enqueue(encoder.encode(token));
                }
              );

              logger.info(`[API RAG Stream] Completado en ${Date.now() - startTime}ms`, { sesionId, confianza, docsCount: documentos_usados.length });
              controller.close();
            } catch (err: any) {
              logger.error(`[API RAG Stream] Error en stream:`, err);
              controller.error(err);
            }
          }
        });

        return new Response(responseStream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          }
        });
      }

      // Ejecución estática estándar RAG
      const { respuesta, documentos_usados, confianza } = await ejecutarRAG(
        preguntaAnalista,
        sesionId
      );

      logger.info(`[API RAG] Completado en ${Date.now() - startTime}ms`, { sesionId, confianza, docsCount: documentos_usados.length });

      return NextResponse.json({ 
        data: respuesta, 
        documentos_usados, 
        confianza: confianza.toFixed(2) 
      });
    }

    // ── MODO ANALISTA CON AGENTE DE HERRAMIENTAS ───────────────
    if (tipo === "analista" && preguntaAnalista && sesionId) {
      const startTime = Date.now();

      // 1. Recuperar historial de la sesión OPTIMIZADO (Memoria comprimida)
      const historialOptimizado = await getHistorialOptimizado(sesionId, 6);

      // Convertir al formato Gemini esperado por generarConHerramientasV2
      const historialGemini = historialOptimizado.map(h => ({
        role: (h.rol === "assistant" || h.rol === "model") ? "model" as const : "user" as const,
        parts: [{ text: h.contenido }]
      }));

      // 2. Guardar la pregunta del usuario en la memoria
      await traceBDOperation("save_chat_memory_user_agent", () =>
        prisma.chatMemoria.create({
          data: { sesion_id: sesionId, rol: "user", contenido: preguntaAnalista, tipo: "analista" }
        })
      );

      logger.info(`[API Analista] Iniciando ejecución con memoria optimizada`, { sesionId, tamañoHistorial: historialOptimizado.length });

      // Si se solicita streaming, usar el agente streaming
      if (stream === true) {
        const encoder = new TextEncoder();
        const responseStream = new ReadableStream({
          async start(controller) {
            try {
              const respuestaIA = await traceAICall("gemini-2.5-flash-agent-stream", () =>
                generarConHerramientasV2Stream(
                  preguntaAnalista,
                  historialGemini,
                  TOOL_DEFINITIONS,
                  (token) => {
                    controller.enqueue(encoder.encode(token));
                  }
                )
              );

              // 4. Guardar respuesta de la IA en la memoria
              await traceBDOperation("save_chat_memory_agent_stream_assistant", () =>
                prisma.chatMemoria.create({
                  data: { sesion_id: sesionId, rol: "assistant", contenido: respuestaIA, tipo: "analista" }
                })
              );

              logger.info(`[API Analista Stream] Completado en ${Date.now() - startTime}ms`, { sesionId });

              // 5. Comprimir memoria asíncronamente si supera los 15 mensajes
              if (historialOptimizado.length > 15) {
                comprimirHistorialChat(sesionId).catch(err => {
                  logger.error(`[API Analista Stream] Error en compresión de chat asíncrona:`, err);
                });
              }

              controller.close();
            } catch (err: any) {
              logger.error(`[API Analista Stream] Error en stream:`, err);
              controller.error(err);
            }
          }
        });

        return new Response(responseStream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          }
        });
      }

      // 3. Ejecutar el Agente con Function Calling Nativo (Fase 1 🚀) - Modo JSON estándar
      const respuestaIA = await traceAICall("gemini-2.5-flash-agent-static", () =>
        generarConHerramientasV2(
          preguntaAnalista,
          historialGemini,
          TOOL_DEFINITIONS
        )
      );

      // 4. Guardar respuesta de la IA en la memoria
      await traceBDOperation("save_chat_memory_agent_static_assistant", () =>
        prisma.chatMemoria.create({
          data: { sesion_id: sesionId, rol: "assistant", contenido: respuestaIA, tipo: "analista" }
        })
      );

      logger.info(`[API Analista] Completado en ${Date.now() - startTime}ms`, { sesionId });

      // 5. Comprimir memoria asíncronamente si supera los 15 mensajes
      if (historialOptimizado.length > 15) {
        comprimirHistorialChat(sesionId).catch(err => {
          logger.error(`[API Analista] Error en compresión de chat asíncrona:`, err);
        });
      }

      return NextResponse.json({ data: respuestaIA });
    }

    return NextResponse.json({ error: "Faltan parámetros o tipo inválido" }, { status: 400 });

  } catch (error: any) {
    console.error("POST /api/ia/analisis error:", error);
    return NextResponse.json({ error: "Error al procesar la solicitud con IA" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/ia/analisis?sesionId=xxx — Recuperar historial
// ═══════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const sesionId = req.nextUrl.searchParams.get("sesionId");
  if (!sesionId) return NextResponse.json({ data: [] });

  const historial = await prisma.chatMemoria.findMany({
    where: { sesion_id: sesionId },
    orderBy: { timestamp: "asc" }
  });

  return NextResponse.json({ data: historial });
}

