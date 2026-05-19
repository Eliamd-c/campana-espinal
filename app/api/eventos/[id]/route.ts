import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const evento = await prisma.evento.findUnique({
      where: { id: params.id },
      include: {
        lider: {
          select: { nombre: true, telefono: true }
        }
      }
    });

    if (!evento) {
      return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: evento });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const updateData: any = {};

    // Workflow de estados
    if (body.estado) {
      updateData.estado = body.estado;
      if (body.estado === "aprobado") {
        updateData.aprobado_por = body.aprobado_por || "Coordinador Aprobador";
      }
    }
    
    // Post-Evento y Checklists
    if (body.checklist !== undefined) updateData.checklist = body.checklist;
    if (body.asistentes_reales !== undefined) updateData.asistentes_reales = parseInt(body.asistentes_reales);
    if (body.presupuesto_real !== undefined) updateData.presupuesto_real = parseFloat(body.presupuesto_real);
    if (body.notas !== undefined) updateData.notas = body.notas;

    // Actualización de campos normales si están presentes
    if (body.titulo !== undefined) updateData.titulo = body.titulo;
    if (body.tipo !== undefined) updateData.tipo = body.tipo;
    if (body.lugar !== undefined) updateData.lugar = body.lugar;
    if (body.barrio !== undefined) updateData.barrio = body.barrio;
    if (body.fecha_inicio !== undefined) updateData.fecha_inicio = new Date(body.fecha_inicio);
    if (body.fecha_fin !== undefined) updateData.fecha_fin = new Date(body.fecha_fin);
    if (body.asistentes_esperados !== undefined) updateData.asistentes_esperados = parseInt(body.asistentes_esperados);
    if (body.lider_id !== undefined) updateData.lider_id = parseInt(body.lider_id);

    const evento = await prisma.evento.update({
      where: { id: params.id },
      data: updateData
    });

    return NextResponse.json({ data: evento });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Verificar si existe y si está en borrador o pendiente
    const evento = await prisma.evento.findUnique({
      where: { id: params.id },
      select: { estado: true }
    });

    if (!evento) {
      return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
    }

    if (evento.estado === "aprobado" || evento.estado === "en_ejecucion" || evento.estado === "finalizado") {
      return NextResponse.json({ 
        error: "No se puede eliminar un evento que ya ha sido aprobado o ejecutado. Debes cancelarlo." 
      }, { status: 400 });
    }

    await prisma.evento.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
