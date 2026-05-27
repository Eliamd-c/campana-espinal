import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/campanas
export async function GET() {
  try {
    const campanas = await prisma.campana.findMany({
      orderBy: { fecha_creado: "desc" },
    });

    const campanasWithStats = await Promise.all(
      campanas.map(async (c) => {
        const counts = await prisma.mensaje.groupBy({
          by: ['estado'],
          where: { campana_id: c.id },
          _count: true
        });

        const stats = {
          total: 0,
          enviados: 0,
          pendientes: 0,
          fallidos: 0
        };

        counts.forEach(cnt => {
          stats.total += cnt._count;
          if (cnt.estado === 'enviado' || cnt.estado === 'entregado' || cnt.estado === 'leido') {
            stats.enviados += cnt._count;
          } else if (cnt.estado === 'pendiente') {
            stats.pendientes += cnt._count;
          } else if (cnt.estado === 'fallido' || cnt.estado === 'error') {
            stats.fallidos += cnt._count;
          }
        });

        return {
          ...c,
          stats
        };
      })
    );

    return NextResponse.json({ data: campanasWithStats });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
