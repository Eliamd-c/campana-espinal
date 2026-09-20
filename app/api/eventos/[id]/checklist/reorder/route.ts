// Esta ruta comprueba permisos, asi que depende de quien la pide:
// no se puede generar en tiempo de compilacion.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/api/errors";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

const ReorderSchema = z.object({
  items: z.array(z.object({
    item: z.string(),
    cantidad_default: z.number(),
    categoria: z.string(),
    obtenido: z.boolean().optional(),
  })),
});

// PATCH /api/eventos/[id]/checklist/reorder
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Sin permiso para editar eventos, no se pasa de aqui.
  const permiso = await exigirPermiso(PERMISOS.AGENDA_EDITAR);
  if (!permiso.ok) return permiso.respuesta;

  try {
    const { id } = params;
    const body = await req.json();
    const parsed = ReorderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos de orden inválidos" }, { status: 400 });
    }

    await prisma.evento.update({
      where: { id },
      data: { checklist: parsed.data.items as any }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error, "PATCH /api/eventos/[id]/checklist/reorder");
  }
}
