import { logger } from "./logger";

/**
 * Trazabilidad de base de datos (Prisma)
 */
export async function traceBDOperation<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await operation();
    const duration = Date.now() - start;
    logger.info(`[DB OP] ${name} completado en ${duration}ms`, {
      type: "db_trace",
      operation: name,
      duration_ms: duration,
      status: "success",
    });
    return result;
  } catch (error: any) {
    const duration = Date.now() - start;
    logger.error(`[DB OP] ${name} falló en ${duration}ms`, {
      type: "db_trace",
      operation: name,
      duration_ms: duration,
      status: "error",
      error: error.message || String(error),
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Trazabilidad de llamadas a APIs de IA (Gemini / OpenAI)
 */
export async function traceAICall<T>(
  model: string,
  operation: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await operation();
    const duration = Date.now() - start;
    logger.info(`[AI CALL] ${model} completado en ${duration}ms`, {
      type: "ai_trace",
      model,
      duration_ms: duration,
      status: "success",
    });
    return result;
  } catch (error: any) {
    const duration = Date.now() - start;
    logger.error(`[AI CALL] ${model} falló en ${duration}ms`, {
      type: "ai_trace",
      model,
      duration_ms: duration,
      status: "error",
      error: error.message || String(error),
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Trazabilidad de búsquedas (Autocomplete, Semántica, etc.)
 */
export async function traceSearch<T>(
  query: string,
  operation: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await operation();
    const duration = Date.now() - start;
    logger.info(`[SEARCH] "${query}" completado en ${duration}ms`, {
      type: "search_trace",
      query,
      duration_ms: duration,
      status: "success",
    });
    return result;
  } catch (error: any) {
    const duration = Date.now() - start;
    logger.error(`[SEARCH] "${query}" falló en ${duration}ms`, {
      type: "search_trace",
      query,
      duration_ms: duration,
      status: "error",
      error: error.message || String(error),
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Trazabilidad de operaciones generales con etiquetas personalizadas
 */
export async function traceSpan<T>(
  name: string,
  tags: Record<string, any>,
  operation: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await operation();
    const duration = Date.now() - start;
    logger.info(`[SPAN] ${name} completado en ${duration}ms`, {
      type: "span_trace",
      span_name: name,
      duration_ms: duration,
      status: "success",
      ...tags,
    });
    return result;
  } catch (error: any) {
    const duration = Date.now() - start;
    logger.error(`[SPAN] ${name} falló en ${duration}ms`, {
      type: "span_trace",
      span_name: name,
      duration_ms: duration,
      status: "error",
      error: error.message || String(error),
      stack: error.stack,
      ...tags,
    });
    throw error;
  }
}
