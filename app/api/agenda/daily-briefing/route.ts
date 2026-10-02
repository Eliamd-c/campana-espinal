export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

/**
 * Daily briefing para el consolidador de agenda.
 *
 * Retorna:
 * - Alertas críticas de hoy
 * - Solicitudes pendientes
 * - Conflictos detectados
 * - Resumen semanal
 */
export async function GET(req: NextRequest) {
  const auth = await exigirPermiso(PERMISOS.AGENDA_VER);
  if (!auth.ok) return auth.respuesta;

  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const mañana = new Date(hoy);
    mañana.setDate(mañana.getDate() + 1);

    const inicioSemana = new Date(hoy);
    const diasAlInicio = inicioSemana.getDay() === 0 ? 6 : inicioSemana.getDay() - 1;
    inicioSemana.setDate(inicioSemana.getDate() - diasAlInicio);

    const finSemana = new Date(inicioSemana);
    finSemana.setDate(finSemana.getDate() + 7);

    // 1. REUNIONES HOY
    const reunionesHoy = await prisma.agendamiento.findMany({
      where: {
        fecha_inicio: { gte: hoy, lt: mañana },
        estado: { in: ["confirmado", "cupo"] },
      },
      include: {
        plantilla: { select: { nombre: true, icono: true } },
        campos_por_confirmar: true,
        recursos_solicitados: true,
      },
      orderBy: { fecha_inicio: "asc" },
    });

    // 2. ALERTAS CRÍTICAS
    const alertas: any[] = [];

    // Campos sin confirmar
    const conCamposPendientes = reunionesHoy.filter(
      (r) => r.campos_por_confirmar && r.campos_por_confirmar.length > 0
    );
    if (conCamposPendientes.length > 0) {
      alertas.push({
        tipo: "campos_pendientes",
        severidad: "alta",
        texto: `${conCamposPendientes.length} reunión(es) con campos sin confirmar`,
        reuniones: conCamposPendientes.map((r) => ({
          id: r.id,
          titulo: r.titulo,
          campos: r.campos_por_confirmar?.map((c) => c.campo) || [],
        })),
      });
    }

    // Recursos faltantes
    const conRecursosPendientes = reunionesHoy.filter((r) =>
      r.recursos_solicitados?.some((rec) =>
        ["solicitado", "conseguido"].includes(rec.estado)
      )
    );
    if (conRecursosPendientes.length > 0) {
      alertas.push({
        tipo: "recursos_pendientes",
        severidad: "media",
        texto: `${conRecursosPendientes.length} reunión(es) con recursos faltantes`,
        reuniones: conRecursosPendientes.map((r) => ({
          id: r.id,
          titulo: r.titulo,
          recursos: r.recursos_solicitados
            ?.filter((rec) => ["solicitado", "conseguido"].includes(rec.estado))
            .map((rec) => `${rec.item} (${rec.estado})`) || [],
        })),
      });
    }

    // 3. SOLICITUDES PENDIENTES (bandeja)
    const solicitudesPendientes = await prisma.agendamiento.findMany({
      where: {
        estado: "cupo",
        fecha_inicio: { gte: inicioSemana, lt: finSemana },
      },
      include: {
        plantilla: { select: { nombre: true, icono: true } },
        recursos_solicitados: true,
      },
      orderBy: { fecha_creado: "desc" },
      take: 10,
    });

    // 4. RESUMEN SEMANAL
    const todasLaSemana = await prisma.agendamiento.findMany({
      where: {
        fecha_inicio: { gte: inicioSemana, lt: finSemana },
      },
    });

    const resumenSemanal = {
      confirmadas: todasLaSemana.filter((r) => r.estado === "confirmado").length,
      cupos: todasLaSemana.filter((r) => r.estado === "cupo").length,
      borradores: todasLaSemana.filter((r) => r.estado === "borrador").length,
      rechazadas: todasLaSemana.filter((r) => r.estado === "rechazado").length,
      canceladas: todasLaSemana.filter((r) => r.estado === "cancelado").length,
    };

    // 5. TIMELINE VISUAL (7 días)
    const timelineVisual = [];
    for (let i = 0; i < 7; i++) {
      const fecha = new Date(inicioSemana);
      fecha.setDate(fecha.getDate() + i);
      const eventos = todasLaSemana.filter(
        (e) =>
          e.fecha_inicio.toDateString() === fecha.toDateString()
      );
      timelineVisual.push({
        fecha: fecha.toISOString().split("T")[0],
        cantidad: eventos.length,
        estados: {
          confirmado: eventos.filter((e) => e.estado === "confirmado").length,
          cupo: eventos.filter((e) => e.estado === "cupo").length,
          borrador: eventos.filter((e) => e.estado === "borrador").length,
        },
      });
    }

    return NextResponse.json({
      data: {
        hoy: hoy.toISOString().split("T")[0],
        reunionesHoy: {
          cantidad: reunionesHoy.length,
          eventos: reunionesHoy.map((r) => ({
            id: r.id,
            titulo: r.titulo,
            hora: r.fecha_inicio.toISOString().split("T")[1].slice(0, 5),
            estado: r.estado,
            responsable: r.responsable,
          })),
        },
        alertas,
        solicitudesPendientes: {
          cantidad: solicitudesPendientes.length,
          eventos: solicitudesPendientes.map((s) => ({
            id: s.id,
            titulo: s.titulo,
            solicitadaPor: s.responsable,
            fechaPropuesta: s.fecha_inicio.toISOString().split("T")[0],
            recursosSolicitados: s.recursos_solicitados?.length || 0,
          })),
        },
        resumenSemanal,
        timelineVisual,
      },
    });
  } catch (error) {
    logger.error("[agenda/daily-briefing] Error", { error: String(error) });
    return NextResponse.json(
      { error: "No se pudo cargar el briefing" },
      { status: 500 }
    );
  }
}
