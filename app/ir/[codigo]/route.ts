import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Acortador de enlaces que se envían a los votantes por WhatsApp.
 *
 * Es pública por necesidad: la abre cualquiera desde su móvil, sin sesión.
 * Eso obliga a desconfiar de todo lo que llega por la URL y de la propia
 * dirección de destino guardada en la base.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { codigo: string } }
) {
  const { codigo } = params;

  try {
    // El código va en la ruta: se acota antes de consultar.
    if (!codigo || codigo.length > 64) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    const enlace = await prisma.enlaceCorto.findUnique({ where: { codigo } });

    if (!enlace) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    /**
     * Registro del clic. El parámetro `u` lo puede escribir cualquiera que
     * reciba el enlace, así que antes se comprobaba nada: se podían crear
     * filas de rastreo con cédulas inventadas, ensuciando la analítica de la
     * campaña y engordando la tabla sin límite.
     *
     * Ahora debe tener forma de cédula y corresponder a un contacto real. El
     * resultado no cambia la respuesta —siempre se redirige igual—, así que
     * esto no sirve para averiguar qué cédulas existen.
     */
    const cedula = req.nextUrl.searchParams.get("u");

    if (cedula && /^\d{4,12}$/.test(cedula)) {
      try {
        const contacto = await prisma.contacto.findUnique({
          where: { cedula },
          select: { cedula: true },
        });

        if (contacto) {
          await prisma.clicRastreo.create({
            data: { codigo_enlace: codigo, contacto_cedula: contacto.cedula },
          });
        }
      } catch (err) {
        // Un fallo del rastreo nunca debe impedir que la persona llegue a su
        // destino: es una métrica, no el servicio.
        logger.warn("[acortador] No se pudo registrar el clic", {
          error: String(err),
        });
      }
    }

    /**
     * El destino lo escribe quien crea el enlace desde el panel. Se comprueba
     * el esquema antes de redirigir: un `javascript:` o un `data:` guardado
     * ahí convertiría cada enlace enviado a los votantes en un ataque contra
     * quien lo abre.
     */
    let destino: URL;
    try {
      destino = new URL(enlace.url_original);
    } catch {
      logger.warn("[acortador] Enlace con destino mal formado", { codigo });
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (destino.protocol !== "https:" && destino.protocol !== "http:") {
      logger.warn("[acortador] Enlace con esquema no permitido", {
        codigo,
        esquema: destino.protocol,
      });
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.redirect(destino.toString());
  } catch (error) {
    logger.error("[acortador] Error al resolver el enlace", {
      error: String(error),
    });
    return NextResponse.redirect(new URL("/", req.url));
  }
}
