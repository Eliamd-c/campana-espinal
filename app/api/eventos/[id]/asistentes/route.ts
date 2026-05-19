import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { handleError, notFound } from "@/lib/api/errors";
import { z } from "zod";

const AsistenteSchema = z.object({
  cedula: z.string().min(7).max(12),
});

// GET /api/eventos/[id]/asistentes
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const asistentes = await prisma.asistenteEvento.findMany({
      where: { evento_id: id },
      include: {
        contacto: {
          select: { nombre: true, barrio: true, telefono: true }
        }
      },
      orderBy: { fecha_registro: 'desc' }
    });

    return NextResponse.json({ data: asistentes });
  } catch (error) {
    return handleError(error, "GET /api/eventos/[id]/asistentes");
  }
}

// POST /api/eventos/[id]/asistentes
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const parsed = AsistenteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Cédula inválida" }, { status: 400 });
    }

    const { cedula } = parsed.data;

    // Verificar si el contacto existe
    const contacto = await prisma.contacto.findUnique({ where: { cedula } });
    if (!contacto) {
      throw notFound("Contacto");
    }

    // Registrar asistencia (Upsert para evitar duplicados en el mismo evento)
    const asistente = await prisma.asistenteEvento.upsert({
      where: {
        evento_id_contacto_cedula: {
          evento_id: id,
          contacto_cedula: cedula
        }
      },
      update: { asistio: true },
      create: {
        evento_id: id,
        contacto_cedula: cedula,
        asistio: true
      }
    });

    return NextResponse.json({ data: asistente }, { status: 201 });
  } catch (error) {
    return handleError(error, "POST /api/eventos/[id]/asistentes");
  }
}
