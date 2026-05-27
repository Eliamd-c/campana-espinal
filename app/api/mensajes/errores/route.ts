import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campanaId = searchParams.get("campana_id");
  const resuelto = searchParams.get("resuelto");
  
  try {
    const errores = await prisma.mensajeError.findMany({
      where: {
        ...(campanaId && { campana_id: parseInt(campanaId) }),
        ...(resuelto !== null && { resuelto: resuelto === "true" }),
      },
      orderBy: { ultimo_intento: "desc" },
      take: 100,
    });
    
    return NextResponse.json({ data: errores, count: errores.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorId, accion, notas } = await req.json();
    
    if (accion === "resolver") {
      await prisma.mensajeError.update({
        where: { id: errorId },
        data: {
          resuelto: true,
          notas_resolucion: notas,
          resuelto_por: "Sistema", 
        }
      });
    }
    
    if (accion === "reintentar") {
      // Reencolar el mensaje
      const error = await prisma.mensajeError.findUnique({ where: { id: errorId } });
      if (error) {
        const mensaje = await prisma.mensaje.findUnique({
          where: { id: error.mensaje_id },
          include: { contacto: true }
        });
        
        if (mensaje && mensaje.contacto?.telefono) {
          // Cambiar el estado a pendiente para que el motor local lo tome
          await prisma.mensaje.update({
            where: { id: error.mensaje_id },
            data: { estado: "pendiente" }
          });
          
          await prisma.mensajeError.update({
            where: { id: errorId },
            data: { resuelto: true, notas_resolucion: "Reintentado manualmente" }
          });
        }
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
