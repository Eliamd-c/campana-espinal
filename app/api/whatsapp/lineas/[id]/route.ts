// Actúa sobre sockets vivos: nunca se puede generar en el build.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { registrarAuditoria } from "@/lib/audit";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";
import { abrirLinea, cerrarLinea, desvincularLinea } from "@/lib/whatsapp/conexion";

/**
 * Acciones sobre una línea: conectar, cerrar y desvincular.
 *
 * Son tres cosas distintas y conviene no confundirlas, porque la tercera no
 * tiene vuelta atrás sin el teléfono delante:
 *
 *  - **conectar**: abre el socket. Si la línea nunca se vinculó, aparece el
 *    código QR; si ya lo estaba, entra directa con las credenciales guardadas.
 *  - **cerrar**: apaga el socket pero deja la vinculación intacta. El
 *    siguiente latido la vuelve a levantar.
 *  - **desvincular**: cierra la sesión en el teléfono y borra las
 *    credenciales. Después hay que escanear un código nuevo.
 */

const AccionSchema = z.object({
  accion: z.enum(["conectar", "cerrar", "desvincular"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const permiso = await exigirPermiso(PERMISOS.WHATSAPP_GESTIONAR);
  if (!permiso.ok) return permiso.respuesta;

  const lineaId = Number(params.id);
  if (!Number.isInteger(lineaId) || lineaId <= 0) {
    return NextResponse.json({ error: "Línea no válida" }, { status: 400 });
  }

  const cuerpo = AccionSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) {
    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  }

  const linea = await prisma.lineaWhatsapp.findUnique({
    where: { id: lineaId },
    select: { id: true, nombre: true },
  });
  if (!linea) {
    return NextResponse.json({ error: "La línea no existe" }, { status: 404 });
  }

  const { accion } = cuerpo.data;

  try {
    if (accion === "conectar") {
      /**
       * No se espera a que termine. Abrir el socket incluye consultar a
       * WhatsApp la versión del protocolo y negociar la conexión; si la
       * petición se quedara esperando, el navegador vería un tiempo de espera
       * agotado justo cuando el QR está a punto de aparecer. El panel
       * consulta el estado cada pocos segundos y lo recoge de ahí.
       */
      void abrirLinea(lineaId).catch((error) =>
        logger.error("[whatsapp] Error abriendo la línea", {
          lineaId,
          error: String(error),
        })
      );
    } else if (accion === "cerrar") {
      await cerrarLinea(lineaId);
    } else {
      await desvincularLinea(lineaId);
    }

    await registrarAuditoria(permiso.quien.usuarioId, `whatsapp_linea_${accion}`, {
      linea_id: lineaId,
      nombre: linea.nombre,
    });

    return NextResponse.json({ data: { accion, linea_id: lineaId } });
  } catch (error) {
    logger.error("[whatsapp] Error en la acción sobre la línea", {
      lineaId,
      accion,
      error: String(error),
    });
    return NextResponse.json({ error: "No se pudo completar la acción." }, { status: 500 });
  }
}
