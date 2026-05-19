import { redis } from "@/lib/ratelimit";

// Estrategia de caché multinivel y de alta performance
export class CacheManager {
  private defaultTTL = 300; // 5 minutos
  private shortTTL = 60;     // 1 minuto
  private longTTL = 3600;    // 1 hora

  /**
   * Get: intenta obtener de caché primero; si hay miss, ejecuta fetcher y guarda en caché
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    try {
      // 1. Intentar caché
      const cached = (await redis.get(key)) as string | null | Record<string, any>;
      if (cached) {
        console.log(`[CacheManager] ✅ Cache hit: ${key}`);
        // Upstash Redis puede devolver un objeto o un string parseado automáticamente
        if (typeof cached === "object") return cached as T;
        try {
          return JSON.parse(cached as string) as T;
        } catch {
          return cached as unknown as T;
        }
      }

      // 2. Fetch datos de base de datos
      console.log(`[CacheManager] 🔄 Cache miss: ${key}, cargando desde base de datos...`);
      const data = await fetcher();

      // 3. Guardar en caché
      await redis.set(key, JSON.stringify(data), { ex: ttl });

      return data;
    } catch (error) {
      console.error(`[CacheManager] ⚠️ Error de caché en ${key}:`, error);
      // Fallback: devolver directamente los datos de la base de datos sin crash
      return fetcher();
    }
  }

  /**
   * Set: guardar explícitamente un valor en caché
   */
  async set<T>(key: string, data: T, ttl: number = this.defaultTTL): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(data), { ex: ttl });
      console.log(`[CacheManager] 💾 Cached: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      console.error(`[CacheManager] ⚠️ Error guardando en ${key}:`, error);
    }
  }

  /**
   * Del: invalidar una o más claves del caché
   */
  async del(key: string | string[]): Promise<void> {
    try {
      const keys = Array.isArray(key) ? key : [key];
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`[CacheManager] 🗑️ Claves del caché eliminadas: ${keys.join(", ")}`);
      }
    } catch (error) {
      console.error(`[CacheManager] ⚠️ Error al eliminar del caché:`, error);
    }
  }

  /**
   * Pattern: invalidar múltiples claves por patrón (usando KEYS)
   */
  async delByPattern(pattern: string): Promise<void> {
    try {
      // Nota: en Redis de producción KEYS puede ser lento, pero para esta escala es muy rápido y limpio.
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`[CacheManager] 🗑️ Eliminadas ${keys.length} claves que coinciden con ${pattern}`);
      }
    } catch (error) {
      console.error(`[CacheManager] ⚠️ Error al invalidar patrón ${pattern}:`, error);
    }
  }

  /**
   * Clear: vaciar todo el caché
   */
  async clear(): Promise<void> {
    try {
      await redis.flushdb();
      console.log(`[CacheManager] 🗑️ Caché vaciado por completo`);
    } catch (error) {
      console.error(`[CacheManager] ⚠️ Error al vaciar el caché completo:`, error);
    }
  }
}

export const cacheManager = new CacheManager();
