import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const campanaId = parseInt(params.id);
  
  try {
    const { accion, razon } = await req.json(); // "pausar", "reanudar", "cancelar"
    
    const campana = await prisma.campana.findUnique({ where: { id: campanaId } });
    if (!campana) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
    
    if (accion === "pausar") {
      await prisma.campana.update({
        where: { id: campanaId },
        data: { estado: "pausada", pausada_en: new Date() }
      });
    } else if (accion === "reanudar") {
      await prisma.campana.update({
        where: { id: campanaId },
        data: { estado: "enviando", pausada_en: null }
      });
    } else if (accion === "cancelar") {
      // Marcar todos los pendientes como cancelados
      await prisma.mensaje.updateMany({
        where: { campana_id: campanaId, estado: "pendiente" },
        data: { estado: "cancelado" }
      });
      
      await prisma.campana.update({
        where: { id: campanaId },
        data: {
          estado: "cancelada",
          cancelada_en: new Date(),
          cancelada_por: "Sistema", 
          razon_cancelacion: razon
        }
      });
    } else {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    }
    
    return NextResponse.json({ success: true, accion });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
