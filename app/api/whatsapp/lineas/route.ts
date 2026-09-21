// Depende de quien hace la peticion y del estado vivo: no se puede generar en el build.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { registrarAuditoria } from "@/lib/audit";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";
import { estadoEnMemoria } from "@/lib/whatsapp/conexion";

/**
 * Las líneas de WhatsApp de la campaña.
 *
 * Una línea es un número con su propia sesión. La agenda y las consultas a la
 * base atienden en números distintos a propósito: son conversaciones
 * distintas, con permisos distintos, y si una se cae la otra sigue en pie.
 */

const AltaSchema = z.object({
  nombre: z.string().min(2, "Ponle un nombre").max(80),
});

/**
 * GET: el estado de cada línea.
 *
 * Mezcla lo que hay en la base con lo que sabe el proceso vivo. Hace falta
 * porque la base guarda el último estado anotado, y si la aplicación se
 * reinició —cosa que en el alojamiento compartido pasa a menudo— esa fila
 * puede decir «conectado» cuando ya no hay ningún socket. El campo `viva`
 * dice la verdad del momento.
 */
export async function GET() {
  const permiso = await exigirPermiso(PERMISOS.WHATSAPP_GESTIONAR);
  if (!permiso.ok) return permiso.respuesta;

  try {
    const lineas = await prisma.lineaWhatsapp.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        nombre: true,
        numero_telefono: true,
        agente: true,
        estado: true,
        qr_actual: true,
        ultima_conexion: true,
        _count: { select: { autorizados: true } },
      },
    });

    return NextResponse.json({
      data: lineas.map((linea) => {
        const memoria = estadoEnMemoria(linea.id);
        const { _count, ...resto } = linea;
        return {
          ...resto,
          autorizados: _count.autorizados,
          /**
           * El QR solo se entrega mientras sirve para algo. Es la llave para
           * vincular el número: no tiene por qué estar viajando al navegador
           * en cada consulta de estado.
           */
          qr_actual: linea.estado === "qr_listo" ? linea.qr_actual : null,
          viva: memoria.viva,
          detalle: memoria.detalle,
          requiere_qr: memoria.requiereQr,
          intentos_fallidos: memoria.fallos,
        };
      }),
    });
  } catch (error) {
    logger.error("[whatsapp] Error listando líneas", { error: String(error) });
    return NextResponse.json({ error: "No se pudieron leer las líneas." }, { status: 500 });
  }
}

/** POST: dar de alta una línea. Todavía sin vincular: eso es escanear el QR. */
export async function POST(req: NextRequest) {
  const permiso = await exigirPermiso(PERMISOS.WHATSAPP_GESTIONAR);
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = AltaSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) {
    return NextResponse.json(
      { error: cuerpo.error.issues[0]?.message ?? "Datos no válidos" },
      { status: 400 }
    );
  }

  try {
    const linea = await prisma.lineaWhatsapp.create({
      data: { nombre: cuerpo.data.nombre, estado: "desconectado" },
      select: { id: true, nombre: true, estado: true },
    });

    await registrarAuditoria(permiso.quien.usuarioId, "whatsapp_linea_alta", {
      linea_id: linea.id,
      nombre: linea.nombre,
    });

    return NextResponse.json({ data: linea }, { status: 201 });
  } catch (error) {
    logger.error("[whatsapp] Error creando línea", { error: String(error) });
    return NextResponse.json({ error: "No se pudo crear la línea." }, { status: 500 });
  }
}
