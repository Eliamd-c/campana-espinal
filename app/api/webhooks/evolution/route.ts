import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

const apiHost = process.env.EVOLUTION_API_URL;
const apiKey = process.env.EVOLUTION_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    console.log(`[EVOLUTION WEBHOOK] Recibido evento: ${payload.event} para ${payload.instance}`);

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
            console.error(`[EVOLUTION WEBHOOK] Error consultando número de teléfono para ${instanceName}:`, e);
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
        console.log(`[EVOLUTION WEBHOOK] Mensaje de texto de ${remoteJid}: "${text}"`);
        
        try {
          const origin = req.nextUrl.origin;
          const procesarRes = await fetch(`${origin}/api/whatsapp/procesar-mensaje`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
              console.log(`[EVOLUTION WEBHOOK] Enviando auto-respuesta IA a ${remoteJid}...`);
              
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
