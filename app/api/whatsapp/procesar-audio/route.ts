import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "@/lib/db";

// API que recibe el audio desde el bot de Baileys, lo pasa a Gemini y crea el evento
export async function POST(req: NextRequest) {
  try {
    const { audioBase64, mimeType, sender } = await req.json();

    if (!audioBase64) {
      return NextResponse.json({ error: "No se proporcionó audio" }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      systemInstruction: `Eres el Asistente Logístico Oficial de la "Campaña Espinal". 
Tu objetivo es ayudar a planificar eventos políticos a partir de notas de voz enviadas por líderes.

REGLAS DE INTELIGENCIA:
1. Evalúa si el audio tiene la información MÍNIMA necesaria (Lugar y Fecha/Hora aproximada).
2. Si FALTA información clave (ej. te piden sillas pero no te dicen para qué día ni en dónde), NO crees el evento aún. Haz una pregunta conversacional para pedir el dato faltante.
3. Si TIENES la información clave, extrae los datos y presta MUCHA ATENCIÓN a cualquier requerimiento logístico específico (sillas, refrigerios, tarimas, publicidad, sonido, etc.) y agrégalo al "checklist_solicitado".

RESPONDE ÚNICAMENTE CON UN JSON ESTRICTO CON ESTE FORMATO:

Opción A (Falta información vital):
{
  "accion": "preguntar",
  "mensaje": "Tu pregunta amigable, corta y directa. Ej: '¡Hola! Claro que sí, pero dime ¿Para qué día y a qué hora es la reunión y en qué barrio?'"
}

Opción B (Información completa):
{
  "accion": "crear",
  "evento": {
    "titulo": "Título corto y descriptivo (ej. Reunión en Caballero y Góngora)",
    "tipo": "mitin" | "casa_a_casa" | "reunion_lideres" | "recorrido" | "foro" | "reunion_barrial",
    "lugar": "Lugar o barrio mencionado",
    "asistentes_esperados": 50,
    "fecha_inicio": "Fecha de inicio en formato ISO (asume que estamos en Mayo 2026 si dicen 'este viernes')",
    "fecha_fin": "Fecha fin en formato ISO (2 horas después)",
    "notas": "Resumen de lo que solicitó el líder",
    "checklist_solicitado": [
      { "item": "Sillas", "cantidad_default": 50, "categoria": "Mobiliario", "obtenido": false },
      { "item": "Refrigerios", "cantidad_default": 50, "categoria": "Logística", "obtenido": false }
    ]
  }
}`
    });

    // Enviar el audio a Gemini
    const result = await model.generateContent([
      {
        inlineData: {
          data: audioBase64,
          mimeType: mimeType || "audio/ogg"
        }
      },
      "Procesa este audio logístico y devuelve el JSON correspondiente."
    ]);

    let textoRespuesta = result.response.text();
    textoRespuesta = textoRespuesta.replace(/```json/g, '').replace(/```/g, '').trim();

    const datos = JSON.parse(textoRespuesta);

    // Si la IA decide que falta información, devolvemos la pregunta al usuario.
    if (datos.accion === "preguntar") {
      return NextResponse.json({ 
        success: true, 
        mensaje: datos.mensaje 
      });
    }

    // Si la IA decide crear el evento:
    const evt = datos.evento;

    // 1. Buscar plantilla base para ese tipo de evento
    const plantilla = await prisma.checklistPlantilla.findFirst({
      where: { tipo_evento: evt.tipo, activa: true }
    });

    let checklistFinal = plantilla && Array.isArray(plantilla.items) ? (plantilla.items as any[]) : [];

    // 2. Combinar la plantilla base con lo que el líder pidió explícitamente en el audio
    if (evt.checklist_solicitado && Array.isArray(evt.checklist_solicitado)) {
      checklistFinal = [...checklistFinal, ...evt.checklist_solicitado];
    }

    // 3. Guardar en la base de datos
    const nuevoEvento = await prisma.evento.create({
      data: {
        titulo: evt.titulo,
        tipo: evt.tipo,
        estado: "pendiente_aprobacion",
        fecha_inicio: new Date(evt.fecha_inicio),
        fecha_fin: new Date(evt.fecha_fin),
        lugar: evt.lugar,
        barrio: evt.lugar,
        asistentes_esperados: evt.asistentes_esperados || 50,
        notas: `[Solicitado por ${sender.split('@')[0]}]: ${evt.notas}`,
        creado_por: "Bot WhatsApp",
        checklist: checklistFinal,
        fuente: "whatsapp"
      }
    });

    // Construir un mensaje de respuesta dinámico que confirme lo que se listó
    const itemsListados = evt.checklist_solicitado ? evt.checklist_solicitado.map((i:any) => i.item).join(", ") : "la logística base";

    return NextResponse.json({ 
      success: true, 
      mensaje: `¡Listo! He agendado la "${nuevoEvento.titulo}" para el ${nuevoEvento.fecha_inicio.toLocaleDateString()}. He incluido en tu checklist logístico: *${itemsListados}*. El evento está pendiente de aprobación por el equipo.`,
      evento: nuevoEvento
    });

  } catch (error: any) {
    console.error("Error en procesar-audio:", error);
    return NextResponse.json({ success: false, mensaje: "Lo siento, tuve un problema procesando el audio con Gemini." }, { status: 500 });
  }
}
