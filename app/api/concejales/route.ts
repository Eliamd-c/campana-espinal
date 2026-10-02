// Comprueba permisos según quién pide: no se puede generar al compilar.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { ConcejalSchema } from "@/lib/validation";
import { handleError } from "@/lib/api/errors";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

// GET /api/concejales — la pirámide: cada concejal con cuántos líderes y
// reuniones cuelgan de él.
export async function GET() {
  try {
    // Gestionar la estructura es el mismo dominio que gestionar líderes.
    const permiso = await exigirPermiso(PERMISOS.LIDERES_VER);
    if (!permiso.ok) return permiso.respuesta;

    const concejales = await prisma.concejal.findMany({
      orderBy: { nombre: "asc" },
      include: {
        _count: { select: { lideres: true, reuniones: true } },
      },
    });

    return NextResponse.json({ data: concejales });
  } catch (error) {
    return handleError(error, "GET /api/concejales");
  }
}

// POST /api/concejales — crear un candidato al concejo.
export async function POST(req: NextRequest) {
  try {
    const permiso = await exigirPermiso(PERMISOS.LIDERES_EDITAR);
    if (!permiso.ok) return permiso.respuesta;

    const body = await req.json();
    const parsed = ConcejalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos de concejal inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const concejal = await prisma.concejal.create({ data: parsed.data });

    return NextResponse.json({ data: concejal }, { status: 201 });
  } catch (error) {
    return handleError(error, "POST /api/concejales");
  }
}
