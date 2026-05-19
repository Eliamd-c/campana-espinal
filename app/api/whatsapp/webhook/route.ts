import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { perfilarIntencionVoto } from "@/lib/whatsapp/profiler";
import { handleError, unauthorized } from "@/lib/api/errors";
import { logger } from "@/lib/logger";

// POST /api/whatsapp/webhook
export async function POST(req: NextRequest) {
  try {
    // 🔐 Protección con secreto interno
    const secret = req.headers.get("x-internal-secret");
    if (secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
      logger.warn("Intento de acceso no autorizado a Webhook", { 
        ip: req.ip,
        userAgent: req.headers.get("user-agent")
      });
      throw unauthorized("Secreto de webhook inválido");
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
      perfilarIntencionVoto(contacto.cedula, texto).catch(err =>
        logger.error("Error en perfilamiento automático", { cedula: contacto.cedula, error: err })
      );
    }

    logger.info("Mensaje recibido vía Webhook", { 
      instancia: instancia_id, 
      numero, 
      contacto_encontrado: !!contacto 
    });

    return NextResponse.json({ ok: true, mensaje_id: mensajeDb.id });
  } catch (error) {
    return handleError(error, "POST /api/whatsapp/webhook");
  }
}
