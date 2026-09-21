import { z } from "zod";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { ESTADOS_INICIALES } from "./estados";

/**
 * Alta de un agendamiento, en un solo sitio.
 *
 * La usan el formulario del panel y el agente de WhatsApp. Estaba dentro de la
 * ruta, y dejarla ahí habría obligado al agente a escribir su propio camino a
 * la base: dos caminos distintos que tarde o temprano dejan de validar lo
 * mismo, y uno de los dos acaba creando reuniones que el otro habría
 * rechazado.
 *
 * El estado de partida **no lo decide quien llama**: nace como borrador o como
 * cupo, nunca confirmado. Confirmar es una acción aparte, en
 * `/api/agenda/[id]/confirmar`, que sí valida las reglas de la plantilla.
 */

export const AltaAgendamientoSchema = z.object({
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

export type AltaAgendamiento = z.infer<typeof AltaAgendamientoSchema>;

type Resultado =
  | { ok: true; agendamiento: Awaited<ReturnType<typeof crearFila>> }
  | { ok: false; error: string; status: number };

function crearFila(
  datos: AltaAgendamiento,
  plantillaCampos: unknown,
  usuarioId: string
) {
  return prisma.agendamiento.create({
    data: {
      plantilla_id: datos.plantilla_id,
      /**
       * Copia de las reglas con las que nace. Si la plantilla se edita
       * después, este agendamiento conserva las suyas.
       */
      reglas_congeladas: (plantillaCampos ?? []) as any,
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
      creado_por: usuarioId,
      campos_por_confirmar: datos.campos_por_confirmar.length
        ? {
            create: datos.campos_por_confirmar.map((c) => ({
              campo: c.campo,
              marcado_por: usuarioId,
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
}

export async function crearAgendamiento(
  datos: AltaAgendamiento,
  usuarioId: string
): Promise<Resultado> {
  if (datos.fecha_fin && datos.fecha_fin < datos.fecha_inicio) {
    return {
      ok: false,
      status: 400,
      error: "La fecha de fin no puede ser anterior a la de inicio.",
    };
  }

  const plantilla = await prisma.plantillaAgenda.findUnique({
    where: { id: datos.plantilla_id },
    select: { id: true, campos: true, activa: true },
  });

  if (!plantilla) {
    return { ok: false, status: 404, error: "La plantilla no existe." };
  }
  if (!plantilla.activa) {
    return { ok: false, status: 400, error: "Esa plantilla está desactivada." };
  }

  const agendamiento = await crearFila(datos, plantilla.campos, usuarioId);

  logger.info("[agenda] Agendamiento creado", {
    estado: agendamiento.estado,
    porConfirmar: agendamiento.campos_por_confirmar.length,
  });

  return { ok: true, agendamiento };
}
