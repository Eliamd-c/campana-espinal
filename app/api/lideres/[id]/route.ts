// Comprueba permisos según quién pide: no se puede generar al compilar.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { AsignarConcejalSchema } from "@/lib/validation";
import { handleError } from "@/lib/api/errors";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

// PATCH /api/lideres/[id] — colgar (o descolgar) el líder de un concejal.
// `concejal_id: null` lo deja como líder del alcalde directamente.
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
    const parsed = AsignarConcejalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Si viene un concejal, se comprueba que exista: evita colgar al líder de
    // un id fantasma.
    if (parsed.data.concejal_id !== null) {
      const existe = await prisma.concejal.findUnique({
        where: { id: parsed.data.concejal_id },
        select: { id: true },
      });
      if (!existe) {
        return NextResponse.json({ error: "El concejal no existe" }, { status: 404 });
      }
    }

    const lider = await prisma.lider.update({
      where: { id },
      data: { concejal_id: parsed.data.concejal_id },
    });

    return NextResponse.json({ data: lider });
  } catch (error) {
    return handleError(error, "PATCH /api/lideres/[id]");
  }
}
