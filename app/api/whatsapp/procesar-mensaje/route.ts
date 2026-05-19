import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { audioBase64, texto, mimeType, sender } = await req.json();
    
    if (!audioBase64 && !texto) {
      return NextResponse.json({ error: "No se proporcionó contenido" }, { status: 400 });
    }

    const sesionId = `wa_${sender}`;
    const ahora = new Date();
    const fechaActual = ahora.toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Bogota" });
    const horaActual = ahora.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      systemInstruction: `Eres el Coordinador Logístico Oficial de la "Campaña Espinal".

CONTEXTO TEMPORAL EXACTO (usa esto siempre para calcular fechas):
- Fecha de hoy: ${fechaActual}
- Hora actual: ${horaActual} (Hora Colombia, GMT-5)
- Si alguien dice "este viernes", "mañana", "la próxima semana", CALCULA la fecha real basándote en el contexto anterior.
- Usa SIEMPRE el año correcto (${ahora.getFullYear()}) en las fechas ISO que generes.
Tu objetivo es planificar eventos de forma ESTRICTA a partir de notas de voz y textos, asegurando que no se cometan errores ni queden cabos sueltos. Tienes memoria de la conversación actual.

REGLAS DE INTELIGENCIA (¡MUY IMPORTANTES!):
1. Para crear un evento necesitas OBLIGATORIAMENTE 5 cosas:
   - Fecha y Hora exacta.
   - Dirección ESPECÍFICA (No sirve solo el barrio como "Caballero y Góngora". Debes exigir una dirección, manzana, o punto de referencia como "Polideportivo", "Casa de Juan").
   - Tipo de evento (mitin, casa_a_casa, etc).
   - Líder organizador (¿Quién está a cargo de este evento?).
   - Requerimientos logísticos (Si el usuario no menciona sillas, refrigerios, o sonido, DEBES preguntarle proactivamente: "¿Necesitas que te enviemos sillas, sonido o refrigerios?").

2. Revisa el "HISTORIAL RECIENTE". Si falta UNO SOLO de los 5 puntos anteriores, NO CREES EL EVENTO.
3. Si falta información, usa "accion: preguntar". Sé amable pero firme en pedir el dato exacto que falta.
4. Si el usuario te hace una pregunta, te da una simple confirmación (ej. "ok", "aprobada", "gracias") o te pide hacer algo con un evento que YA creaste en el turno anterior, usa "accion: responder". NO VUELVAS A CREAR el evento si en tu mensaje anterior ya dijiste "¡Listo! He agendado...".

RESPONDE ÚNICAMENTE CON UN JSON ESTRICTO CON ESTE FORMATO:

Opción A (Falta información vital o pedir detalles):
{
  "accion": "preguntar",
  "mensaje": "Tu pregunta amigable pidiendo la dirección exacta, el responsable, o si necesita logística."
}

Opción B (Responder consulta o confirmación simple):
{
  "accion": "responder",
  "mensaje": "Respuesta directa a lo que el usuario preguntó o confirmó."
}

Opción C (Todo está COMPLETO, CONFIRMADO y NO SE HA CREADO AÚN):
{
  "accion": "crear",
  "evento": {
    "titulo": "Título corto",
    "tipo": "mitin" | "casa_a_casa" | "reunion_lideres" | "recorrido" | "foro" | "reunion_barrial",
    "lugar": "Dirección exacta y barrio",
    "asistentes_esperados": 50,
    "fecha_inicio": "Fecha de inicio en formato ISO (ASUME SIEMPRE EL AÑO 2026)",
    "fecha_fin": "Fecha fin en formato ISO (ASUME SIEMPRE EL AÑO 2026)",
    "notas": "Mencionar al organizador responsable y detalles",
    "checklist_solicitado": [
      { "item": "Sillas", "cantidad_default": 50, "categoria": "Mobiliario", "obtenido": false }
    ]
  }
}`
    });

    // 1. Obtener historial (Últimos 8 mensajes recientes)
    let history = await prisma.chatMemoria.findMany({
      where: { sesion_id: sesionId },
      orderBy: { timestamp: "desc" },
      take: 8 // Tomar los más recientes
    });
    
    // Invertir para que Gemini los lea en orden cronológico correcto (del más viejo al más nuevo)
    history = history.reverse();

    let contextoHistorial = "HISTORIAL RECIENTE DE LA CONVERSACIÓN:\n";
    if (history.length === 0) {
      contextoHistorial += "(No hay mensajes previos. Inicia la conversación.)\n";
    } else {
      history.forEach(h => {
         contextoHistorial += `[${h.rol === 'user' ? 'Líder' : 'Tú'}]: ${h.contenido}\n`;
      });
    }

    // 2. Preparar el payload
    const payloadContent: any[] = [
       contextoHistorial,
       "\nINSTRUCCIÓN: Analiza el historial junto con el nuevo mensaje. Si falta un dato vital (Lugar, Fecha, Tipo), haz 'accion: preguntar'. Si tienes todo, haz 'accion: crear'."
    ];

    if (audioBase64) {
       payloadContent.push({ inlineData: { data: audioBase64, mimeType: mimeType || "audio/ogg" } });
    } else if (texto) {
       payloadContent.push(`\nMENSAJE ACTUAL DEL LÍDER: "${texto}"`);
    }

    const result = await model.generateContent(payloadContent);
    let textoRespuesta = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const datos = JSON.parse(textoRespuesta);

    // 3. Guardar el input del usuario en memoria
    await prisma.chatMemoria.create({
      data: {
        sesion_id: sesionId,
        rol: "user",
        contenido: texto ? texto : "[Nota de voz enviada]",
        tipo: "whatsapp"
      }
    });

    let mensajeRespuesta = "";

    // 4. Evaluar la decisión
    if (datos.accion === "preguntar" || datos.accion === "responder") {
      mensajeRespuesta = datos.mensaje;
    } else if (datos.accion === "crear") {
      const evt = datos.evento;
      const plantilla = await prisma.checklistPlantilla.findFirst({ where: { tipo_evento: evt.tipo, activa: true } });
      let checklistFinal = plantilla && Array.isArray(plantilla.items) ? (plantilla.items as any[]) : [];
      if (evt.checklist_solicitado && Array.isArray(evt.checklist_solicitado)) {
        checklistFinal = [...checklistFinal, ...evt.checklist_solicitado];
      }

      const nuevoEvento = await prisma.evento.create({
        data: {
          titulo: evt.titulo, tipo: evt.tipo, estado: "pendiente_aprobacion",
          fecha_inicio: new Date(evt.fecha_inicio), fecha_fin: new Date(evt.fecha_fin),
          lugar: evt.lugar, barrio: evt.lugar, asistentes_esperados: evt.asistentes_esperados || 50,
          notas: `[Audio/Texto de WhatsApp]: ${evt.notas}`,
          creado_por: "Bot WhatsApp", checklist: checklistFinal, fuente: "whatsapp"
        }
      });

      const itemsListados = evt.checklist_solicitado ? evt.checklist_solicitado.map((i:any) => i.item).join(", ") : "la logística base";
      mensajeRespuesta = `¡Listo! He agendado la "${nuevoEvento.titulo}" para el ${nuevoEvento.fecha_inicio.toLocaleDateString()}. He incluido en tu checklist logístico: *${itemsListados}*. El evento está pendiente de aprobación por el equipo.`;
    } else {
      mensajeRespuesta = "Lo siento, no entendí bien la instrucción. ¿Podrías repetirlo?";
    }

    // 5. Guardar la respuesta del asistente en memoria
    await prisma.chatMemoria.create({
      data: {
        sesion_id: sesionId,
        rol: "assistant",
        contenido: mensajeRespuesta,
        tipo: "whatsapp"
      }
    });

    return NextResponse.json({ success: true, mensaje: mensajeRespuesta });

  } catch (error: any) {
    console.error("Error en procesar-mensaje:", error);
    return NextResponse.json({ success: false, mensaje: "Lo siento, tuve un problema procesando la solicitud." }, { status: 500 });
  }
}
