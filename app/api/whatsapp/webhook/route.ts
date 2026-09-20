import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { perfilarIntencionVoto } from "@/lib/whatsapp/profiler";
import { handleError, unauthorized } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { verificarSecretoWebhook } from "@/lib/webhooks/verificar";

// POST /api/whatsapp/webhook
export async function POST(req: NextRequest) {
  try {
    // Comparacion en tiempo constante: un `!==` sobre cadenas termina en el
    // primer caracter distinto, y esa diferencia de tiempo permite adivinar
    // el secreto caracter a caracter.
    const verificacion = verificarSecretoWebhook(req, "INTERNAL_WEBHOOK_SECRET");
    if (!verificacion.ok) {
      throw unauthorized("Secreto de webhook invalido");
    }

    const body = await req.json();
    const { instancia_id, numero, texto, timestamp } = body;

    if (!instancia_id || !numero || !texto) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    // 1. Buscar el contacto por número de teléfono
    const contacto = await prisma.contacto.findFirst({
      where: { telefono: numero },
    });

    // 2. Guardar el mensaje en la BD
    const mensajeDb = await prisma.mensaje.create({
      data: {
        contacto_cedula: contacto?.cedula ?? null,
        texto,
        instancia_zona: instancia_id,
        direccion: "recibido",
        estado: "recibido",
        fecha: timestamp ? new Date(timestamp * 1000) : new Date(),
      },
    });

    // 3. Si el contacto existe, perfilar intención silenciosamente
    if (contacto) {
      // Fire-and-forget
      perfilarIntencionVoto(contacto.cedula, texto).catch((err) =>
        // Sin la cédula: identificar a la persona en un registro de error no
        // aporta nada para depurar y sí expone un dato sensible.
        logger.error("Error en perfilamiento automático", { error: String(err) })
      );
    }

    logger.info("Mensaje recibido vía Webhook", {
      instancia: instancia_id,
      contacto_encontrado: !!contacto,
      longitud: typeof texto === "string" ? texto.length : 0,
    });

    return NextResponse.json({ ok: true, mensaje_id: mensajeDb.id });
  } catch (error) {
    return handleError(error, "POST /api/whatsapp/webhook");
  }
}
