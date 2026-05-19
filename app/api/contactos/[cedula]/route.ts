import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { handleError, notFound } from "@/lib/api/errors";
import { ContactoSchema } from "@/lib/validation";
import { invalidarCacheAlCrearContacto } from "@/lib/cache-strategies";

export async function GET(
  req: NextRequest,
  { params }: { params: { cedula: string } }
) {
  try {
    const { cedula } = params;

    const contacto = await prisma.contacto.findUnique({
      where: { cedula },
      include: {
        lider: {
          select: { id: true, nombre: true, barrio: true }
        },
        mensajes: {
          take: 50,
          orderBy: { fecha: 'desc' }
        }
      }
    });

    if (!contacto) {
      throw notFound("Contacto");
    }

    return NextResponse.json({ data: contacto });
  } catch (error) {
    return handleError(error, "GET /api/contactos/[cedula]");
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { cedula: string } }
) {
  try {
    const { cedula } = params;
    const body = await req.json();
    
    // Validación parcial (notas u otros campos)
    const contacto = await prisma.contacto.update({
      where: { cedula },
      data: body
    });

    // Invalidar cache de dashboard de forma reactiva
    await invalidarCacheAlCrearContacto(contacto.barrio || undefined);

    return NextResponse.json({ data: contacto });
  } catch (error) {
    return handleError(error, "PUT /api/contactos/[cedula]");
  }
}
