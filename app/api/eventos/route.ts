import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { FiltroEventosSchema, EventoSchema } from "@/lib/validation";
import { handleError } from "@/lib/api/errors";

// GET: Listar eventos
export async function GET(req: NextRequest) {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = FiltroEventosSchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { tipo, estado, barrio } = parsed.data;

    const where: any = {};
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;
    if (barrio) where.barrio = barrio;

    const eventos = await prisma.evento.findMany({
      where,
      orderBy: { fecha_inicio: "asc" },
      include: {
        lider: {
          select: { nombre: true, telefono: true }
        }
      }
    });

    return NextResponse.json({ data: eventos });
  } catch (error) {
    return handleError(error, "GET /api/eventos");
  }
}

// POST: Crear evento
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = EventoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos de evento inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    
    // Auto-generar checklist basado en el tipo
    const plantilla = await prisma.checklistPlantilla.findFirst({
      where: { tipo_evento: data.tipo, activa: true }
    });

    // Si no hay plantilla, dejamos un checklist vacío
    const checklist = (plantilla?.items as any) || [];

    const nuevoEvento = await prisma.evento.create({
      data: {
        titulo: data.titulo,
        tipo: data.tipo,
        estado: data.estado,
        fecha_inicio: data.fecha_inicio,
        fecha_fin: data.fecha_fin,
        lugar: data.lugar,
        barrio: data.barrio,
        asistentes_esperados: data.asistentes_esperados,
        presupuesto_estimado: data.presupuesto_estimado,
        notas: data.notas,
        creado_por: data.creado_por,
        lider_id: data.lider_id,
        checklist,
        fuente: "web"
      }
    });

    return NextResponse.json({ data: nuevoEvento }, { status: 201 });
  } catch (error) {
    return handleError(error, "POST /api/eventos");
  }
}
