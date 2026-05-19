import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { whatsappQueue } from "@/lib/whatsapp/queue";
import { EnviarMensajeSchema } from "@/lib/validation";
import { handleError, rateLimit } from "@/lib/api/errors";
import { checkRateLimit, rateLimiters } from "@/lib/ratelimit";

// POST /api/mensajes/enviar
export async function POST(req: NextRequest) {
  try {
    // ✅ 1. Rate Limiting
    const ip = req.ip || "unknown";
    const { success, remaining } = await checkRateLimit(rateLimiters.sendMessage, ip);
    if (!success) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes de envío" },
        { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
      );
    }

    // ✅ 2. Validación de Entrada
    const body = await req.json();
    const parsed = EnviarMensajeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos de envío inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { instancia_id, cedulas, texto: texto_template, nombre_campana } = parsed.data;

    let campanaId = null;
    if (nombre_campana) {
      const campana = await prisma.campana.create({
        data: {
          nombre: nombre_campana,
          texto_base: texto_template,
          estado: "enviando",
        }
      });
      campanaId = campana.id;
    }

    const contactos = await prisma.contacto.findMany({
      where: { cedula: { in: cedulas } },
      select: { cedula: true, nombre: true, telefono: true },
    });

    const jobs = [];

    for (const contacto of contactos) {
      if (!contacto.telefono) continue;

      // Personalización básica (Ej: Hola {{nombre}})
      const nombrePila = contacto.nombre ? contacto.nombre.split(" ")[0] : "amigo(a)";
      const textoPersonalizado = texto_template.replace(/{{nombre}}/g, nombrePila);

      // Guardar en base de datos como "pendiente"
      const mensajeDb = await prisma.mensaje.create({
        data: {
          contacto_cedula: contacto.cedula,
          campana_id: campanaId,
          texto: textoPersonalizado,
          instancia_zona: instancia_id,
          direccion: "enviado",
          estado: "pendiente",
        },
      });

      // Añadir a la cola de BullMQ
      jobs.push({
        name: `msg-${mensajeDb.id}`,
        data: {
          instancia_id,
          contacto_cedula: contacto.cedula,
          numero: contacto.telefono,
          texto: textoPersonalizado,
          mensaje_db_id: mensajeDb.id,
        },
      });
    }

    if (jobs.length > 0) {
      await whatsappQueue.addBulk(jobs);
    }

    return NextResponse.json({
      message: `Se encolaron ${jobs.length} mensajes exitosamente.`,
      campanaId,
    });
  } catch (error) {
    return handleError(error, "POST /api/mensajes/enviar");
  }
}
