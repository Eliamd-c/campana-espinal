import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/api/errors";

// GET /api/campanas/[id]/mensajes
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campanaId = parseInt(params.id, 10);
    if (isNaN(campanaId)) {
      return NextResponse.json({ error: "ID de campaña inválido" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const mensajes = await prisma.mensaje.findMany({
      where: {
        campana_id: campanaId,
      },
      include: {
        contacto: {
          select: {
            nombre: true,
            telefono: true,
          }
        },
        linea: {
          select: {
            nombre: true,
          }
        }
      },
      orderBy: {
        fecha: 'desc'
      },
      take: limit,
    });

    // Calcular estadísticas en tiempo real
    const estadosCount = await prisma.mensaje.groupBy({
      by: ['estado'],
      where: { campana_id: campanaId },
      _count: true
    });

    const stats = {
      total: 0,
      enviados: 0,
      pendientes: 0,
      fallidos: 0
    };

    estadosCount.forEach(e => {
      stats.total += e._count;
      if (e.estado === 'enviado' || e.estado === 'entregado' || e.estado === 'leido') stats.enviados += e._count;
      else if (e.estado === 'pendiente') stats.pendientes += e._count;
      else if (e.estado === 'fallido' || e.estado === 'error') stats.fallidos += e._count;
    });

    // Formatear datos para el frontend
    const mensajesFormateados = mensajes.map(m => ({
      id: m.id,
      destinatario_nombre: m.contacto?.nombre || "Desconocido",
      destinatario_numero: m.contacto?.telefono || m.contacto_cedula,
      estado: m.estado,
      fecha: m.fecha,
      linea_usada: m.linea?.nombre || "N/A"
    }));

    return NextResponse.json({
      data: mensajesFormateados,
      stats
    });
  } catch (error) {
    return handleError(error, "GET /api/campanas/[id]/mensajes");
  }
}
