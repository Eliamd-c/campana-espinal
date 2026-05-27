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
    const limit = parseInt(searchParams.get("limit") || "200", 10);

    // Traer TODOS los fallidos primero (sin límite) + los más recientes del resto
    const camposInclude = {
      contacto: { select: { nombre: true, telefono: true } },
      linea:    { select: { nombre: true, numero_telefono: true } },
    };

    const [fallidosMensajes, otrosMensajes] = await Promise.all([
      // Todos los fallidos/error, sin límite
      prisma.mensaje.findMany({
        where: { campana_id: campanaId, estado: { in: ["fallido", "error"] } },
        include: camposInclude,
        orderBy: { fecha: "desc" },
      }),
      // El resto (en_cola, pendiente, enviado, etc.) ordenado por fecha desc
      prisma.mensaje.findMany({
        where: {
          campana_id: campanaId,
          estado: { notIn: ["fallido", "error", "cancelado"] },
        },
        include: camposInclude,
        orderBy: { fecha: "desc" },
        take: limit,
      }),
    ]);

    // Combinar: fallidos primero, luego el resto (hasta llenar el límite total)
    const mensajes = [
      ...fallidosMensajes,
      ...otrosMensajes.slice(0, Math.max(0, limit - fallidosMensajes.length)),
    ];

    // ── Estadísticas en tiempo real ──────────────────────────────────────────
    const estadosCount = await prisma.mensaje.groupBy({
      by: ["estado"],
      where: { campana_id: campanaId },
      _count: true,
    });

    const stats = {
      total: 0,
      enviados: 0,
      en_cola: 0,
      pendientes: 0,
      fallidos: 0,
    };

    estadosCount.forEach((e) => {
      if (e.estado === "cancelado") return;
      stats.total += e._count;
      if (["enviado", "entregado", "leido"].includes(e.estado ?? "")) {
        stats.enviados += e._count;
      } else if (e.estado === "en_cola") {
        stats.en_cola += e._count;
      } else if (e.estado === "pendiente") {
        stats.pendientes += e._count;
      } else if (e.estado === "fallido" || e.estado === "error") {
        stats.fallidos += e._count;
      }
    });

    // ── Descripción de error para mensajes fallidos ──────────────────────────
    const failedIds = fallidosMensajes.map((m) => m.id);
    const erroresPorMensaje: Record<number, string> = {};

    if (failedIds.length > 0) {
      const errores = await prisma.mensajeError.findMany({
        where: { mensaje_id: { in: failedIds } },
        select: { mensaje_id: true, error_message: true },
        orderBy: { ultimo_intento: "desc" },
      });
      for (const e of errores) {
        if (!erroresPorMensaje[e.mensaje_id]) {
          erroresPorMensaje[e.mensaje_id] = e.error_message ?? "Error desconocido";
        }
      }
    }

    // ── Formatear ────────────────────────────────────────────────────────────
    const mensajesFormateados = mensajes.map((m) => ({
      id:                   m.id,
      destinatario_nombre:  m.contacto?.nombre   || "Desconocido",
      destinatario_numero:  m.contacto?.telefono || m.contacto_cedula,
      estado:               m.estado,
      fecha:                m.fecha,
      linea_usada:          m.linea
        ? `${m.linea.nombre} (${m.linea.numero_telefono || "Sin número"})`
        : (m.linea_id ? `Línea #${m.linea_id}` : "Sin línea asignada"),
      error_descripcion:
        m.estado === "fallido" || m.estado === "error"
          ? (erroresPorMensaje[m.id] ?? "Error al enviar")
          : null,
    }));

    return NextResponse.json({ data: mensajesFormateados, stats });
  } catch (error) {
    return handleError(error, "GET /api/campanas/[id]/mensajes");
  }
}
