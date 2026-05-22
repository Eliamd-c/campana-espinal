import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const campanaId = parseInt(params.id);
  
  try {
    const campana = await prisma.campana.findUnique({
      where: { id: campanaId },
      include: {
        _count: {
          select: { mensajes: true }
        }
      }
    });

    if (!campana) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

    const estados = await prisma.mensaje.groupBy({
      by: ['estado'],
      where: { campana_id: campanaId, es_respuesta: false },
      _count: { estado: true }
    });

    const sentimientos = await prisma.mensaje.groupBy({
      by: ['sentimiento'],
      where: { campana_id: campanaId, es_respuesta: true, direccion: "recibido" },
      _count: { sentimiento: true }
    });
    
    // Obtener cronología (mensajes enviados por hora)
    const enviosRecientes = await prisma.mensaje.findMany({
      where: { campana_id: campanaId, estado: "enviado" },
      select: { fecha: true },
      orderBy: { fecha: 'asc' }
    });
    
    // Agrupar por hora
    const cronologia: Record<string, number> = {};
    enviosRecientes.forEach(m => {
      if (m.fecha) {
        const hora = m.fecha.toISOString().slice(0, 13) + ":00:00Z";
        cronologia[hora] = (cronologia[hora] || 0) + 1;
      }
    });

    return NextResponse.json({
      campana,
      estadisticas: {
        total: campana._count.mensajes,
        estados: estados.reduce((acc, curr) => ({ ...acc, [curr.estado || 'unknown']: curr._count.estado }), {}),
        sentimientos: sentimientos.reduce((acc, curr) => ({ ...acc, [curr.sentimiento || 'sin_clasificar']: curr._count.sentimiento }), {}),
        cronologia: Object.entries(cronologia).map(([fecha, envios]) => ({ fecha, envios }))
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
