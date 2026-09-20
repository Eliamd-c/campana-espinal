// Depende de quien hace la peticion: no se puede generar en el build.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";
import { obtenerConfig } from "@/lib/configuracion";
import { logger } from "@/lib/logger";
import {
  envolverNoConfiable,
  AVISO_CONTENIDO_EXTERNO,
  pareceInyeccion,
  elegirDeListaCerrada,
} from "@/lib/ia/sanitizar";
import prisma from "@/lib/db";

/**
 * Convierte un texto escrito a mano en los datos de un agendamiento.
 *
 * «Reunión el 4 de agosto en el barrio Caballero y Góngora, carrera 12 #
 * 11-18, 6:30 pm. Solicito tarima, sonido, sillas 200, 200 refrigerios.»
 *
 * **No guarda nada.** Devuelve lo que ha entendido para que la persona lo
 * revise y corrija antes de agendar. Un dato inventado que se guarda solo es
 * peor que un hueco vacío: el hueco se ve, el dato inventado no.
 */

/** Tope del texto de entrada. Una solicitud real no se acerca. */
const MAX_TEXTO = 3000;

const EntradaSchema = z.object({
  texto: z.string().min(3, "Escribe la solicitud").max(MAX_TEXTO),
});

/**
 * Forma esperada de la respuesta del modelo. Lo que no encaje se descarta:
 * esto va a un formulario que la persona revisa, no directo a la base, pero
 * aun así no se le pasa al navegador lo que sea que haya contestado.
 */
const SalidaSchema = z.object({
  /** Nombre de una plantilla existente. Se resuelve a un id despues. */
  plantilla: z.string().max(120).default(""),
  titulo: z.string().max(200).default(""),
  fecha: z.string().max(40).default(""),
  hora: z.string().max(10).default(""),
  barrio: z.string().max(80).default(""),
  direccion: z.string().max(200).default(""),
  recursos: z
    .array(
      z.object({
        item: z.string().max(120),
        cantidad: z.coerce.number().int().min(0).max(100000).nullable().default(null),
      })
    )
    .max(40)
    .default([]),
  no_reconocido: z.array(z.string().max(200)).max(20).default([]),
});

function construirPrompt(texto: string, plantillas: string[]): string {
  const hoy = new Date().toISOString().slice(0, 10);

  return `Eres un asistente que convierte solicitudes de agendamiento en datos estructurados para una campaña política en El Espinal, Tolima (Colombia).

Hoy es ${hoy}. Si el texto no indica año, usa el más próximo en el futuro.

Devuelve SOLO un objeto JSON, sin markdown ni explicaciones, con esta forma:
{
  "plantilla": "el nombre EXACTO de una de estas plantillas, o cadena vacía: ${plantillas.join(" | ") || "(no hay ninguna)"}",
  "titulo": "de qué es la reunión o el evento",
  "fecha": "YYYY-MM-DD, o cadena vacía si no se menciona",
  "hora": "HH:mm en 24 horas, o cadena vacía si no se menciona",
  "barrio": "solo el nombre del barrio, o cadena vacía",
  "direccion": "la dirección exacta (carrera, calle, número), o cadena vacía",
  "recursos": [{"item": "sillas", "cantidad": 200}, {"item": "sonido", "cantidad": null}],
  "no_reconocido": ["fragmentos que no encajan en ningún campo"]
}

Reglas:
- Un campo que no aparezca en el texto va como cadena vacía. NO lo inventes:
  es mejor un hueco que la persona rellena que un dato falso que se cuela.
- Barrio y dirección son cosas distintas: "barrio Caballero y Góngora,
  carrera 12 # 11-18" son dos datos, no uno.
- En recursos, "cantidad" es null cuando no se indica número.
- Enumera TODOS los recursos que se piden, uno por uno, aunque vayan seguidos
  sin comas: "tarima decoracion sonido sillas 200" son cuatro recursos. No
  resumas ni agrupes: lo que se omita aquí es material que nadie llevará.
- "plantilla" solo puede ser uno de los nombres de la lista, copiado tal cual.
  Si ninguno encaja con claridad, devuelve cadena vacía: que la persona la
  elija es mejor que aplicarle las reglas equivocadas.

Solicitud recibida:

${envolverNoConfiable(texto, { descripcion: "solicitud-de-agendamiento", maximo: MAX_TEXTO })}

${AVISO_CONTENIDO_EXTERNO}`;
}

/** Quita el markdown con el que algunos modelos envuelven el JSON. */
function limpiarJson(respuesta: string): string {
  return respuesta.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}

export async function POST(req: NextRequest) {
  const permiso = await exigirPermiso(PERMISOS.AGENDA_EDITAR);
  if (!permiso.ok) return permiso.respuesta;

  try {
    const parsed = EntradaSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Texto inválido", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { texto } = parsed.data;

    // Se registra el intento, no se bloquea: quien lo haga en serio no usará
    // palabras reconocibles, y perder una solicitud legítima sería peor.
    if (pareceInyeccion(texto)) {
      logger.warn("[agenda] El texto a interpretar parece intentar reescribir el prompt", {
        usuario: permiso.quien.username,
      });
    }

    const proveedor = (await obtenerConfig("PROVEEDOR_IA")) ?? "gemini";

    /**
     * Las plantillas activas se le ofrecen al modelo como lista cerrada. Sin
     * esto, la interfaz prometía «deja que la IA asigne» y siempre devolvía el
     * selector vacío, aunque la plantilla es obligatoria para guardar.
     */
    const plantillas = await prisma.plantillaAgenda.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });

    const prompt = construirPrompt(texto, plantillas.map((p) => p.nombre));

    let respuestaCruda: string;

    if (proveedor === "openai") {
      const clave = await obtenerConfig("OPENAI_API_KEY");
      if (!clave) {
        return NextResponse.json(
          { error: "Falta configurar la clave de OpenAI.", codigo: "SIN_CLAVE" },
          { status: 503 }
        );
      }

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${clave}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          // Sin esto, el mismo texto daba listas de recursos distintas en
          // cada intento: una vez cinco, la siguiente dos. Un recurso que se
          // pierde en silencio es una tarima que nadie lleva.
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const datos = await res.json();

      if (!res.ok || datos.error) {
        // El detalle se queda en el registro: un error de la API puede
        // incluir fragmentos del prompt o de la clave.
        logger.error("[agenda] Error de OpenAI", { detalle: datos?.error?.message });
        return NextResponse.json(
          { error: "El servicio de IA no respondió correctamente." },
          { status: 502 }
        );
      }

      respuestaCruda = datos.choices?.[0]?.message?.content ?? "";
    } else {
      const clave = await obtenerConfig("GEMINI_API_KEY");
      if (!clave) {
        return NextResponse.json(
          { error: "Falta configurar la clave de Gemini.", codigo: "SIN_CLAVE" },
          { status: 503 }
        );
      }

      const genAI = new GoogleGenerativeAI(clave);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        // Ver el comentario de `temperature` en la rama de OpenAI.
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      });

      const resultado = await model.generateContent(prompt);
      respuestaCruda = resultado.response.text();
    }

    let bruto: unknown;
    try {
      bruto = JSON.parse(limpiarJson(respuestaCruda));
    } catch {
      logger.warn("[agenda] La IA no devolvió JSON válido");
      return NextResponse.json(
        {
          error:
            "No se pudo interpretar el texto. Revisa la redacción o rellena " +
            "los campos a mano.",
        },
        { status: 422 }
      );
    }

    const validada = SalidaSchema.safeParse(bruto);
    if (!validada.success) {
      logger.warn("[agenda] La respuesta de la IA no tiene la forma esperada");
      return NextResponse.json(
        { error: "No se pudo interpretar el texto. Rellena los campos a mano." },
        { status: 422 }
      );
    }

    /**
     * El nombre que devuelve el modelo se resuelve contra la lista real. Lo
     * que no case con exactamente una plantilla se descarta: el selector se
     * queda vacío y lo elige la persona.
     */
    const nombres = plantillas.map((p) => p.nombre);
    const elegida = elegirDeListaCerrada(validada.data.plantilla, nombres);
    const plantilla_id = elegida
      ? (plantillas.find((p) => p.nombre === elegida)?.id ?? "")
      : "";

    logger.info("[agenda] Texto interpretado", {
      proveedor,
      recursos: validada.data.recursos.length,
    });

    return NextResponse.json({
      data: { ...validada.data, plantilla_id },
      // Lo que la persona escribió, para guardarlo junto al agendamiento y
      // poder comparar después con lo que se entendió.
      texto_original: texto,
    });
  } catch (error) {
    logger.error("[agenda] Error interpretando el texto", { error: String(error) });
    return NextResponse.json(
      { error: "No se pudo interpretar el texto." },
      { status: 500 }
    );
  }
}
