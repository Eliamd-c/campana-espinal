import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { audioBase64, texto, mimeType, sender, lineaId } = await req.json();
    
    if (!audioBase64 && !texto) {
      return NextResponse.json({ error: "No se proporcionó contenido" }, { status: 400 });
    }

    let numero = sender.split('@')[0];
    // Eliminar el código de país (57 para Colombia) si está presente para poder buscar en la DB
    if (numero.startsWith('57') && numero.length === 12) {
      numero = numero.substring(2);
    }
    const sesionId = `wa_${numero}`;

    // Buscar quién nos escribe
    const lider = await prisma.lider.findFirst({ where: { telefono: { contains: numero } } });
    const contacto = await prisma.contacto.findFirst({ where: { telefono: { contains: numero } } });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // --- LÓGICA SI ES UN LÍDER (Planificación de Eventos) ---
    if (lider && !contacto) {
      // (Mantenemos la lógica de eventos para líderes)
      const ahora = new Date();
      model.systemInstruction = `Eres el Coordinador Logístico Oficial. Rol: Agendar eventos a partir de notas de voz.
RESPONDE SÓLO EN JSON.
Formato:
{"accion": "crear", "evento": {"titulo": "...", "tipo": "mitin", "lugar": "...", "fecha_inicio": "2026-05-22T10:00:00Z", "fecha_fin": "...", "notas": "...", "asistentes_esperados": 50}}
O {"accion": "preguntar", "mensaje": "..."}`;

      const payloadContent: any[] = [
        `Historial:\n(Mensaje actual de líder: ${texto || '[Audio]'})`,
        "INSTRUCCIÓN: Analiza si tienes Lugar, Fecha y Tipo. Si sí, accion: crear. Si no, accion: preguntar."
      ];
      if (audioBase64) payloadContent.push({ inlineData: { data: audioBase64, mimeType: mimeType || "audio/ogg" } });

      const result = await model.generateContent(payloadContent);
      const datos = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());

      let mensajeRespuesta = datos.mensaje || "Evento procesado.";
      if (datos.accion === "crear") {
         await prisma.evento.create({
            data: {
              titulo: datos.evento.titulo, tipo: datos.evento.tipo, estado: "pendiente_aprobacion",
              fecha_inicio: new Date(datos.evento.fecha_inicio), fecha_fin: new Date(datos.evento.fecha_fin),
              lugar: datos.evento.lugar, asistentes_esperados: datos.evento.asistentes_esperados || 50,
              creado_por: "Bot WhatsApp", lider_id: lider.id
            }
         });
         mensajeRespuesta = `Evento agendado exitosamente: ${datos.evento.titulo}`;
      }
      return NextResponse.json({ success: true, mensaje: mensajeRespuesta });
    }

    // --- LÓGICA SI ES UN CONTACTO / VOTANTE (Procesamiento Inbound IA) ---
    model.systemInstruction = `Eres un asistente inteligente para la "Campaña Espinal". 
Un ciudadano te ha respondido un mensaje de WhatsApp.
Tu tarea es:
1. Analizar su sentimiento e intención política.
2. Extraer un 'concepto_ia' breve (resumen de lo que dijo o su queja).
3. Redactar una respuesta amable, empática y política. Si pregunta algo, responde basándote en que somos una campaña transparente. Si está enojado, pide disculpas y toma nota.

RESPONDE ESTRICTAMENTE EN JSON:
{
  "intencion": "positivo" | "negativo" | "indeciso" | "desconocido",
  "sentimiento": "alegre" | "enojado" | "neutral" | "preocupado",
  "requiere_accion": boolean,
  "concepto": "Breve resumen de 1-2 líneas de lo que dijo el ciudadano.",
  "respuesta_sugerida": "El mensaje de texto que se le debe enviar de vuelta al ciudadano por WhatsApp."
}`;

    const payloadContent: any[] = [
        `Ciudadano ${contacto ? contacto.nombre : numero} escribió:\n"${texto || '[Mensaje de Audio]'}"`
    ];
    if (audioBase64) payloadContent.push({ inlineData: { data: audioBase64, mimeType: mimeType || "audio/ogg" } });

    const result = await model.generateContent(payloadContent);
    const datos = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());

    // Guardar el análisis en la base de datos
    if (contacto) {
        await prisma.contacto.update({
            where: { cedula: contacto.cedula },
            data: {
                intencion_voto: datos.intencion !== "desconocido" ? datos.intencion : undefined,
                concepto_ia: datos.concepto
            }
        });

        // Registrar el mensaje entrante en la tabla de mensajes
        await prisma.mensaje.create({
            data: {
                contacto_cedula: contacto.cedula,
                texto: texto || '[Audio procesado por IA]',
                direccion: 'recibido',
                estado: 'procesado',
                sentimiento: datos.sentimiento,
                es_respuesta: true,
                requiere_accion: datos.requiere_accion || false,
                linea_id: lineaId
            }
        });
    }

    return NextResponse.json({ success: true, mensaje: datos.respuesta_sugerida });

  } catch (error: any) {
    logger.error("Error en procesar-mensaje inbound:", error);
    return NextResponse.json({ success: false, mensaje: "Lo siento, tuve un problema procesando tu mensaje." }, { status: 500 });
  }
}
