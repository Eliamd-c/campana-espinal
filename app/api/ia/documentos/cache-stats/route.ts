import { NextRequest, NextResponse } from "next/server";
import { getEmbeddingCacheStats, limpiarEmbeddingCache } from "@/lib/embedding-cache";
import { handleError } from "@/lib/api/errors";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

export const dynamic = "force-dynamic";

/**
 * GET /api/ia/documentos/cache-stats
 * Ver estadísticas del caché de embeddings
 */
export async function GET() {
  try {
    // Sin permiso para usar el asistente, no se pasa de aqui.
    const permiso = await exigirPermiso(PERMISOS.IA_CONSULTAR);
    if (!permiso.ok) return permiso.respuesta;

    const stats = await getEmbeddingCacheStats();
    return NextResponse.json({ data: stats });
  } catch (error) {
    return handleError(error, "GET /api/ia/documentos/cache-stats");
  }
}

/**
 * POST /api/ia/documentos/cache-stats
 * Limpiar caché de embeddings manualmente
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === "clear") {
      await limpiarEmbeddingCache();
      return NextResponse.json({ message: "Caché de embeddings vaciado por completo." });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error) {
    return handleError(error, "POST /api/ia/documentos/cache-stats");
  }
}
