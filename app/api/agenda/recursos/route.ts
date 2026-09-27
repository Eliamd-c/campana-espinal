// Depende de quien hace la peticion: no se puede generar en el build.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";
import { PENDIENTES, diasHasta } from "@/lib/agenda/recursos";

/**
 * Lo que hay que conseguir, de todas las reuniones a la vez.
 *
 * Es la vuelta al derecho de la pregunta. La ficha de una reunión contesta
 * «qué necesita esta»; quien organiza necesita lo contrario: «qué me falta
 * conseguir esta semana», cruzando todos los actos. Esa es la lista con la
 * que se empieza el día, y hasta ahora había que abrir las reuniones una por
 * una para armarla a mano.
 *
 * Se ordena por la fecha del acto y no por cuándo se pidió el recurso: lo que
 * manda es cuánto falta para que haga falta.
 */

const ConsultaSchema = z.object({
  /** Días hacia adelante. Por defecto una semana, que es como se planea. */
  dias: z.coerce.number().int().min(1).max(120).default(7),
  /** `true` incluye lo ya conseguido, para repasar antes de un acto. */
  todos: z.coerce.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const permiso = await exigirPermiso(PERMISOS.AGENDA_VER);
  if (!permiso.ok) return permiso.respuesta;

  const consulta = ConsultaSchema.safeParse({
    dias: req.nextUrl.searchParams.get("dias") ?? undefined,
    todos: req.nextUrl.searchParams.get("todos") ?? undefined,
  });

  if (!consulta.success) {
    return NextResponse.json({ error: "Parámetros no válidos" }, { status: 400 });
  }

  const { dias, todos } = consulta.data;

  const ahora = new Date();
  const desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const hasta = new Date(desde.getTime() + dias * 24 * 60 * 60 * 1000);

  try {
    const filas = await prisma.recursoSolicitado.findMany({
      where: {
        ...(todos ? {} : { estado: { in: PENDIENTES } }),
        agendamiento: {
          /**
           * Lo cancelado no se persigue, y lo ya ejecutado tampoco: si el acto
           * pasó, conseguir las sillas ya no arregla nada.
           */
          estado: { notIn: ["cancelado", "ejecutado"] },
          fecha_inicio: { gte: desde, lte: hasta },
        },
      },
      orderBy: [{ agendamiento: { fecha_inicio: "asc" } }, { orden: "asc" }],
      select: {
        id: true,
        item: true,
        cantidad_solicitada: true,
        cantidad_conseguida: true,
        estado: true,
        responsable: true,
        notas: true,
        agendamiento: {
          select: {
            id: true,
            titulo: true,
            fecha_inicio: true,
            barrio: true,
            direccion: true,
            estado: true,
            responsable: true,
          },
        },
      },
    });

    return NextResponse.json({
      data: filas.map((r) => ({
        ...r,
        dias_restantes: diasHasta(r.agendamiento.fecha_inicio, ahora),
      })),
    });
  } catch (error) {
    logger.error("[agenda] Error listando recursos", { error: String(error) });
    return NextResponse.json({ error: "No se pudo leer la lista." }, { status: 500 });
  }
}
