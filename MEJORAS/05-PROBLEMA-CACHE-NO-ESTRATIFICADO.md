# 🟠 PROBLEMA 5: CACHÉ NO ESTRATIFICADO

## Estado Actual
En [`app/api/dashboard/metricas/route.ts:5-6`](../app/api/dashboard/metricas/route.ts):

```typescript
const CACHE_KEY = "dashboard:metricas:global";
const CACHE_TTL = 300; // 5 minutos ← Hardcoded, un solo nivel
```

**Problema:** Solo hay caché global. Falta:
- Caché por barrio
- Caché por puesto de votación
- Caché de queries frecuentes
- Invalidación inteligente

## Impacto
- 🔄 **Sin caché:** Mismas queries se repiten constantemente
- 📊 **100 coordinadores:** Mismo query ejecutado 100 veces/minuto
- 💰 **Costo:** 100x queries innecesarias
- ⏱️ **Latencia:** Sin paralelización

---

## 📋 Solución Completa

### Paso 1: Crear `lib/cache-manager.ts`

```typescript
import { redis } from "@/lib/ratelimit";
import prisma from "@/lib/db";

// Estrategia de caché multinivel
export class CacheManager {
  private defaultTTL = 300; // 5 minutos
  private shortTTL = 60;     // 1 minuto
  private longTTL = 3600;    // 1 hora

  /**
   * Get: intenta caché primero, luego DB
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    try {
      // 1. Intentar caché
      const cached = await redis.get(key);
      if (cached) {
        console.log(`✅ Cache hit: ${key}`);
        return JSON.parse(cached);
      }

      // 2. Fetch datos
      console.log(`🔄 Cache miss: ${key}, fetching from DB...`);
      const data = await fetcher();

      // 3. Guardar en caché
      await redis.set(key, JSON.stringify(data), { ex: ttl });

      return data;
    } catch (error) {
      console.error(`⚠️ Cache error en ${key}:`, error);
      // Fallback: devolver dato fresh (sin caché)
      return fetcher();
    }
  }

  /**
   * Set: guardar explícitamente
   */
  async set<T>(key: string, data: T, ttl: number = this.defaultTTL): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(data), { ex: ttl });
      console.log(`💾 Cached: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      console.error(`⚠️ Cache error guardando ${key}:`, error);
    }
  }

  /**
   * Del: invalidar caché
   */
  async del(key: string | string[]): Promise<void> {
    try {
      const keys = Array.isArray(key) ? key : [key];
      await redis.del(...keys);
      console.log(`🗑️ Invalidated: ${keys.join(", ")}`);
    } catch (error) {
      console.error(`⚠️ Cache error borrando:`, error);
    }
  }

  /**
   * Pattern: invalidar múltiples claves con patrón
   */
  async delByPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`🗑️ Invalidated ${keys.length} keys matching ${pattern}`);
      }
    } catch (error) {
      console.error(`⚠️ Cache error en patrón ${pattern}:`, error);
    }
  }

  /**
   * Clear: borrar TODO el caché (use con cuidado)
   */
  async clear(): Promise<void> {
    try {
      await redis.flushdb();
      console.log(`🗑️ Cache cleared completely`);
    } catch (error) {
      console.error(`⚠️ Cache error clearing:`, error);
    }
  }
}

export const cacheManager = new CacheManager();
```

### Paso 2: Crear estrategias de caché para cada dominio

Crear `lib/cache-strategies.ts`:

```typescript
import { cacheManager } from "@/lib/cache-manager";
import prisma from "@/lib/db";

// ══════════════════════════════════════════════════════
// ESTRATEGIA 1: Métricas Globales (Dashboard)
// ══════════════════════════════════════════════════════
export async function getMetricasGlobales() {
  return cacheManager.get(
    "dashboard:metricas:global",
    async () => {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const [stats, total_lideres, total_reuniones] = await Promise.all([
        prisma.$queryRaw<any>`
          SELECT 
            COUNT(*)::int as total_contactos,
            COUNT(*) FILTER (WHERE mesa_numero IS NOT NULL AND mesa_numero != 'ERR')::int as habilitados,
            COUNT(*) FILTER (WHERE mesa_numero = 'ERR')::int as no_habilitados,
            COUNT(*) FILTER (WHERE intencion_voto = 'positivo')::int as voto_positivo,
            COUNT(*) FILTER (WHERE intencion_voto = 'indeciso')::int as voto_indeciso,
            COUNT(*) FILTER (WHERE fecha_registro >= ${hoy})::int as nuevos_hoy
          FROM contactos
        `,
        prisma.lider.count(),
        prisma.reunion.count(),
      ]);

      const data = stats[0] || {};
      return {
        ...data,
        pendientes: data.total_contactos - data.habilitados - data.no_habilitados,
        total_lideres,
        total_reuniones,
        fecha_actualizacion: new Date(),
      };
    },
    300 // 5 minutos
  );
}

// ══════════════════════════════════════════════════════
// ESTRATEGIA 2: Métricas por Barrio
// ══════════════════════════════════════════════════════
export async function getMetricasPorBarrio(barrio: string) {
  return cacheManager.get(
    `dashboard:metricas:barrio:${barrio.toLowerCase()}`,
    async () => {
      const datos = await prisma.$queryRaw<any>`
        SELECT 
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE intencion_voto = 'positivo')::int as positivos,
          COUNT(*) FILTER (WHERE intencion_voto = 'negativo')::int as negativos,
          COUNT(*) FILTER (WHERE intencion_voto = 'indeciso')::int as indecisos,
          COUNT(*) FILTER (WHERE mesa_numero IS NOT NULL AND mesa_numero != 'ERR')::int as habilitados
        FROM contactos
        WHERE barrio ILIKE ${barrio}
      `;
      return datos[0] || { total: 0 };
    },
    600 // 10 minutos
  );
}

// ══════════════════════════════════════════════════════
// ESTRATEGIA 3: Top 10 Líderes (frecuentemente consultado)
// ══════════════════════════════════════════════════════
export async function getTopLideres(limit: number = 10) {
  return cacheManager.get(
    `dashboard:lideres:top:${limit}`,
    async () => {
      return prisma.lider.findMany({
        where: { estado: "activo" },
        select: {
          id: true,
          nombre: true,
          barrio: true,
          score: true,
          personas_nuevas: true,
          personas_repetidas: true,
          _count: { select: { contactos: true } },
        },
        orderBy: { score: "desc" },
        take: limit,
      });
    },
    300 // 5 minutos
  );
}

// ══════════════════════════════════════════════════════
// ESTRATEGIA 4: Estadísticas de Puesto de Votación
// ══════════════════════════════════════════════════════
export async function getEstadisticasPuestos(top: number = 5) {
  return cacheManager.get(
    `dashboard:puestos:stats:${top}`,
    async () => {
      const puestos = await prisma.$queryRaw<any>`
        SELECT 
          puesto_votacion,
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE intencion_voto = 'positivo')::int as positivos,
          COUNT(*) FILTER (WHERE mesa_numero IS NOT NULL AND mesa_numero != 'ERR')::int as habilitados
        FROM contactos
        WHERE puesto_votacion IS NOT NULL
        GROUP BY puesto_votacion
        ORDER BY total DESC
        LIMIT ${top}
      `;
      return puestos;
    },
    600 // 10 minutos
  );
}

// ══════════════════════════════════════════════════════
// ESTRATEGIA 5: Estadísticas de Campañas Activas
// ══════════════════════════════════════════════════════
export async function getEstadisticasCampanas() {
  return cacheManager.get(
    "dashboard:campanas:stats",
    async () => {
      return prisma.$queryRaw<any>`
        SELECT 
          c.id,
          c.nombre,
          c.estado,
          COUNT(m.id)::int as total_mensajes,
          COUNT(m.id) FILTER (WHERE m.estado = 'enviado')::int as enviados,
          COUNT(m.id) FILTER (WHERE m.estado = 'pendiente')::int as pendientes,
          COUNT(m.id) FILTER (WHERE m.estado = 'fallido_definitivo')::int as fallidos
        FROM campanas c
        LEFT JOIN mensajes m ON c.id = m.campana_id
        WHERE c.estado != 'finalizada'
        GROUP BY c.id, c.nombre, c.estado
        ORDER BY c.fecha_creado DESC
      `;
    },
    300 // 5 minutos
  );
}

// ══════════════════════════════════════════════════════
// Invalidation helpers
// ══════════════════════════════════════════════════════

/**
 * Llamar cuando se crea un nuevo contacto
 */
export async function invalidarCacheAlCrearContacto(barrio?: string) {
  await cacheManager.del([
    "dashboard:metricas:global",
    `dashboard:metricas:barrio:${barrio?.toLowerCase() || "*"}`,
  ]);
  // Invalidar con patrón
  await cacheManager.delByPattern("dashboard:metricas:barrio:*");
}

/**
 * Llamar cuando se actualiza un líder
 */
export async function invalidarCacheAlActualizarLider() {
  await cacheManager.del([
    "dashboard:lideres:top:10",
    "dashboard:lideres:top:20",
    "dashboard:lideres:top:50",
  ]);
  await cacheManager.delByPattern("dashboard:lideres:*");
}

/**
 * Llamar cuando se crea una campaña
 */
export async function invalidarCacheAlCrearCampana() {
  await cacheManager.del("dashboard:campanas:stats");
}

/**
 * Invalidación general (usar con cuidado)
 */
export async function invalidarTodoDashboard() {
  await cacheManager.delByPattern("dashboard:*");
}
```

### Paso 3: Integrar en rutas

Actualizar `app/api/dashboard/metricas/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getMetricasGlobales, getEstadisticasPuestos, getTopLideres } from "@/lib/cache-strategies";

export async function GET() {
  try {
    const [metricas, puestos, lideres] = await Promise.all([
      getMetricasGlobales(),
      getEstadisticasPuestos(3),
      getTopLideres(10),
    ]);

    return NextResponse.json({
      data: { metricas, puestos, lideres },
      source: "cached",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

Actualizar `app/api/contactos/route.ts` (al crear):

```typescript
import { invalidarCacheAlCrearContacto } from "@/lib/cache-strategies";

export async function POST(req: NextRequest) {
  // ... validación y creación ...

  const created = await prisma.contacto.create({
    data: { /* ... */ },
  });

  // Invalidar caché relevante
  await invalidarCacheAlCrearContacto(created.barrio);

  return NextResponse.json({ data: created, isNew: true }, { status: 201 });
}
```

---

## 📊 Comparación de Impacto

| Escenario | Sin Caché | Con Caché Simple | Con Caché Estratificado |
|-----------|----------|------------------|------------------------|
| **10 coordinadores viendo dashboard** | 10 queries DB | 1 query DB | 0 queries DB |
| **Búsquedas por barrio (50 diferentes)** | 50 queries | 1 query | Caché por barrio |
| **Latencia promedio** | 150ms | 15ms | 5ms |
| **Carga DB** | 100% | 10% | <5% |

---

## ✅ Pasos de Implementación

### Paso 1: Crear `lib/cache-manager.ts`

```bash
# Copiar código arriba
```

### Paso 2: Crear `lib/cache-strategies.ts`

```bash
# Copiar código arriba
```

### Paso 3: Actualizar rutas de dashboard

```typescript
// app/api/dashboard/metricas/route.ts
import { getMetricasGlobales } from "@/lib/cache-strategies";

export async function GET() {
  const metricas = await getMetricasGlobales();
  return NextResponse.json({ data: metricas });
}
```

### Paso 4: Integrar invalidación en POST routes

Buscar todos los `prisma.contacto.create()`, `prisma.lider.update()`, etc., y añadir:

```typescript
// Después de crear/actualizar:
await invalidarCacheAlCrearContacto(barrio);
```

### Paso 5: Pruebas

```bash
# Test 1: Primera llamada (sin caché)
curl http://localhost:3000/api/dashboard/metricas
# Esperar ~100ms

# Test 2: Segunda llamada (con caché)
curl http://localhost:3000/api/dashboard/metricas
# Esperar ~10ms

# Test 3: Crear contacto
curl -X POST http://localhost:3000/api/contactos \
  -H "Content-Type: application/json" \
  -d '{"cedula":"1234567890", "barrio":"Centro", ...}'
# Debería invalidar caché automáticamente

# Test 4: Siguiente llamada a dashboard
curl http://localhost:3000/api/dashboard/metricas
# Caché fue limpiado y se refresca
```

---

## 🎯 Resultado Esperado

- **Antes:** 150ms por request (sin paralelización)
- **Después:** 5-15ms por request (con caché)
- **Mejora:** **10-30x más rápido**

---

## 🔧 Monitoreo

Añadir logging:

```typescript
// En lib/cache-manager.ts
console.log(`✅ Cache hit: ${key}`); // Log en cada hit
console.log(`🔄 Cache miss: ${key}`); // Log en cada miss

// Calcular hit rate
const hits = /* contador de hits */;
const misses = /* contador de misses */;
const hitRate = (hits / (hits + misses) * 100).toFixed(1);
console.log(`📊 Cache hit rate: ${hitRate}%`);
```

---

## 📚 Referencias
- [Redis Best Practices](https://redis.io/topics/client-libraries)
- [Cache Strategies](https://en.wikipedia.org/wiki/Cache_replacement_policies)
- [Invalidation Patterns](https://martinfowler.com/bliki/CacheAsidePattern.html)
