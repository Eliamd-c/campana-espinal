import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campanaId = searchParams.get("campana_id");
  const estado = searchParams.get("estado") || "sin_leer"; 
  const sentimiento = searchParams.get("sentimiento");
  
  try {
    const respuestas = await prisma.mensaje.findMany({
      where: {
        direccion: "recibido",
        es_respuesta: true,
        ...(campanaId && { campana_id: parseInt(campanaId) }),
        ...(sentimiento && { sentimiento }),
      },
      include: {
        contacto: {
          select: { nombre: true, telefono: true, cedula: true }
        },
        campana: {
          select: { nombre: true }
        }
      },
      orderBy: { fecha: "desc" },
      take: 100,
    });
    
    return NextResponse.json({ data: respuestas, count: respuestas.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
