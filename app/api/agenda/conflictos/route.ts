export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

/**
 * Detecta conflictos en la agenda.
 *
 * Tipos de conflictos:
 * - Misma hora y lugar
 * - Mismo responsable sin tiempo para trasladarse
 * - Actividades potencialmente duplicadas (mismo barrio + responsable)
 */
export async function GET(req: NextRequest) {
  const auth = await exigirPermiso(PERMISOS.AGENDA_VER);
  if (!auth.ok) return auth.respuesta;

  try {
    const desde = new Date(req.nextUrl.searchParams.get("desde") || new Date());
    desde.setHours(0, 0, 0, 0);

    const hasta = new Date(desde);
    hasta.setDate(hasta.getDate() + 7);

    const agendamientos = await prisma.agendamiento.findMany({
      where: {
        fecha_inicio: { gte: desde, lt: hasta },
        estado: { in: ["confirmado", "cupo"] },
      },
      include: {
        plantilla: { select: { nombre: true } },
      },
      orderBy: { fecha_inicio: "asc" },
    });

    const conflictos: any[] = [];

    // 1. CONFLICTOS DE HORA/LUGAR
    for (let i = 0; i < agendamientos.length; i++) {
      for (let j = i + 1; j < agendamientos.length; j++) {
        const a = agendamientos[i];
        const b = agendamientos[j];

        // Mismo día y hora
        if (
          a.fecha_inicio.toDateString() === b.fecha_inicio.toDateString() &&
          Math.abs(a.fecha_inicio.getTime() - b.fecha_inicio.getTime()) <
            30 * 60 * 1000 // 30 minutos
        ) {
          // Mismo lugar
          if (
            a.barrio &&
            b.barrio &&
            a.barrio.toLowerCase() === b.barrio.toLowerCase()
          ) {
            conflictos.push({
              tipo: "hora_lugar",
              severidad: "alta",
              descripcion: `Conflicto de hora y lugar`,
              evento1: {
                id: a.id,
                titulo: a.titulo,
                hora: a.fecha_inicio.toISOString(),
                barrio: a.barrio,
              },
              evento2: {
                id: b.id,
                titulo: b.titulo,
                hora: b.fecha_inicio.toISOString(),
                barrio: b.barrio,
              },
              sugerencia: `Mover "${b.titulo}" a diferente hora o día`,
            });
          }
        }
      }
    }

    // 2. CONFLICTOS DE RESPONSABLE
    for (let i = 0; i < agendamientos.length; i++) {
      for (let j = i + 1; j < agendamientos.length; j++) {
        const a = agendamientos[i];
        const b = agendamientos[j];

        if (!a.responsable || !b.responsable) continue;

        // Mismo responsable
        if (
          a.responsable.toLowerCase() === b.responsable.toLowerCase() &&
          a.id !== b.id
        ) {
          const tiempoEntre = Math.abs(
            a.fecha_inicio.getTime() - b.fecha_inicio.getTime()
          );
          const minutosEntre = tiempoEntre / (1000 * 60);

          // Menos de 45 minutos entre eventos
          if (minutosEntre < 45 && minutosEntre > 0) {
            // Diferentes barrios = imposible trasladarse
            if (
              a.barrio &&
              b.barrio &&
              a.barrio.toLowerCase() !== b.barrio.toLowerCase()
            ) {
              conflictos.push({
                tipo: "responsable_trasladarse",
                severidad: "media",
                descripcion: `${a.responsable} no puede ir de ${a.barrio} a ${b.barrio} en ${minutosEntre.toFixed(0)} min`,
                evento1: {
                  id: a.id,
                  titulo: a.titulo,
                  hora: a.fecha_inicio.toISOString(),
                  barrio: a.barrio,
                },
                evento2: {
                  id: b.id,
                  titulo: b.titulo,
                  hora: b.fecha_inicio.toISOString(),
                  barrio: b.barrio,
                },
                sugerencia: `Asignar ${b.titulo} a otro responsable o mover de fecha`,
              });
            }
          }
        }
      }
    }

    // 3. POTENCIALES DUPLICADOS (mismo barrio + responsable + día)
    const porDiaBarrioResponsable = new Map<string, any[]>();

    agendamientos.forEach((a) => {
      if (!a.barrio || !a.responsable) return;
      const clave = `${a.fecha_inicio.toDateString()}|${a.barrio.toLowerCase()}|${a.responsable.toLowerCase()}`;
      if (!porDiaBarrioResponsable.has(clave)) {
        porDiaBarrioResponsable.set(clave, []);
      }
      porDiaBarrioResponsable.get(clave)?.push(a);
    });

    porDiaBarrioResponsable.forEach((eventos) => {
      if (eventos.length > 1) {
        conflictos.push({
          tipo: "duplicado_potencial",
          severidad: "baja",
          descripcion: `${eventos.length} eventos del mismo responsable en ${eventos[0].barrio} el mismo día`,
          eventos: eventos.map((e) => ({
            id: e.id,
            titulo: e.titulo,
            hora: e.fecha_inicio.toISOString().split("T")[1].slice(0, 5),
          })),
          sugerencia: `Revisar si son realmente necesarios o si pueden consolidarse`,
        });
      }
    });

    return NextResponse.json({
      data: {
        desde: desde.toISOString().split("T")[0],
        hasta: hasta.toISOString().split("T")[0],
        totalEventos: agendamientos.length,
        conflictos,
        resumen: {
          alta: conflictos.filter((c) => c.severidad === "alta").length,
          media: conflictos.filter((c) => c.severidad === "media").length,
          baja: conflictos.filter((c) => c.severidad === "baja").length,
        },
      },
    });
  } catch (error) {
    logger.error("[agenda/conflictos] Error", { error: String(error) });
    return NextResponse.json(
      { error: "No se pudo detectar conflictos" },
      { status: 500 }
    );
  }
}
