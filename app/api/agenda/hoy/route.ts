// Depende de quien hace la peticion: no se puede generar en el build.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";
import { PENDIENTES } from "@/lib/agenda/recursos";

/**
 * Lo de hoy y lo de mañana, para leérselo al candidato.
 *
 * Es la pregunta de cada mañana y de cada trayecto en carro: qué sigue, dónde
 * es, quién lo recibe, y qué falta. Hasta ahora había que buscarlo en un
 * calendario mensual, que es la peor forma de contestar algo que se pregunta
 * de pie y con prisa.
 *
 * Se devuelve poco y masticado: solo lo confirmado y lo apartado —los
 * borradores todavía no son planes—, y de cada acto, lo que falta por
 * confirmar y lo que falta por conseguir. Nada de recuentos ni de historia.
 */
export async function GET() {
  const permiso = await exigirPermiso(PERMISOS.AGENDA_VER);
  if (!permiso.ok) return permiso.respuesta;

  try {
    const ahora = new Date();
    const desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    /** Hasta el final de mañana: lo de esta noche y lo del día siguiente. */
    const hasta = new Date(desde.getTime() + 2 * 24 * 60 * 60 * 1000);

    const eventos = await prisma.agendamiento.findMany({
      where: {
        estado: { in: ["cupo", "confirmado"] },
        fecha_inicio: { gte: desde, lt: hasta },
      },
      orderBy: { fecha_inicio: "asc" },
      select: {
        id: true,
        titulo: true,
        fecha_inicio: true,
        fecha_fin: true,
        barrio: true,
        direccion: true,
        responsable: true,
        asistentes_esperados: true,
        notas: true,
        estado: true,
        plantilla: { select: { nombre: true, icono: true } },
        campos_por_confirmar: { select: { campo: true } },
        recursos_solicitados: {
          orderBy: { orden: "asc" },
          select: {
            item: true,
            estado: true,
            cantidad_solicitada: true,
            cantidad_conseguida: true,
            responsable: true,
          },
        },
      },
    });

    return NextResponse.json({
      data: eventos.map((e) => ({
        ...e,
        /**
         * Lo que falta por conseguir se separa aquí y no en la pantalla: es la
         * única línea del acto que puede obligar a mover algo, y conviene que
         * llegue ya destacada.
         */
        recursos_pendientes: e.recursos_solicitados.filter((r) =>
          (PENDIENTES as string[]).includes(r.estado)
        ),
      })),
    });
  } catch (error) {
    logger.error("[agenda] Error leyendo el día", { error: String(error) });
    return NextResponse.json({ error: "No se pudo leer la agenda de hoy." }, { status: 500 });
  }
}
