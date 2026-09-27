// Depende de quien hace la peticion: no se puede generar en el build.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { registrarAuditoria } from "@/lib/audit";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";
import { ESTADOS_RECURSO, puedePasarA } from "@/lib/agenda/recursos";

/**
 * Mover un recurso: quién lo consigue, si ya está, cuántos llegaron.
 *
 * Todo opcional y todo por separado, porque así se usa de verdad: primero se
 * asigna a alguien, días después se marca conseguido, y el día del acto se
 * confirma que llegó. Obligar a mandar la fila entera en cada toque haría que
 * asignar a alguien borrara sin querer la cantidad que ya se había anotado.
 */
const CambioSchema = z
  .object({
    estado: z.enum(ESTADOS_RECURSO).optional(),
    responsable: z.string().max(80).nullable().optional(),
    cantidad_conseguida: z.coerce.number().int().min(0).max(100000).nullable().optional(),
    notas: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No hay nada que cambiar" });

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const permiso = await exigirPermiso(PERMISOS.AGENDA_EDITAR);
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = CambioSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) {
    return NextResponse.json(
      { error: cuerpo.error.issues[0]?.message ?? "Datos no válidos" },
      { status: 400 }
    );
  }

  const actual = await prisma.recursoSolicitado.findUnique({
    where: { id: params.id },
    select: { id: true, item: true, estado: true, agendamiento_id: true },
  });

  if (!actual) {
    return NextResponse.json({ error: "Ese recurso no existe" }, { status: 404 });
  }

  const { estado, responsable, cantidad_conseguida, notas } = cuerpo.data;

  if (estado && !puedePasarA(actual.estado, estado)) {
    return NextResponse.json(
      { error: `No se puede pasar de «${actual.estado}» a «${estado}».` },
      { status: 409 }
    );
  }

  try {
    const fila = await prisma.recursoSolicitado.update({
      where: { id: actual.id },
      data: {
        ...(estado ? { estado } : {}),
        ...(responsable !== undefined ? { responsable } : {}),
        ...(cantidad_conseguida !== undefined ? { cantidad_conseguida } : {}),
        ...(notas !== undefined ? { notas } : {}),
      },
      select: {
        id: true,
        item: true,
        estado: true,
        responsable: true,
        cantidad_solicitada: true,
        cantidad_conseguida: true,
        notas: true,
      },
    });

    /**
     * Se audita el cambio de estado y solo ese. Quién dijo que el sonido
     * estaba conseguido es la pregunta del día del acto cuando no aparece;
     * que alguien corrigiera una nota, no le importa a nadie.
     */
    if (estado) {
      await registrarAuditoria(permiso.quien.usuarioId, "agenda_recurso_estado", {
        recurso_id: fila.id,
        agendamiento_id: actual.agendamiento_id,
        item: fila.item,
        de: actual.estado,
        a: estado,
      });
    }

    logger.info("[agenda] Recurso actualizado", {
      recurso: fila.id,
      item: fila.item,
      estado: fila.estado,
      usuario: permiso.quien.username,
    });

    return NextResponse.json({ data: fila });
  } catch (error) {
    logger.error("[agenda] Error actualizando recurso", {
      recurso: params.id,
      error: String(error),
    });
    return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  }
}
