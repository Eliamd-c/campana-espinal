// Depende de quien hace la peticion: no se puede generar en el build.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { registrarAuditoria } from "@/lib/audit";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";
import {
  aceptar,
  cancelar,
  marcarDuplicada,
  posponer,
  rechazar,
  reprogramar,
} from "@/lib/agenda/decidir";

/**
 * Qué se hace con una solicitud, en una sola puerta.
 *
 * Las seis decisiones van juntas porque son la misma conversación —qué pasa
 * con esto que alguien pidió— y porque así el panel y el agente de WhatsApp
 * llaman al mismo sitio. Todas dejan rastro: ninguna borra nada.
 */
const DecisionSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("aceptar") }),
  z.object({
    accion: z.literal("rechazar"),
    motivo: z.string().min(3, "Di por qué se rechaza").max(500),
  }),
  z.object({
    accion: z.literal("posponer"),
    hasta: z.coerce.date(),
  }),
  z.object({
    accion: z.literal("duplicada"),
    original_id: z.string().uuid("Falta cuál es la original"),
  }),
  z.object({
    accion: z.literal("cancelar"),
    motivo: z.string().min(3, "Di por qué se cancela").max(500),
  }),
  z.object({
    accion: z.literal("reprogramar"),
    fecha_inicio: z.coerce.date(),
    motivo: z.string().max(500).optional(),
  }),
]);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const permiso = await exigirPermiso(PERMISOS.AGENDA_EDITAR);
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = DecisionSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) {
    return NextResponse.json(
      { error: cuerpo.error.issues[0]?.message ?? "Datos no válidos" },
      { status: 400 }
    );
  }

  const quien = permiso.quien.username ?? permiso.quien.usuarioId;
  const decision = cuerpo.data;

  try {
    const resultado = await (async () => {
      switch (decision.accion) {
        case "aceptar":
          return aceptar(params.id, quien);
        case "rechazar":
          return rechazar(params.id, quien, decision.motivo);
        case "posponer":
          return posponer(params.id, quien, decision.hasta);
        case "duplicada":
          return marcarDuplicada(params.id, quien, decision.original_id);
        case "cancelar":
          return cancelar(params.id, quien, decision.motivo);
        case "reprogramar":
          return reprogramar(params.id, quien, decision.fecha_inicio, decision.motivo);
      }
    })();

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }

    /**
     * Se audita todo lo que pasa por aquí, sin excepción: son decisiones sobre
     * compromisos de la campaña, y la pregunta «¿quién decidió esto?» llega
     * siempre tarde y con alguien molesto delante.
     */
    await registrarAuditoria(permiso.quien.usuarioId, `agenda_${decision.accion}`, {
      agendamiento_id: params.id,
      ...decision,
    });

    return NextResponse.json({ data: resultado.datos });
  } catch (error) {
    logger.error("[agenda] Error decidiendo sobre una solicitud", {
      id: params.id,
      accion: decision.accion,
      error: String(error),
    });
    return NextResponse.json({ error: "No se pudo completar." }, { status: 500 });
  }
}
