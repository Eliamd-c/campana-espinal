// Depende de quien hace la peticion: no se puede generar en el build.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";
import { ESTADOS_PENDIENTES } from "@/lib/agenda/estados";
import { despertarPospuestos } from "@/lib/agenda/decidir";

/**
 * La bandeja: lo que está esperando una decisión.
 *
 * Aquí caen los borradores que crea el agente de WhatsApp cuando un líder pide
 * una reunión por chat, y lo que se captura dictando en el panel. Son
 * peticiones, no compromisos: alguien tiene que mirarlas y decidir.
 *
 * Se ordena por la fecha de la reunión pedida, no por cuándo se pidió: lo que
 * es para el jueves urge decidirlo aunque llegara después.
 */
export async function GET() {
  const permiso = await exigirPermiso(PERMISOS.AGENDA_VER);
  if (!permiso.ok) return permiso.respuesta;

  try {
    /**
     * Se despiertan aquí también, además de en el latido. Si el alojamiento
     * durmió la aplicación toda la noche, quien abre la bandeja por la mañana
     * debe ver ya lo que tocaba hoy, sin esperar al siguiente latido.
     */
    await despertarPospuestos();

    const solicitudes = await prisma.agendamiento.findMany({
      where: { estado: { in: ESTADOS_PENDIENTES } },
      orderBy: { fecha_inicio: "asc" },
      take: 100,
      select: {
        id: true,
        titulo: true,
        fecha_inicio: true,
        barrio: true,
        direccion: true,
        responsable: true,
        estado: true,
        pospuesto_hasta: true,
        grupo_opciones: true,
        asistentes_esperados: true,
        texto_original: true,
        creado_por: true,
        fecha_creado: true,
        plantilla: { select: { nombre: true, icono: true } },
        campos_por_confirmar: { select: { campo: true } },
        recursos_solicitados: {
          orderBy: { orden: "asc" },
          select: { item: true, cantidad_solicitada: true },
        },
      },
    });

    /**
     * Para poder marcar una como duplicada hace falta saber contra qué. Se
     * mandan las que ya están en pie, que son las candidatas: nadie duplica
     * contra algo rechazado.
     */
    const enPie = await prisma.agendamiento.findMany({
      where: { estado: { in: ["cupo", "confirmado"] } },
      orderBy: { fecha_inicio: "asc" },
      take: 100,
      select: { id: true, titulo: true, fecha_inicio: true, barrio: true },
    });

    return NextResponse.json({ data: { solicitudes, enPie } });
  } catch (error) {
    logger.error("[agenda] Error leyendo la bandeja", { error: String(error) });
    return NextResponse.json({ error: "No se pudo leer la bandeja." }, { status: 500 });
  }
}
