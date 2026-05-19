import { NextRequest, NextResponse } from "next/server";
import { bulkUpsertContactos } from "@/lib/bulk-operations";
import { handleError } from "@/lib/api/errors";
import { checkRateLimit, rateLimiters } from "@/lib/ratelimit";
import { invalidarTodoDashboard } from "@/lib/cache-strategies";

export const dynamic = "force-dynamic";

/**
 * POST /api/contactos/bulk-import
 * Body: { contactos: Array<{cedula, nombre, telefono, barrio, intencion_voto}> }
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Rate limiting
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const { success } = await checkRateLimit(rateLimiters.api, ip);
    if (!success) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes en poco tiempo. Intente de nuevo más tarde." },
        { status: 429 }
      );
    }

    // 2. Parsear y validar body
    const body = await req.json().catch(() => ({}));
    const { contactos } = body;

    if (!contactos || !Array.isArray(contactos)) {
      return NextResponse.json(
        { error: "Se requiere un arreglo 'contactos' válido en el cuerpo de la petición." },
        { status: 400 }
      );
    }

    if (contactos.length === 0) {
      return NextResponse.json(
        { error: "El arreglo 'contactos' está vacío." },
        { status: 400 }
      );
    }

    // Limitar tamaño de lote para evitar timeouts en Vercel/Next Server
    if (contactos.length > 5000) {
      return NextResponse.json(
        { error: "El límite máximo por lote de importación es de 5,000 contactos." },
        { status: 400 }
      );
    }

    console.log(`[BulkImport] 📥 Recibidos ${contactos.length} contactos para importación masiva...`);

    // 3. Procesar upsert en lotes controlados
    const resultados = await bulkUpsertContactos(contactos);

    // 4. Invalidar todos los cachés del dashboard
    await invalidarTodoDashboard();

    return NextResponse.json({
      data: resultados,
      message: `Procesamiento masivo completado. Creados: ${resultados.creados}, Actualizados: ${resultados.actualizados}, Fallidos: ${resultados.errores.length}`
    });

  } catch (error) {
    return handleError(error, "POST /api/contactos/bulk-import");
  }
}
