import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Sin permiso para listar el padron, no se pasa de aqui.
    const permiso = await exigirPermiso(PERMISOS.CONTACTOS_LISTAR);
    if (!permiso.ok) return permiso.respuesta;

    const contactos = await prisma.contacto.findMany({
      select: { barrio: true },
      distinct: ['barrio'],
      where: {
        barrio: { not: null, notIn: ["", " "] }
      }
    });

    const barrios = contactos
      .map(c => c.barrio)
      .filter(Boolean)
      .sort();

    return NextResponse.json({ data: barrios });
  } catch (error: any) {
    console.error("[API Barrios] Error:", error.message);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
