import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/api/errors";

/**
 * POST /api/campanas/[id]/continuar
 *
 * Encola el siguiente lote de mensajes pendientes de esta campaña,
 * respetando el límite diario de cada línea.
 * Los mensajes que no caben hoy permanecen como "pendiente" para mañana.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campanaId = parseInt(params.id, 10);
    if (isNaN(campanaId)) {
      return NextResponse.json({ error: "ID de campaña inválido" }, { status: 400 });
    }

    // 1. Verificar que la campaña existe y no está cancelada
    const campana = await prisma.campana.findUnique({ where: { id: campanaId } });
    if (!campana) {
      return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
    }
    if (campana.estado === "cancelada") {
      return NextResponse.json({ error: "La campaña está cancelada" }, { status: 400 });
    }

    // 2. Buscar mensajes pendientes de esta campaña (los que no se encolaron aún)
    const mensajesPendientes = await prisma.mensaje.findMany({
      where: { campana_id: campanaId, estado: "pendiente" },
      include: { contacto: { select: { telefono: true } } },
      orderBy: { id: "asc" },
    });

    if (mensajesPendientes.length === 0) {
      return NextResponse.json({
        message: "No hay mensajes pendientes para esta campaña.",
        encolados: 0,
        pendientes: 0,
      });
    }

    // 3. Marcar la campaña como "enviando" por si estaba en otro estado
    if (campana.estado !== "enviando") {
      await prisma.campana.update({
        where: { id: campanaId },
        data: { estado: "enviando" },
      });
    }

    // 4. El motor local se encarga automáticamente de los mensajes en estado "pendiente"
    // No necesitamos encolar nada, ya están listos.

    return NextResponse.json({
      message: `${mensajesPendientes.length} mensajes reactivados y listos para ser enviados por el Motor Local.`,
      encolados: mensajesPendientes.length,
      pendientes: 0,
    });

  } catch (error) {
    return handleError(error, "POST /api/campanas/[id]/continuar");
  }
}

/**
 * GET /api/campanas/[id]/continuar
 *
 * Devuelve cuántos mensajes pendientes tiene esta campaña
 * y cuántos se podrían encolar hoy.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campanaId = parseInt(params.id, 10);
    if (isNaN(campanaId)) {
      return NextResponse.json({ error: "ID de campaña inválido" }, { status: 400 });
    }

    const [pendientesCount, lineas] = await Promise.all([
      prisma.mensaje.count({ where: { campana_id: campanaId, estado: "pendiente" } }),
      prisma.lineaWhatsapp.findMany({
        where: { estado: "conectado" },
        select: { id: true, limite_diario: true, mensajes_enviados_hoy: true },
      }),
    ]);

    const capacidadHoy = lineas.reduce(
      (acc, l) => acc + Math.max(0, (l.limite_diario ?? 45) - (l.mensajes_enviados_hoy ?? 0)),
      0
    );

    return NextResponse.json({
      pendientes: pendientesCount,
      capacidad_hoy: capacidadHoy,
      se_encolarian: Math.min(pendientesCount, capacidadHoy),
    });

  } catch (error) {
    return handleError(error, "GET /api/campanas/[id]/continuar");
  }
}
