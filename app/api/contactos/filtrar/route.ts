// Esta ruta comprueba permisos, asi que depende de quien la pide:
// no se puede generar en tiempo de compilacion.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { buildContactoFilters } from "@/lib/whatsapp/filters";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

export async function GET(req: NextRequest) {
  // Sin permiso para listar el padron, no se pasa de aqui.
  const permiso = await exigirPermiso(PERMISOS.CONTACTOS_LISTAR);
  if (!permiso.ok) return permiso.respuesta;

  const { searchParams } = new URL(req.url);
  
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = 100;
  
  const filters = buildContactoFilters(Object.fromEntries(searchParams));
  
  try {
    const [contactos, total] = await Promise.all([
      prisma.contacto.findMany({
        where: filters,
        select: { cedula: true, nombre: true, telefono: true, barrio: true, intencion_voto: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { fecha_registro: "desc" }
      }),
      prisma.contacto.count({ where: filters })
    ]);
    
    return NextResponse.json({
      data: contactos,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
