import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

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
  key: string
): Promise<{ success: boolean; remaining: number; reset: number }> {
  if (!isUpstashConfigured || !limiter) {
    return { success: true, remaining: 999, reset: Date.now() + 60000 };
  }
  try {
    const result = await limiter.limit(key);
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (err) {
    console.error("Rate limit error (falling back to allow):", err);
    return { success: true, remaining: 999, reset: Date.now() + 60000 };
  }
}

