import { cacheManager } from "./cache-manager";
import prisma from "./db";

// ══════════════════════════════════════════════════════
// ESTRATEGIA 1: Métricas Globales (Dashboard)
// ══════════════════════════════════════════════════════
export async function getMetricasGlobales() {
  return cacheManager.get(
    "dashboard:metricas:global",
    async () => {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const [counts, total_lideres, total_reuniones] = await Promise.all([
        prisma.$queryRaw<any[]>`
          SELECT 
            COUNT(*)::int as total_contactos,
            COUNT(*) FILTER (WHERE (mesa_numero IS NOT NULL AND mesa_numero != 'ERR') AND (municipio IS NULL OR LOWER(TRIM(municipio)) IN ('el espinal', 'espinal')))::int as habilitados,
            COUNT(*) FILTER (WHERE mesa_numero = 'ERR')::int as no_habilitados,
            COUNT(*) FILTER (WHERE (mesa_numero IS NOT NULL AND mesa_numero != 'ERR') AND (municipio IS NOT NULL AND LOWER(TRIM(municipio)) NOT IN ('el espinal', 'espinal')))::int as externos,
            COUNT(*) FILTER (WHERE intencion_voto = 'positivo')::int as voto_positivo,
            COUNT(*) FILTER (WHERE intencion_voto = 'indeciso')::int as voto_indeciso,
            COUNT(*) FILTER (WHERE fecha_registro >= ${hoy})::int as nuevos_hoy
          FROM contactos
        `,
        prisma.lider.count(),
        prisma.reunion.count(),
      ]);

      const stats = counts[0] || {};
      return {
        ...stats,
        pendientes: (stats.total_contactos || 0) - (stats.habilitados || 0) - (stats.no_habilitados || 0) - (stats.externos || 0),
        total_lideres,
        total_reuniones,
        fecha_actualizacion: new Date(),
      };
    },
    300 // 5 minutos de TTL
  );
}

// ══════════════════════════════════════════════════════
// ESTRATEGIA 2: Métricas por Barrio
// ══════════════════════════════════════════════════════
export async function getMetricasPorBarrio(barrio: string) {
  return cacheManager.get(
    `dashboard:metricas:barrio:${barrio.toLowerCase()}`,
    async () => {
      const datos = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE intencion_voto = 'positivo')::int as positivos,
          COUNT(*) FILTER (WHERE intencion_voto = 'negativo')::int as negativos,
          COUNT(*) FILTER (WHERE intencion_voto = 'indeciso')::int as indecisos,
          COUNT(*) FILTER (WHERE mesa_numero IS NOT NULL AND mesa_numero != 'ERR')::int as habilitados
        FROM contactos
        WHERE barrio ILIKE ${barrio}
      `;
      return datos[0] || { total: 0, positivos: 0, negativos: 0, indecisos: 0, habilitados: 0 };
    },
    600 // 10 minutos de TTL
  );
}

// ══════════════════════════════════════════════════════
// ESTRATEGIA 3: Top 10 Líderes (Consumo Frecuente)
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
    300 // 5 minutos de TTL
  );
}

// ══════════════════════════════════════════════════════
// ESTRATEGIA 4: Estadísticas de Puestos de Votación
// ══════════════════════════════════════════════════════
export async function getEstadisticasPuestos(top: number = 5) {
  return cacheManager.get(
    `dashboard:puestos:stats:${top}`,
    async () => {
      const puestos = await prisma.$queryRaw<any[]>`
        SELECT 
          puesto_votacion as nombre,
          COUNT(*)::int as contactos,
          COUNT(*) FILTER (WHERE intencion_voto = 'positivo')::int as positivos,
          COUNT(*) FILTER (WHERE mesa_numero IS NOT NULL AND mesa_numero != 'ERR')::int as habilitados
        FROM contactos
        WHERE puesto_votacion IS NOT NULL
        GROUP BY puesto_votacion
        ORDER BY contactos DESC
        LIMIT ${top}
      `;
      return puestos;
    },
    600 // 10 minutos de TTL
  );
}

// ══════════════════════════════════════════════════════
// ESTRATEGIA 5: Estadísticas de Campañas Activas
// ══════════════════════════════════════════════════════
export async function getEstadisticasCampanas() {
  return cacheManager.get(
    "dashboard:campanas:stats",
    async () => {
      return prisma.$queryRaw<any[]>`
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
    300 // 5 minutos de TTL
  );
}

// ══════════════════════════════════════════════════════
// Funciones de Invalidación Inteligente (Triggers de eventos)
// ══════════════════════════════════════════════════════

/**
 * Invalidar caché al registrar un nuevo contacto o modificar su barrio/intención de voto.
 */
export async function invalidarCacheAlCrearContacto(barrio?: string) {
  const keysToInvalidate = ["dashboard:metricas:global"];
  if (barrio) {
    keysToInvalidate.push(`dashboard:metricas:barrio:${barrio.toLowerCase()}`);
  }
  
  await cacheManager.del(keysToInvalidate);
  
  // Como precaución, invalidamos también los conteos generales de puestos
  await cacheManager.delByPattern("dashboard:puestos:stats:*");
}

/**
 * Invalidar caché cuando cambian las métricas o datos de un líder.
 */
export async function invalidarCacheAlActualizarLider() {
  await cacheManager.delByPattern("dashboard:lideres:*");
}

/**
 * Invalidar estadísticas de campañas de mensajería masiva.
 */
export async function invalidarCacheAlCrearCampana() {
  await cacheManager.del("dashboard:campanas:stats");
}

/**
 * Invalidación total para sincronizaciones profundas o vaciado manual
 */
export async function invalidarTodoDashboard() {
  await cacheManager.delByPattern("dashboard:*");
}
