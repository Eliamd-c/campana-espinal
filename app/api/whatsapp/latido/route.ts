// Abre sockets y consulta la base: nunca se puede generar en el build.
export const dynamic = "force-dynamic";

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { reabrirLineasVinculadas } from "@/lib/whatsapp/conexion";
import { podarAtendidos } from "@/lib/whatsapp/autorizados";
import { podarMemoria } from "@/lib/whatsapp/memoria";

/**
 * Latido: mantiene viva la aplicación y, con ella, las líneas de WhatsApp.
 *
 * El alojamiento compartido apaga la aplicación Node cuando nadie la visita.
 * Una web puede permitírselo —despierta cuando alguien entra—, pero una línea
 * de WhatsApp no: mientras duerme, el socket está cerrado y quien escriba no
 * recibe respuesta hasta que alguien, por casualidad, abra el panel.
 *
 * Por eso un cron del hPanel llama a esta ruta cada pocos minutos. Hace dos
 * cosas: la propia petición impide que el supervisor considere ociosa la
 * aplicación, y de paso reabre las líneas que estén caídas.
 *
 * En el VPS esta ruta seguirá sirviendo, aunque importe menos: allí el
 * proceso no se duerme, y el latido pasa a ser la red de seguridad que
 * levanta una línea que se cayó de madrugada.
 */

/**
 * La ruta no lleva sesión —la llama un cron, no una persona—, así que se
 * protege con un secreto compartido. Sin él sería una URL pública capaz de
 * forzar reconexiones a voluntad, que es una manera cómoda de hacer que
 * WhatsApp bloquee el número de la campaña.
 */
function claveValida(req: NextRequest): boolean {
  const esperado = process.env.WHATSAPP_SECRETO_LATIDO;
  if (!esperado) return false;

  const recibido =
    req.headers.get("x-clave-latido") ||
    req.nextUrl.searchParams.get("clave") ||
    "";

  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);

  // Comparar longitudes primero evita que `timingSafeEqual` lance; comparar
  // el contenido en tiempo constante evita que el secreto se adivine letra a
  // letra midiendo cuánto tarda la respuesta.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!claveValida(req)) {
    // Sin detalles: a quien no trae la clave no se le dice si existe, si es
    // corta o si falta configurarla.
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const lineas = await reabrirLineasVinculadas();

    /**
     * Se aprovecha el paso para podar el registro de mensajes ya atendidos.
     * Pasadas unas horas WhatsApp no reentrega nada, asi que esas filas solo
     * ocupan sitio. Si falla, no se estropea el latido por una limpieza.
     */
    let podados = 0;
    try {
      podados = await podarAtendidos();
      await podarMemoria();
    } catch (error) {
      logger.warn("[whatsapp] No se pudo podar el registro de mensajes", {
        error: String(error),
      });
    }

    return NextResponse.json({
      data: { momento: new Date().toISOString(), lineas, podados },
    });
  } catch (error) {
    logger.error("[whatsapp] Falló el latido", { error: String(error) });
    return NextResponse.json({ error: "Falló el latido" }, { status: 500 });
  }
}
