import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const campanaId = parseInt(params.id);

  try {
    const { accion, razon } = await req.json(); // "pausar" | "reanudar" | "cancelar"

    const campana = await prisma.campana.findUnique({ where: { id: campanaId } });
    if (!campana) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

    if (accion === "pausar") {
      // 1. Cambiar estado de la campaña
      await prisma.campana.update({
        where: { id: campanaId },
        data: { estado: "pausada", pausada_en: new Date() }
      });

      // 2. Revertir mensajes en_cola → pendiente y limpiar linea_id.
      //    Los jobs de BullMQ que todavía queden en cola dispararán el worker,
      //    que verá estado "pendiente" y los ignorará sin marcarlos como fallido.
      await prisma.mensaje.updateMany({
        where: { campana_id: campanaId, estado: "en_cola" },
        data: { estado: "pendiente", linea_id: null }
      });

    } else if (accion === "reanudar") {
      // 1. Cambiar estado de la campaña
      await prisma.campana.update({
        where: { id: campanaId },
        data: { estado: "enviando", pausada_en: null }
      });

      // 2. Al reanudar, no necesitamos hacer nada más porque
      // los mensajes ya están en estado "pendiente" o los que 
      // estaban en_cola fueron revertidos a "pendiente" al pausar.
      // El motor local los retomará automáticamente.

    } else if (accion === "cancelar") {
      // Cancelar tanto los pendientes como los que ya estaban en cola
      await prisma.mensaje.updateMany({
        where: { campana_id: campanaId, estado: { in: ["pendiente", "en_cola"] } },
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
