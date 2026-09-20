// Esta ruta comprueba permisos, asi que depende de quien la pide:
// no se puede generar en tiempo de compilacion.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { handleError } from "@/lib/api/errors";
import { exigirAlgunPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

const ComprobarSchema = z.object({
  cedulas: z
    .array(z.string().regex(/^\d{5,12}$/))
    .min(1)
    .max(200),
});

/**
 * POST /api/contactos/comprobar
 * Body: { cedulas: string[] }  ->  { data: { [cedula]: { nombre } } }
 *
 * Sirve a la tabla de revisión del escáner para saber cuáles de las cédulas
 * recién leídas ya están en el padrón. Antes esto se resolvía pidiendo
 * `/api/contactos/[cedula]` una vez por fila: veinte peticiones por planilla,
 * cada una trayendo la ficha completa con hasta 50 mensajes, y exigiendo
 * CONTACTOS_VER. Aquí va una sola consulta y solo sale el nombre, que es lo
 * único que la tabla necesita mostrar.
 */
export async function POST(req: NextRequest) {
  try {
    /**
     * Basta con poder comprobar existencias; quien ya puede ver fichas o
     * capturar planillas también entra, porque comprobar duplicados es parte
     * inseparable de capturar.
     */
    const permiso = await exigirAlgunPermiso([
      PERMISOS.CONTACTOS_COMPROBAR,
      PERMISOS.CONTACTOS_CAPTURAR,
      PERMISOS.CONTACTOS_VER,
    ]);
    if (!permiso.ok) return permiso.respuesta;

    const cuerpo = await req.json().catch(() => null);
    const parsed = ComprobarSchema.safeParse(cuerpo);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Cédulas inválidas", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const cedulas = Array.from(new Set(parsed.data.cedulas));

    const existentes = await prisma.contacto.findMany({
      where: { cedula: { in: cedulas } },
      select: { cedula: true, nombre: true },
    });

    const data: Record<string, { nombre: string | null }> = {};
    for (const c of existentes) {
      data[c.cedula] = { nombre: c.nombre };
    }

    return NextResponse.json({ data });
  } catch (error) {
    return handleError(error, "POST /api/contactos/comprobar");
  }
}
