import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { encolarMensajesMasivos } from "@/lib/whatsapp/queue";
import { handleError, rateLimit } from "@/lib/api/errors";
import { checkRateLimit, rateLimiters } from "@/lib/ratelimit";
import { schemaEnviarCampana } from "@/lib/validation";
import fs from "fs";

function logDebug(msg: string) {
  console.log(msg);
  try {
    fs.appendFileSync('debug.log', new Date().toISOString() + ' ' + msg + '\n');
  } catch(e) {}
}

export async function POST(req: NextRequest) {
  try {
    logDebug("[API] Iniciando POST /api/mensajes/enviar");
    const ip = req.ip || "unknown";
    logDebug("[API] checkRateLimit...");
    const { success, remaining } = await checkRateLimit(rateLimiters.sendMessage, ip);
    logDebug("[API] checkRateLimit done, success:", success);
    if (!success) {
      return NextResponse.json({ error: "Demasiadas solicitudes de envío" }, { status: 429 });
    }

    const body = await req.json();
    logDebug("[API] Body parsed, validating schema...");
    const parsed = schemaEnviarCampana.safeParse(body);
    logDebug("[API] Schema validation done, success:", parsed.success);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { cedulas, texto, nombre_campana, mediaUrl, pollOptions, lineaId, delayMin, delayMax, manuales } = parsed.data;

    logDebug("[API] Validating lineasActivas...");
    // Validar que existe al menos 1 línea activa
    const lineasActivas = await prisma.lineaWhatsapp.findMany({
      where: { estado: "conectado" }
    });
    logDebug("[API] lineasActivas count:", lineasActivas.length);
    
    if (lineasActivas.length === 0) {
      return NextResponse.json(
        { error: "No hay líneas de WhatsApp conectadas" },
        { status: 400 }
      );
    }

    let campanaId = null;
    if (nombre_campana) {
      logDebug("[API] Creating campana...");
      const campana = await prisma.campana.create({
        data: {
          nombre: nombre_campana,
          texto_base: texto,
          estado: "enviando",
        }
      });
      campanaId = campana.id;
      logDebug("[API] Campana created:", campanaId);
    }

    logDebug("[API] Fetching DB contactos...");    const contactos = await prisma.contacto.findMany({
      where: { cedula: { in: cedulas } },
      select: { cedula: true, nombre: true, telefono: true },
    });

    const todosLosContactos = [...contactos];
    if (manuales && manuales.length > 0) {
      manuales.forEach((m) => {
        todosLosContactos.push({
          cedula: null as any,
          nombre: m.nombre || "Amigo",
          telefono: m.telefono
        });
      });
    }

    const mensajesDB = [];

    logDebug("[API] Iterating contactos, length:", todosLosContactos.length);
    for (const contacto of todosLosContactos) {
      if (!contacto.telefono) continue;

      const nombrePila = contacto.nombre ? contacto.nombre.split(" ")[0] : "amigo(a)";
      const textoPersonalizado = texto.replace(/{{nombre}}/g, nombrePila);

      const mensajeDb = await prisma.mensaje.create({
        data: {
          contacto_cedula: contacto.cedula,
          campana_id: campanaId,
          texto: textoPersonalizado,
          direccion: "enviado",
          estado: "pendiente",
        },
      });
      mensajesDB.push({ ...mensajeDb, contacto });
    }

    logDebug("[API] Messages to queue:", mensajesDB.length);
    if (mensajesDB.length > 0) {
      logDebug("[API] Calling encolarMensajesMasivos...");
      await encolarMensajesMasivos(mensajesDB, mediaUrl, pollOptions, {
        lineaId,
        delayMin,
        delayMax
      });
      console.log("[API] encolarMensajesMasivos done!");
    }

    console.log("[API] Returning success");
    return NextResponse.json({
      message: `Se encolaron ${mensajesDB.length} mensajes exitosamente.`,
      campanaId,
    });
  } catch (error: any) {
    console.error("[API] Caught Error!", error);
    return handleError(error, "POST /api/mensajes/enviar");
    return handleError(error, "POST /api/mensajes/enviar");
  }
}
