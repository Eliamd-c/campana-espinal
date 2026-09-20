// Esta ruta comprueba permisos, asi que depende de quien la pide:
// no se puede generar en tiempo de compilacion.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { FiltroLideresSchema, LiderSchema } from "@/lib/validation";
import { handleError } from "@/lib/api/errors";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

// GET /api/lideres
export async function GET(req: NextRequest) {
  try {
    // Sin permiso para ver lideres, no se pasa de aqui.
    const permiso = await exigirPermiso(PERMISOS.LIDERES_VER);
    if (!permiso.ok) return permiso.respuesta;

    const params = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = FiltroLideresSchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { query, limit } = parsed.data;

    const lideres = await prisma.lider.findMany({
      where: query ? {
        OR: [
          { nombre: { contains: query, mode: "insensitive" } },
          { barrio: { contains: query, mode: "insensitive" } },
        ]
      } : {},
      orderBy: { score: "desc" },
      include: {
        _count: {
          select: { contactos: true, reuniones: true },
        },
      },
      take: limit,
    });

    return NextResponse.json({ data: lideres });
  } catch (error) {
    return handleError(error, "GET /api/lideres");
  }
}

// POST /api/lideres
export async function POST(req: NextRequest) {
  try {
    // Sin permiso para crear lideres, no se pasa de aqui.
    const permiso = await exigirPermiso(PERMISOS.LIDERES_EDITAR);
    if (!permiso.ok) return permiso.respuesta;

    const body = await req.json();
    const parsed = LiderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos de líder inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { nombre, telefono, barrio } = parsed.data;

    const lider = await prisma.lider.create({
      data: { nombre, telefono, barrio },
    });

    return NextResponse.json({ data: lider }, { status: 201 });
  } catch (error) {
    return handleError(error, "POST /api/lideres");
  }
}
