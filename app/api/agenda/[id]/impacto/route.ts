export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

/**
 * Calcula el impacto de cancelar, mover o rechazar una reunión.
 *
 * Devuelve:
 * - Contactos afectados
 * - Recursos que se pierden
 * - Responsables impactados
 * - Sugerencias de alternativas
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await exigirPermiso(PERMISOS.AGENDA_VER);
  if (!auth.ok) return auth.respuesta;

  try {
    const { id } = params;
    const accion = req.nextUrl.searchParams.get("accion") || "cancelar";

    const reunión = await prisma.agendamiento.findUnique({
      where: { id },
      include: {
        recursos_solicitados: true,
        campos_por_confirmar: true,
      },
    });

    if (!reunión) {
      return NextResponse.json(
        { error: "Reunión no encontrada" },
        { status: 404 }
      );
    }

    // 1. CONTACTOS POTENCIALMENTE AFECTADOS
    // Asumimos que los contactos del barrio pueden enterarse
    const contactosEnBarrio = reunión.barrio
      ? await prisma.contacto.count({
          where: { barrio: reunión.barrio },
        })
      : 0;

    // 2. RECURSOS QUE SE PIERDEN
    const recursosPendientes = reunión.recursos_solicitados?.filter(
      (r) => r.estado === "solicitado" || r.estado === "conseguido"
    ) || [];

    const detallesRecursos = recursosPendientes.map(
      (r) => `${r.item} (${r.cantidad_solicitada || "cantidad no especificada"})`
    );

    // 3. RESPONSABLE IMPACTADO
    let impactoResponsable = "";
    if (reunión.responsable) {
      const otrasReunionesResponsable = await prisma.agendamiento.count({
        where: {
          responsable: reunión.responsable,
          estado: { in: ["confirmado", "cupo"] },
          id: { not: id },
          fecha_inicio: {
            gte: new Date(reunión.fecha_inicio),
            lt: new Date(
              new Date(reunión.fecha_inicio).getTime() + 7 * 24 * 60 * 60 * 1000
            ),
          },
        },
      });

      if (otrasReunionesResponsable === 0) {
        impactoResponsable = `${reunión.responsable} perderá toda la semana asignada`;
      } else {
        impactoResponsable = `${reunión.responsable} tendrá ${otrasReunionesResponsable} reunión(es) menos esta semana`;
      }
    }

    // 4. CONSTRUIR IMPACTOS
    const impactos = [];

    if (contactosEnBarrio > 0) {
      impactos.push({
        tipo: "contactos",
        descripcion: "Contactos potencialmente afectados",
        cantidad: contactosEnBarrio,
        detalles: [
          `En el barrio: ${reunión.barrio}`,
          `Posibles llamadas de seguimiento necesarias`,
        ],
      });
    }

    if (recursosPendientes.length > 0) {
      impactos.push({
        tipo: "logistica",
        descripcion: "Recursos que se pierden",
        cantidad: recursosPendientes.length,
        detalles: detallesRecursos,
      });
    }

    if (impactoResponsable) {
      impactos.push({
        tipo: "responsable",
        descripcion: "Impacto en responsable",
        detalles: [impactoResponsable],
      });
    }

    // 5. CAMPOS PENDIENTES DE CONFIRMAR
    if (reunión.campos_por_confirmar && reunión.campos_por_confirmar.length > 0) {
      impactos.push({
        tipo: "campos",
        descripcion: "Datos pendientes de confirmación",
        cantidad: reunión.campos_por_confirmar.length,
        detalles: reunión.campos_por_confirmar.map((c) => `Falta confirmar: ${c.campo}`),
      });
    }

    // 6. SUGERENCIAS ALTERNATIVAS
    let sugerencias = [];
    if (accion === "cancelar") {
      sugerencias.push(
        "Considerar mover la reunión a otra fecha/hora",
        "Avisar al responsable con anticipación",
        "Registrar el motivo de la cancelación para auditoría"
      );
    }

    return NextResponse.json({
      data: {
        reunionId: id,
        titulo: reunión.titulo,
        accion,
        impactos,
        sugerencias,
        puedeProceeder: true, // siempre se puede proceder, pero con advertencia
      },
    });
  } catch (error) {
    logger.error("[agenda/impacto] Error", { error: String(error) });
    return NextResponse.json(
      { error: "No se pudo calcular el impacto" },
      { status: 500 }
    );
  }
}
