import { GoogleGenerativeAI } from "@google/generative-ai";
import { redis } from "./ratelimit";
import crypto from "crypto";

const EMBEDDING_MODEL = "gemini-embedding-001";
const CACHE_TTL = 86400; // 24 horas

function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY no configurada");
  return new GoogleGenerativeAI(key);
}

/**
 * Crear hash SHA-256 del texto para usar como clave de caché
 */
function hashTexto(texto: string): string {
  return crypto.createHash("sha256").update(texto).digest("hex");
}

/**
 * Generar embedding CON CACHÉ local en Redis
 */
export async function generarEmbeddingConCache(texto: string): Promise<number[]> {
  const hash = hashTexto(texto);
  const cacheKey = `embedding:${hash}`;

  try {
    // 1. Intentar obtener del caché de Redis
    const cached = (await redis.get(cacheKey)) as string | null | Record<string, any> | number[];
    if (cached) {
      console.log(`[EmbeddingCache] ✅ Cache hit para: "${texto.substring(0, 30)}..."`);
      if (typeof cached === "object") return cached as number[];
      return JSON.parse(cached as string) as number[];
    }

    // 2. Generar embedding real llamando a la API de Gemini
    console.log(`[EmbeddingCache] 🔄 Cache miss, llamando a Gemini para: "${texto.substring(0, 30)}..."`);
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent(texto);
    const embedding = result.embedding.values;

    // 3. Guardar vector en caché por 24 horas
    await redis.set(cacheKey, JSON.stringify(embedding), { ex: CACHE_TTL });
    console.log(`[EmbeddingCache] 💾 Vector guardado en caché.`);

    return embedding;
  } catch (error) {
    console.error("[EmbeddingCache] ⚠️ Error generando/obteniendo embedding:", error);
    throw error;
  }
}

/**
 * Generar múltiples embeddings en BATCH reutilizando el caché local
 */
export async function generarEmbeddingsBatch(textos: string[]): Promise<number[][]> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

  const resultados: Map<number, number[]> = new Map();
  const textosPorGenerar: Array<{ index: number; texto: string }> = [];

  // Verificar caché de forma secuencial rápida en Redis
  for (let i = 0; i < textos.length; i++) {
    const hash = hashTexto(textos[i]);
    const cacheKey = `embedding:${hash}`;
    const cached = (await redis.get(cacheKey)) as string | null | Record<string, any> | number[];

    if (cached) {
      if (typeof cached === "object") {
        resultados.set(i, cached as number[]);
      } else {
        resultados.set(i, JSON.parse(cached as string) as number[]);
      }
      console.log(`[EmbeddingCache] ✅ Cache hit batch: "${textos[i].substring(0, 20)}..."`);
    } else {
      textosPorGenerar.push({ index: i, texto: textos[i] });
    }
  }

  // Generar embeddings para los textos que no estaban en caché
  if (textosPorGenerar.length > 0) {
    console.log(`[EmbeddingCache] 🔄 Generando ${textosPorGenerar.length} embeddings mediante API en batch...`);

    // El modelo embedContent en Gemini SDK v0.24.0 soporta llamadas individuales rápidas
    for (const { index, texto } of textosPorGenerar) {
      const result = await model.embedContent(texto);
      const embedding = result.embedding.values;

      resultados.set(index, embedding);

      // Guardar en caché
      const hash = hashTexto(texto);
      const cacheKey = `embedding:${hash}`;
      await redis.set(cacheKey, JSON.stringify(embedding), { ex: CACHE_TTL });
    }
  }

  // Retornar en el orden original de la consulta
  const embeddings: number[][] = [];
  for (let i = 0; i < textos.length; i++) {
    embeddings.push(resultados.get(i)!);
  }

  return embeddings;
}

/**
 * Obtener estadísticas del caché de embeddings
 */
export async function getEmbeddingCacheStats(): Promise<{
  embeddings_cacheados: number;
  tamanio_mb: number;
  proxima_limpieza: string;
}> {
  try {
    const keys = await redis.keys("embedding:*");
    // Estimación física de tamaño: cada embedding de 768 dimensiones consume ~3KB
    const tamanio_mb = (keys.length * 3) / 1024;

    return {
      embeddings_cacheados: keys.length,
      tamanio_mb: parseFloat(tamanio_mb.toFixed(2)),
      proxima_limpieza: new Date(Date.now() + CACHE_TTL * 1000).toISOString(),
    };
  } catch (error) {
    console.error("[EmbeddingCache] ⚠️ Error obteniendo estadísticas:", error);
    return {
      embeddings_cacheados: 0,
      tamanio_mb: 0,
      proxima_limpieza: new Date().toISOString(),
    };
  }
}

/**
 * Limpiar de forma manual todo el caché de embeddings
 */
export async function limpiarEmbeddingCache(): Promise<void> {
  try {
    const keys = await redis.keys("embedding:*");
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[EmbeddingCache] 🗑️ Se han eliminado ${keys.length} embeddings del caché`);
    }
  } catch (error) {
    console.error("[EmbeddingCache] ⚠️ Error al vaciar caché de embeddings:", error);
  }
}
