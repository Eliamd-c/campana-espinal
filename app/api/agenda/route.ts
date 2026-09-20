// Depende de quien hace la peticion: no se puede generar en el build.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";
import { ESTADOS_INICIALES } from "@/lib/agenda/estados";

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
 * El estado de partida **no lo decide el cliente**: nace como borrador o como
 * cupo, nunca confirmado. Antes se tomaba de `body.estado`, así que bastaba
 * enviar `"confirmado"` para saltarse entero el motor de reglas — es decir,
 * para dar por sentada una reunión sin dirección, sin hora y sin nada.
 *
 * Confirmar es una acción aparte, en `/api/agenda/[id]/confirmar`, que sí
 * valida.
 */
const AltaSchema = z.object({
  plantilla_id: z.string().uuid("Falta la plantilla"),
  titulo: z.string().min(3, "El título es obligatorio").max(200),
  fecha_inicio: z.coerce.date(),
  fecha_fin: z.coerce.date().optional(),
  barrio: z.string().max(80).optional(),
  direccion: z.string().max(200).optional(),
  datos: z.record(z.string(), z.unknown()).default({}),
  estado: z.enum(ESTADOS_INICIALES).default("cupo"),
  lider_id: z.coerce.number().int().positive().optional(),
  responsable: z.string().max(80).optional(),
  asistentes_esperados: z.coerce.number().int().min(0).max(1_000_000).optional(),
  presupuesto_estimado: z.coerce.number().min(0).optional(),
  notas: z.string().max(5000).optional(),
  texto_original: z.string().max(3000).optional(),
  campos_por_confirmar: z
    .array(z.object({ campo: z.string().max(60) }))
    .max(30)
    .default([]),
  recursos_solicitados: z
    .array(
      z.object({
        item: z.string().min(1).max(120),
        cantidad_solicitada: z.coerce.number().int().min(0).max(100000).nullable().default(null),
      })
    )
    .max(40)
    .default([]),
});

export async function POST(req: NextRequest) {
  const auth = await exigirPermiso(PERMISOS.AGENDA_EDITAR);
  if (!auth.ok) return auth.respuesta;

  try {
    const parsed = AltaSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const datos = parsed.data;

    if (datos.fecha_fin && datos.fecha_fin < datos.fecha_inicio) {
      return NextResponse.json(
        { error: "La fecha de fin no puede ser anterior a la de inicio." },
        { status: 400 }
      );
    }

    const plantilla = await prisma.plantillaAgenda.findUnique({
      where: { id: datos.plantilla_id },
      select: { id: true, campos: true, activa: true },
    });

    if (!plantilla) {
      return NextResponse.json({ error: "La plantilla no existe." }, { status: 404 });
    }
    if (!plantilla.activa) {
      return NextResponse.json(
        { error: "Esa plantilla está desactivada." },
        { status: 400 }
      );
    }

    const agendamiento = await prisma.agendamiento.create({
      data: {
        plantilla_id: plantilla.id,
        /**
         * Copia de las reglas con las que nace. Si la plantilla se edita
         * después, este agendamiento conserva las suyas.
         */
        reglas_congeladas: plantilla.campos ?? [],
        titulo: datos.titulo,
        fecha_inicio: datos.fecha_inicio,
        fecha_fin: datos.fecha_fin,
        barrio: datos.barrio,
        direccion: datos.direccion,
        datos: datos.datos as any,
        estado: datos.estado,
        lider_id: datos.lider_id,
        responsable: datos.responsable,
        asistentes_esperados: datos.asistentes_esperados,
        presupuesto_estimado: datos.presupuesto_estimado,
        notas: datos.notas,
        texto_original: datos.texto_original,
        creado_por: auth.quien.usuarioId,
        campos_por_confirmar: datos.campos_por_confirmar.length
          ? {
              create: datos.campos_por_confirmar.map((c) => ({
                campo: c.campo,
                marcado_por: auth.quien.usuarioId,
              })),
            }
          : undefined,
        recursos_solicitados: datos.recursos_solicitados.length
          ? {
              create: datos.recursos_solicitados.map((r, idx) => ({
                item: r.item,
                cantidad_solicitada: r.cantidad_solicitada,
                estado: "solicitado",
                orden: idx,
              })),
            }
          : undefined,
      },
      include: {
        plantilla: { select: { nombre: true, color: true, icono: true } },
        campos_por_confirmar: true,
        recursos_solicitados: { orderBy: { orden: "asc" } },
      },
    });

    logger.info("[agenda] Agendamiento creado", {
      estado: agendamiento.estado,
      porConfirmar: agendamiento.campos_por_confirmar.length,
    });

    return NextResponse.json({ data: agendamiento }, { status: 201 });
  } catch (error) {
    logger.error("[agenda] Error creando agendamiento", { error: String(error) });
    return NextResponse.json(
      { error: "No se pudo crear el agendamiento." },
      { status: 500 }
    );
  }
}
