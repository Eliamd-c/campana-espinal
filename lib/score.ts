import prisma from "./db";
import { logger } from "./logger";

/**
 * Recalcula el score y estado de alerta por trasteo de un líder.
 * Esto debe llamarse cada vez que un líder realiza una reunión o inscribe personas.
 * 
 * Optimizado: Utiliza una única consulta SQL Raw con Common Table Expressions (CTE)
 * para realizar las agregaciones en la base de datos en lugar de cargar miles de registros en RAM.
 */
export async function recalcularScoreLider(liderId: number) {
  const startTime = Date.now();
  try {
    // 1. Obtener estadísticas agregadas en una sola consulta
    const stats = await prisma.$queryRaw<
      {
        total_reuniones: number;
        personas_nuevas: number;
        personas_repetidas: number;
        cobertura_barrio: number;
        barrio_lider: string | null;
      }[]
    >`
      WITH lider_data AS (
        SELECT id, barrio FROM lideres WHERE id = ${liderId}
      ),
      reunion_stats AS (
        SELECT COUNT(*)::int as total_reuniones
        FROM reuniones
        WHERE lider_id = ${liderId}
      ),
      contacto_stats AS (
        SELECT 
          COUNT(*) FILTER (WHERE es_nuevo = true)::int as personas_nuevas,
          COUNT(*) FILTER (WHERE es_nuevo = false)::int as personas_repetidas,
          COUNT(*) FILTER (WHERE LOWER(barrio) = LOWER((SELECT barrio FROM lider_data)))::int as cobertura_barrio
        FROM contactos
        WHERE lider_id = ${liderId}
      )
      SELECT 
        (SELECT total_reuniones FROM reunion_stats)::int as total_reuniones,
        (SELECT personas_nuevas FROM contacto_stats)::int as personas_nuevas,
        (SELECT personas_repetidas FROM contacto_stats)::int as personas_repetidas,
        (SELECT cobertura_barrio FROM contacto_stats)::int as cobertura_barrio,
        (SELECT barrio FROM lider_data)::text as barrio_lider
    `;

    if (!stats || stats.length === 0) {
      logger.warn(`[Score] Líder no encontrado al recalcular score`, { liderId });
      return;
    }

    const {
      total_reuniones,
      personas_nuevas,
      personas_repetidas,
      cobertura_barrio,
    } = stats[0];

    // Tasa de trasteo = repetidas / (total reuniones o 1 para evitar división por cero)
    const tasaTrasteo = total_reuniones > 0 ? (personas_repetidas / total_reuniones) : 0;
    
    // score = (personas_nuevas * 3) - (tasa_trasteo * 2) + cobertura_barrio
    const score = Math.round((personas_nuevas * 3) - (tasaTrasteo * 2) + cobertura_barrio);
    
    // alerta = true si tasa_trasteo > 60%
    const totalPersonas = personas_nuevas + personas_repetidas;
    const porcentajeTrasteo = totalPersonas > 0 ? (personas_repetidas / totalPersonas) * 100 : 0;
    
    const alerta = porcentajeTrasteo > 60;
    const estado = alerta ? "alerta" : "activo";

    // 2. Actualizar el líder con los nuevos resultados en una única operación
    await prisma.lider.update({
      where: { id: liderId },
      data: {
        personas_nuevas,
        personas_repetidas,
        tasa_trasteo: porcentajeTrasteo,
        score,
        estado,
      },
    });

    logger.info(`[Score] Score recalculado para líder ${liderId} en ${Date.now() - startTime}ms`, {
      score,
      personas_nuevas,
      personas_repetidas,
      tasa_trasteo: porcentajeTrasteo,
      estado
    });

  } catch (error: any) {
    logger.error(`[Score] Error al recalcular score del líder ${liderId}`, error);
    throw error;
  }
}

