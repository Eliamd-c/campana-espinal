import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { verificarSecretoWebhook, esEventoNuevo } from "@/lib/webhooks/verificar";

const apiHost = process.env.EVOLUTION_API_URL;
const apiKey = process.env.EVOLUTION_API_KEY;

export async function POST(req: NextRequest) {
  try {
    // Sin esta comprobacion se pueden inyectar mensajes entrantes falsos y
    // disparar auto-respuestas de IA hacia numeros arbitrarios.
    const verificacion = verificarSecretoWebhook(req, "EVOLUTION_WEBHOOK_SECRET");
    if (!verificacion.ok) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const payload = await req.json();
    logger.info("[webhook] Evento recibido", {
      evento: String(payload.event ?? "").slice(0, 40),
      instancia: String(payload.instance ?? "").slice(0, 40),
    });

    const instanceName = payload.instance;
    if (!instanceName || !instanceName.startsWith("linea_")) {
      return NextResponse.json({ success: true, message: "Ignored instance" });
    }

    const lineaId = parseInt(instanceName.split("_")[1], 10);
    if (isNaN(lineaId)) {
      return NextResponse.json({ success: true, message: "Invalid instance format" });
    }

    // 1. Manejar actualizaciones de conexión
    if (payload.event === "connection.update") {
      const status = payload.data?.status;
      console.log(`[EVOLUTION WEBHOOK] Conexión de ${instanceName} es ahora: ${status}`);

      if (status === "open") {
        let phoneNumber = null;

        // Intentar consultar el número telefónico de la instancia conectada
        if (apiHost && apiKey) {
          try {
            const stateRes = await fetch(`${apiHost}/instance/connectionState/${instanceName}`, {
              headers: { "apikey": apiKey }
            });
            if (stateRes.ok) {
              const stateJson = await stateRes.json();
              // El número telefónico viene con formato @s.whatsapp.net o similar, extraemos los dígitos
              const rawNumber = stateJson.instance?.number || stateJson.instance?.jid;
              if (rawNumber) {
                phoneNumber = rawNumber.split("@")[0].split(":")[0];
              }
            }
          } catch (e) {
            logger.warn("[webhook] No se pudo consultar el número de la línea", {
              instancia: instanceName,
            });
          }
        }

        await prisma.lineaWhatsapp.update({
          where: { id: lineaId },
          data: {
            estado: "conectado",
            qr_actual: null,
            ultima_conexion: new Date(),
            ...(phoneNumber ? { numero_telefono: phoneNumber } : {})
          }
        });
      } else if (status === "close") {
        await prisma.lineaWhatsapp.update({
          where: { id: lineaId },
          data: { estado: "desconectado", qr_actual: null }
        });
      } else if (status === "connecting") {
        await prisma.lineaWhatsapp.update({
          where: { id: lineaId },
          data: { estado: "conectando" }
        });
      } else if (status === "qr" && payload.data?.qr) {
        // En Evolution API, a veces el QR viene en la propiedad 'qr' o 'code' del webhook
        const qrCode = payload.data.qr;
        await prisma.lineaWhatsapp.update({
          where: { id: lineaId },
          data: { estado: "qr_listo", qr_actual: qrCode }
        });
      }
    }

    // 2. Manejar mensajes entrantes (Auto-respuestas IA)
    if (payload.event === "messages.upsert") {
      const data = payload.data;
      const key = data?.key;

      /**
       * El id del mensaje lo asigna WhatsApp y es único. Si el mismo evento
       * llega dos veces -- por un reenvío del proveedor o por alguien que
       * repite una petición capturada -- se descarta: si no, se duplican los
       * mensajes en la base y se vuelve a disparar la respuesta automática.
       */
      if (!esEventoNuevo(key?.id)) {
        return NextResponse.json({ success: true, message: "Evento repetido" });
      }
      const message = data?.message;

      // Ignorar si el mensaje fue enviado por nosotros mismos
      if (key?.fromMe === true || !message) {
        return NextResponse.json({ success: true });
      }

      const remoteJid = key.remoteJid;
      if (!remoteJid) return NextResponse.json({ success: true });

      // Extraer el texto del mensaje
      const text = message.conversation || message.extendedTextMessage?.text;
      const isAudio = message.audioMessage || message.documentMessage?.mimetype?.includes("audio");

      if (text && apiHost && apiKey) {
        // Ni el número ni el contenido del mensaje van al registro: son
        // datos personales de un votante, y los logs se copian, se rotan y
        // acaban en sitios que nadie audita.
        logger.info("[webhook] Mensaje de texto recibido", {
          linea: lineaId,
          longitud: text.length,
        });
        
        try {
          const origin = req.nextUrl.origin;
          // La llamada es servidor-a-servidor y no lleva sesión de usuario:
          // se autentica con el secreto interno, igual que los webhooks.
          const procesarRes = await fetch(`${origin}/api/whatsapp/procesar-mensaje`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": process.env.INTERNAL_WEBHOOK_SECRET ?? "",
            },
            body: JSON.stringify({
              audioBase64: null,
              texto: text,
              mimeType: null,
              sender: remoteJid,
              lineaId: lineaId
            })
          });

          if (procesarRes.ok) {
            const procesarJson = await procesarRes.json();
            if (procesarJson.success && procesarJson.mensaje) {
              logger.info("[webhook] Enviando auto-respuesta de IA", { linea: lineaId });
              
              // Responder usando Evolution API
              await fetch(`${apiHost}/message/sendText/${instanceName}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "apikey": apiKey },
                body: JSON.stringify({
                  number: remoteJid,
                  options: {
                    delay: 1000,
                    presence: "composing"
                  },
                  textMessage: {
                    text: procesarJson.mensaje
                  }
                })
              });
            }
          }
        } catch (e) {
          console.error(`[EVOLUTION WEBHOOK] Error procesando auto-respuesta IA:`, e);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`[EVOLUTION WEBHOOK] Error fatal:`, error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
