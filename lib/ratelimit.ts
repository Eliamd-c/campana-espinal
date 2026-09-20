import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { consultarLimite, LIMITES } from "@/lib/rate-limit-edge";

const isUpstashConfigured = 
  process.env.REDIS_URL && 
  (process.env.REDIS_URL.startsWith("https://") || process.env.REDIS_URL.startsWith("http://"));

// Crear instancia Redis o mock si no está configurado para Upstash (REST)
let redisInstance: any;

if (isUpstashConfigured) {
  redisInstance = new Redis({
    url: process.env.REDIS_URL || "",
    token: process.env.REDIS_TOKEN || "",
  });
} else {
  // Mock Redis para evitar crasheos si es una URL redis:// (TCP)
  redisInstance = {
    get: async () => null,
    set: async () => "OK",
    del: async () => 1,
    incr: async () => 1,
    eval: async () => [1, 0],
    evalsha: async () => [1, 0],
    scriptLoad: async () => "",
    hset: async () => 0,
    hget: async () => null,
    keys: async () => [],
    pipeline: () => {
      const p = {
        exec: async () => [],
      } as any;
      p.get = () => p;
      p.set = () => p;
      p.del = () => p;
      return p;
    }
  };
}

export const redis = redisInstance;

// Rate limiters por endpoint (solo instanciados si Upstash está configurado)
/**
 * Cubo local equivalente al de cada limitador, para cuando Upstash no esta
 * configurado. Sin esto, `checkRateLimit` devolvia siempre "permitido" y los
 * bloques `if (!success) return 429` de las rutas nunca se ejecutaban: el
 * codigo aparentaba una proteccion que no existia.
 */
const CUBO_LOCAL = {
  scan: "ia",
  sendMessage: "envio",
  api: "datos",
} as const;

export const rateLimiters = {
  scan: isUpstashConfigured ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    analytics: true,
    prefix: "ratelimit:scan",
  }) : null,

  sendMessage: isUpstashConfigured ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(50, "1 m"),
    analytics: true,
    prefix: "ratelimit:message",
  }) : null,

  api: isUpstashConfigured ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "1 m"),
    analytics: true,
    prefix: "ratelimit:api",
  }) : null,
};

export async function checkRateLimit(
  limiter: any,
  key: string,
  cubo: keyof typeof CUBO_LOCAL = "api"
): Promise<{ success: boolean; remaining: number; reset: number }> {
  // Sin Upstash se cuenta en memoria del proceso, igual que hace el
  // middleware. Es una segunda barrera por si alguna ruta se llama desde
  // dentro sin pasar por el.
  if (!isUpstashConfigured || !limiter) {
    const limite = LIMITES[CUBO_LOCAL[cubo]];
    const r = consultarLimite(`ruta:${cubo}:${key}`, limite);
    return {
      success: r.permitido,
      remaining: r.restantes,
      reset: Date.now() + r.reintentarEn * 1000,
    };
  }
  try {
    const result = await limiter.limit(key);
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (err) {
    // Si el limitador remoto falla se sigue contando en local, en vez de
    // dejar pasar todo: un fallo de Redis no puede abrir la puerta.
    console.error("Rate limit remoto no disponible; se cuenta en memoria:", err);
    const limite = LIMITES[CUBO_LOCAL[cubo]];
    const r = consultarLimite(`ruta:${cubo}:${key}`, limite);
    return {
      success: r.permitido,
      remaining: r.restantes,
      reset: Date.now() + r.reintentarEn * 1000,
    };
  }
}

