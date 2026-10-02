// Comprueba permisos según quién pide: no se puede generar al compilar.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { ConcejalSchema } from "@/lib/validation";
import { handleError } from "@/lib/api/errors";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

// PATCH /api/concejales/[id] — editar nombre, partido o número de tarjetón.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const permiso = await exigirPermiso(PERMISOS.LIDERES_EDITAR);
    if (!permiso.ok) return permiso.respuesta;

    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Id inválido" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = ConcejalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos de concejal inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const concejal = await prisma.concejal.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ data: concejal });
  } catch (error) {
    return handleError(error, "PATCH /api/concejales/[id]");
  }
}
