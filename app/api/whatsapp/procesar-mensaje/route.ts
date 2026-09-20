import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { verificarSecretoWebhook } from "@/lib/webhooks/verificar";
import {
  envolverNoConfiable,
  AVISO_CONTENIDO_EXTERNO,
  elegirDeListaCerrada,
  pareceInyeccion,
} from "@/lib/ia/sanitizar";

export async function POST(req: NextRequest) {
  try {
    /**
     * Ruta interna: la llama el webhook de Evolution, no un navegador con
     * sesión. Se autentica con el secreto compartido, como los demás
     * webhooks; el middleware la deja pasar por eso mismo.
     */
    const verificacion = verificarSecretoWebhook(req, "INTERNAL_WEBHOOK_SECRET");
    if (!verificacion.ok) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

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
      model.systemInstruction = { role: "system", parts: [{ text: `Eres el Coordinador Logístico Oficial. Rol: Agendar eventos a partir de notas de voz.
RESPONDE SÓLO EN JSON.
Formato:
{"accion": "crear", "evento": {"titulo": "...", "tipo": "mitin", "lugar": "...", "fecha_inicio": "2026-05-22T10:00:00Z", "fecha_fin": "...", "notas": "...", "asistentes_esperados": 50}}
O {"accion": "preguntar", "mensaje": "..."}` }] };

      // El mensaje llega por WhatsApp y con él el modelo crea eventos en la
      // base: va delimitado, no interpolado.
      const payloadContent: any[] = [
        "Mensaje recibido de un líder de campaña:\n\n" +
          envolverNoConfiable(texto || "[Audio]", {
            descripcion: "mensaje-del-lider",
            maximo: 2000,
          }),
        "INSTRUCCIÓN: Analiza si tienes Lugar, Fecha y Tipo. Si sí, accion: crear. Si no, accion: preguntar.",
        AVISO_CONTENIDO_EXTERNO,
      ];
      if (audioBase64) payloadContent.push({ inlineData: { data: audioBase64, mimeType: mimeType || "audio/ogg" } });

      const result = await model.generateContent(payloadContent);

      let datos: any;
      try {
        datos = JSON.parse(
          result.response.text().replace(/```json/g, "").replace(/```/g, "").trim()
        );
      } catch {
        logger.warn("[procesar-mensaje] La IA no devolvió JSON válido para el líder");
        return NextResponse.json({ success: false, mensaje: null });
      }

      let mensajeRespuesta = String(datos.mensaje ?? "Evento procesado.").slice(0, 1000);

      if (datos.accion === "crear") {
         /**
          * Esto crea un registro en la agenda a partir de un mensaje de
          * WhatsApp, así que se valida antes de escribir: fechas que existan,
          * textos acotados al ancho de sus columnas y un tipo de la lista
          * prevista. Sin esto, una fecha inválida se guardaba como
          * `Invalid Date` y el resto entraba con la longitud que viniera.
          */
         const evento = datos.evento ?? {};
         const inicio = new Date(evento.fecha_inicio);
         const fin = new Date(evento.fecha_fin);

         if (isNaN(inicio.getTime()) || isNaN(fin.getTime()) || fin < inicio) {
           return NextResponse.json({
             success: true,
             mensaje: "No entendí bien las fechas del evento. ¿Me las repites?",
           });
         }

         const TIPOS = ["mitin", "casa_a_casa", "foro", "recorrido",
                        "reunion_barrial", "reunion_lideres", "fecha_critica"];
         const tipo = TIPOS.includes(String(evento.tipo)) ? String(evento.tipo) : "reunion_barrial";

         const titulo = String(evento.titulo ?? "").trim().slice(0, 200) || "Evento sin título";
         const lugar = String(evento.lugar ?? "").trim().slice(0, 200) || "Por confirmar";
         const asistentes = Number(evento.asistentes_esperados);

         await prisma.evento.create({
            data: {
              titulo, tipo, estado: "pendiente_aprobacion",
              fecha_inicio: inicio, fecha_fin: fin,
              lugar,
              asistentes_esperados: Number.isFinite(asistentes)
                ? Math.min(Math.max(Math.trunc(asistentes), 0), 100000)
                : 50,
              creado_por: "Bot WhatsApp", lider_id: lider.id
            }
         });
         mensajeRespuesta = `Evento agendado exitosamente: ${titulo}`;
      }
      return NextResponse.json({ success: true, mensaje: mensajeRespuesta });
    }

    // --- LÓGICA SI ES UN CONTACTO / VOTANTE (Procesamiento Inbound IA) ---
    model.systemInstruction = { role: "system", parts: [{ text: `Eres un asistente inteligente para la "Campaña Espinal". 
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
}` }] };

    if (texto && pareceInyeccion(texto)) {
      logger.warn("[procesar-mensaje] El mensaje entrante parece intentar reescribir el prompt");
    }

    /**
     * El texto lo escribe un ciudadano cualquiera y la respuesta que salga de
     * aquí se le envía de vuelta en nombre de la campaña. También el nombre
     * del contacto va delimitado: sale de la base, pero pudo entrar por OCR
     * de una planilla o por importación masiva.
     */
    const payloadContent: any[] = [
        "Mensaje recibido de un ciudadano.\n\n" +
          envolverNoConfiable(texto || "[Mensaje de Audio]", {
            descripcion: "mensaje-del-ciudadano",
            maximo: 2000,
          }) +
          "\n\nNombre registrado de quien escribe:\n" +
          envolverNoConfiable(contacto ? contacto.nombre : numero, {
            descripcion: "nombre-registrado",
            maximo: 120,
          }) +
          "\n\n" +
          AVISO_CONTENIDO_EXTERNO
    ];
    if (audioBase64) payloadContent.push({ inlineData: { data: audioBase64, mimeType: mimeType || "audio/ogg" } });

    const result = await model.generateContent(payloadContent);

    // Si el modelo devuelve algo que no es JSON -- cosa que una inyeccion
    // puede provocar -- antes reventaba con un 500 sin explicacion.
    let datos: any;
    try {
      datos = JSON.parse(
        result.response.text().replace(/```json/g, "").replace(/```/g, "").trim()
      );
    } catch {
      logger.warn("[procesar-mensaje] La IA no devolvio JSON valido; se descarta");
      return NextResponse.json({ success: false, mensaje: null });
    }

    // Contencion final: lo que se guarda y lo que se envia pasa por un filtro,
    // pase lo que pase con el modelo.
    const INTENCIONES = ["positivo", "negativo", "indeciso", "desconocido"] as const;
    const intencionValidada = elegirDeListaCerrada(String(datos.intencion ?? ""), INTENCIONES);
    const conceptoValidado = String(datos.concepto ?? "").slice(0, 500) || null;
    const respuestaValidada = String(datos.respuesta_sugerida ?? "").slice(0, 1000) || null;

    // Guardar el análisis en la base de datos
    if (contacto) {
        await prisma.contacto.update({
            where: { cedula: contacto.cedula },
            data: {
                intencion_voto:
                  intencionValidada && intencionValidada !== "desconocido"
                    ? intencionValidada
                    : undefined,
                concepto_ia: conceptoValidado
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

    // Se devuelve la version acotada: es lo que acaba enviandose al
    // ciudadano por WhatsApp en nombre de la campana.
    return NextResponse.json({ success: true, mensaje: respuestaValidada });

  } catch (error: any) {
    logger.error("Error en procesar-mensaje inbound:", error);
    return NextResponse.json({ success: false, mensaje: "Lo siento, tuve un problema procesando tu mensaje." }, { status: 500 });
  }
}
