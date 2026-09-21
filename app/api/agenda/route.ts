// Depende de quien hace la peticion: no se puede generar en el build.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";
import { AltaAgendamientoSchema, crearAgendamiento } from "@/lib/agenda/crear";

const FiltroSchema = z.object({
  desde: z.string().datetime().optional().or(z.literal("")),
  hasta: z.string().datetime().optional().or(z.literal("")),
  estado: z.string().max(20).optional().or(z.literal("")),
  limite: z.coerce.number().int().min(1).max(500).default(200),
});

export async function GET(req: NextRequest) {
  const auth = await exigirPermiso(PERMISOS.AGENDA_VER);
  if (!auth.ok) return auth.respuesta;

  try {
    const parsed = FiltroSchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { desde, hasta, estado, limite } = parsed.data;
    const where: any = {};

    if (desde && hasta) {
      where.fecha_inicio = { gte: new Date(desde), lte: new Date(hasta) };
    }
    if (estado) {
      where.estado = estado;
    }

    const agendamientos = await prisma.agendamiento.findMany({
      where,
      orderBy: { fecha_inicio: "asc" },
      // Techo de resultados: un calendario pide un mes, no la historia entera.
      take: limite,
      include: {
        plantilla: { select: { nombre: true, color: true, icono: true } },
        campos_por_confirmar: true,
        recursos_solicitados: { orderBy: { orden: "asc" } },
      },
    });

    return NextResponse.json({ data: agendamientos });
  } catch (error) {
    logger.error("[agenda] Error listando agendamientos", { error: String(error) });
    return NextResponse.json({ error: "No se pudo cargar la agenda." }, { status: 500 });
  }
}

/**
 * Alta de un agendamiento.
 *
 * La validación y la escritura viven en `lib/agenda/crear.ts`, compartidas con
 * el agente de WhatsApp: dos caminos distintos a la misma tabla acaban
 * validando cosas distintas.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirPermiso(PERMISOS.AGENDA_EDITAR);
  if (!auth.ok) return auth.respuesta;

  try {
    const parsed = AltaAgendamientoSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const resultado = await crearAgendamiento(parsed.data, auth.quien.usuarioId);

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }

    return NextResponse.json({ data: resultado.agendamiento }, { status: 201 });
  } catch (error) {
    logger.error("[agenda] Error creando agendamiento", { error: String(error) });
    return NextResponse.json(
      { error: "No se pudo crear el agendamiento." },
      { status: 500 }
    );
  }
}
