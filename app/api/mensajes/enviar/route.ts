import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/api/errors";
import { checkRateLimit, rateLimiters } from "@/lib/ratelimit";
import { schemaEnviarCampana } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limiting
    const ip = req.ip || req.headers.get("x-forwarded-for") || "unknown";
    const { success } = await checkRateLimit(rateLimiters.sendMessage, ip);
    if (!success) {
      return NextResponse.json({ error: "Demasiadas solicitudes de envío" }, { status: 429 });
    }

    // 2. Validación del body
    const body = await req.json();
    const parsed = schemaEnviarCampana.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { cedulas, texto, nombre_campana, mediaUrl, pollOptions, lineaId, manuales, variaciones, excluirYaContactados, modoCalentamiento } = parsed.data;

    // 3. Verificar que hay al menos una línea conectada
    const lineasActivas = await prisma.lineaWhatsapp.findMany({
      where: {
        estado: "conectado",
        ...(lineaId ? { id: lineaId } : {}),
      },
    });

    if (lineasActivas.length === 0) {
      return NextResponse.json(
        { error: lineaId ? "La línea seleccionada no está conectada" : "No hay líneas de WhatsApp conectadas" },
        { status: 400 }
      );
    }

    // 4. Crear la campaña en BD
    let campanaId: number | null = null;
    if (nombre_campana) {
      const campana = await prisma.campana.create({
        data: {
          nombre: nombre_campana,
          texto_base: texto,
          estado: "enviando",
        },
      });
      campanaId = campana.id;

      if (variaciones && variaciones.length > 0) {
        await prisma.campanaVariacion.createMany({
          data: variaciones.map(v => ({ campana_id: campana.id, texto: v })),
        });
      }
    }

    // 5. Resolver contactos (BD + manuales)
    const contactosBD = await prisma.contacto.findMany({
      where: { cedula: { in: cedulas } },
      select: {
        cedula: true,
        nombre: true,
        telefono: true,
        barrio: true,
        puesto_votacion: true,
        mesa_numero: true,
        lider: { select: { nombre: true } },
      },
    });

    let todosLosContactos = [...contactosBD];

    if (manuales && manuales.length > 0) {
      for (const m of manuales) {
        const telLimpio = m.telefono.replace(/\D/g, "");
        const cedulaManual = `M-${telLimpio.slice(-10)}`;
        const contactoManual = await prisma.contacto.upsert({
          where: { cedula: cedulaManual },
          update: { nombre: m.nombre || "Amigo", telefono: telLimpio },
          create: {
            cedula: cedulaManual,
            nombre: m.nombre || "Amigo",
            telefono: telLimpio,
            barrio: "Manual",
            puesto_votacion: "Puesto Manual",
            mesa_numero: "Mesa Manual",
          },
          include: { lider: { select: { nombre: true } } },
        });
        todosLosContactos.push(contactoManual);
      }
    }

    // 6a. Si el coordinador eligió "solo sin contactar", filtrar los ya enviados
    if (excluirYaContactados && todosLosContactos.length > 0) {
      const cedulasList = todosLosContactos.map(c => c.cedula);
      const yaEnviados = await prisma.mensaje.findMany({
        where: {
          contacto_cedula: { in: cedulasList },
          estado: { in: ["enviado", "entregado", "leido"] },
        },
        select: { contacto_cedula: true },
        distinct: ["contacto_cedula"],
      });
      const excluir = new Set(yaEnviados.map(m => m.contacto_cedula).filter(Boolean));
      todosLosContactos = todosLosContactos.filter(c => !excluir.has(c.cedula));
    }

    // 6. Personalizar texto y construir mensajes para la BD
    const totalVariaciones = variaciones?.length ?? 0;
    let varIndex = 0;

    const mensajesToCreate = todosLosContactos
      .filter(c => c.telefono)
      .map(c => {
        // Rotar entre variaciones si existen
        const base = totalVariaciones > 0 ? variaciones![varIndex] : texto;
        if (totalVariaciones > 0) varIndex = (varIndex + 1) % totalVariaciones;

        // Sustitución de variables personalizadas
        const nombrePila = c.nombre?.split(" ")[0] ?? "amigo(a)";
        const textoFinal = base
          .replace(/\{\{nombre\}\}/g, nombrePila)
          .replace(/\{\{barrio\}\}/g, c.barrio ?? "su sector")
          .replace(/\{\{puesto_votacion\}\}/g, c.puesto_votacion ?? "su puesto habitual")
          .replace(/\{\{mesa_numero\}\}/g, c.mesa_numero ?? "su mesa")
          .replace(/\{\{lider\}\}/g, c.lider?.nombre ?? "coordinador");

        return {
          contacto_cedula: c.cedula,
          campana_id: campanaId,
          linea_id: null as number | null,   // la cola asigna la línea al encolar
          texto: textoFinal,
          direccion: "enviado",
          estado: "pendiente",
        };
      });

    if (mensajesToCreate.length === 0) {
      return NextResponse.json(
        { error: "Ningún contacto tiene número de teléfono registrado" },
        { status: 400 }
      );
    }

    // 7. Guardar todos los mensajes en BD como "pendiente"
    const creados = await prisma.mensaje.createManyAndReturn({ data: mensajesToCreate });

    // 8. Como el motor-local se encarga, devolvemos éxito directamente
    return NextResponse.json({
      message: `${creados.length} mensajes guardados como pendientes. El Motor Local los enviará automáticamente.`,
      campanaId,
      encolados: creados.length,
      pendientes: 0,
    });

  } catch (error: any) {
    return handleError(error, "POST /api/mensajes/enviar");
  }
}
