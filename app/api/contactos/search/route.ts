import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/api/errors";
import { z } from "zod";

const SearchSchema = z.object({
  q: z.string().min(2).max(100),
  tipo: z.enum(["nombre", "barrio", "todos"]).default("todos"),
  limit: z.coerce.number().min(1).max(50).default(10),
});

/**
 * GET /api/contactos/search?q=term&tipo=nombre&limit=10
 * 
 * Búsqueda de alto rendimiento optimizada con:
 * - Índices GIN y ts_rank (ordenación por relevancia)
 * - Paginación y límites seguros
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = SearchSchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { q, tipo, limit } = parsed.data;

    // Normalizar la query para tsquery
    const searchTerms = q.trim().split(/\s+/).join(" & ");

    // Query optimizada usando ts_rank y to_tsvector ('spanish')
    let query = `
      SELECT 
        cedula, nombre, telefono, barrio, intencion_voto,
        ts_rank(
          to_tsvector('spanish', COALESCE(nombre, '') || ' ' || COALESCE(barrio, '') || ' ' || COALESCE(problematica, '')), 
          to_tsquery('spanish', $1)
        ) as relevancia
      FROM contactos
      WHERE telefono IS NOT NULL AND telefono != ''
    `;

    const queryParams: any[] = [`${searchTerms}:*`]; // Permite búsqueda de prefijo

    if (tipo === "nombre") {
      query += ` AND to_tsvector('spanish', COALESCE(nombre, '')) @@ to_tsquery('spanish', $1)`;
    } else if (tipo === "barrio") {
      query += ` AND to_tsvector('spanish', COALESCE(barrio, '')) @@ to_tsquery('spanish', $1)`;
    } else {
      // todos
      query += ` AND to_tsvector('spanish', COALESCE(nombre, '') || ' ' || COALESCE(barrio, '') || ' ' || COALESCE(problematica, '')) @@ to_tsquery('spanish', $1)`;
    }

    query += ` ORDER BY relevancia DESC, fecha_registro DESC LIMIT $2`;
    queryParams.push(limit);

    const resultados = await prisma.$queryRawUnsafe<any[]>(query, ...queryParams);
    const totalResultados = resultados.length;

    console.log(`[Search API] Búsqueda completada en ${Date.now() - startTime}ms. Query: "${q}", Resultados: ${totalResultados}`);

    return NextResponse.json({
      data: resultados,
      meta: {
        query: q,
        tipo,
        limit,
        count: totalResultados,
        executionTimeMs: Date.now() - startTime
      }
    });

  } catch (error) {
    return handleError(error, "GET /api/contactos/search");
  }
}
