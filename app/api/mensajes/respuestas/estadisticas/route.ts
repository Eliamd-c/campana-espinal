import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const totalRespuestas = await prisma.mensaje.count({
      where: { direccion: "recibido", es_respuesta: true }
    });
    
    const positivas = await prisma.mensaje.count({
      where: { direccion: "recibido", es_respuesta: true, sentimiento: "positivo" }
    });
    
    const requierenAccion = await prisma.mensaje.count({
      where: { direccion: "recibido", requiere_accion: true }
    });
    
    const topCampanas = await prisma.campana.findMany({
      take: 5,
      orderBy: { fecha_creado: 'desc' },
      select: {
        id: true,
        nombre: true,
        _count: {
          select: { mensajes: { where: { direccion: "recibido", es_respuesta: true } } }
        }
      }
    });

    return NextResponse.json({
      total: totalRespuestas,
      positivas,
      requierenAccion,
      topCampanas: topCampanas.map(c => ({
        id: c.id,
        nombre: c.nombre,
        respuestas: c._count.mensajes
      }))
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
