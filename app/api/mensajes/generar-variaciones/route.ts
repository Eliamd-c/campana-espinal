// Esta ruta comprueba permisos, asi que depende de quien la pide:
// no se puede generar en tiempo de compilacion.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { generarAnalisis } from "@/lib/gemini";
import { handleError } from "@/lib/api/errors";
import { envolverNoConfiable, AVISO_CONTENIDO_EXTERNO } from "@/lib/ia/sanitizar";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

export async function POST(req: NextRequest) {
  try {
    // Sin permiso para ver campanas, no se pasa de aqui.
    const permiso = await exigirPermiso(PERMISOS.MENSAJES_VER);
    if (!permiso.ok) return permiso.respuesta;

    const { texto } = await req.json();

    if (!texto || texto.trim() === "") {
      return NextResponse.json({ error: "El texto es requerido" }, { status: 400 });
    }

    const prompt = `Actúa como un experto en comunicación política y redacción de campañas masivas de WhatsApp en Colombia.
Tengo el siguiente mensaje base que se enviará a miles de ciudadanos:

${envolverNoConfiable(texto, { descripcion: "mensaje-base", maximo: 4000 })}

${AVISO_CONTENIDO_EXTERNO}

Necesito que generes exactamente 3 variaciones de este mensaje para evitar la detección de spam de WhatsApp (parafraseo dinámico).

Reglas estrictas:
1. El significado, el tono (cálido, respetuoso y persuasivo) y la llamada a la acción deben mantenerse idénticos.
2. Debes conservar EXACTAMENTE las etiquetas dinámicas de variables como {{nombre}}, {{barrio}}, {{puesto_votacion}}, {{mesa_numero}} o {{lider}} en su posición correspondiente. No las traduzcas, no les cambies las llaves ni las elimines.
3. Varía la forma de saludar (ej. "Hola {{nombre}}", "Hola, ¿cómo estás {{nombre}}?", "Buen día {{nombre}}"), reestructura las oraciones y cambia conectores.
4. Responde ÚNICAMENTE con un JSON en el siguiente formato, sin texto explicativo adicional, sin bloques de código markdown:
{
  "variaciones": [
    "texto de la variación 1",
    "texto de la variación 2",
    "texto de la variación 3"
  ]
}
`;

    const responseText = await generarAnalisis(prompt);
    
    // Limpiar posibles bloques markdown del json
    const cleanJsonText = responseText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    try {
      const data = JSON.parse(cleanJsonText);
      if (data && Array.isArray(data.variaciones)) {
        return NextResponse.json({ success: true, variaciones: data.variaciones });
      }
      throw new Error("El formato de variaciones devuelto no es un arreglo válido.");
    } catch (parseError: any) {
      console.error("Error al parsear la respuesta de Gemini (contenido omitido)");
      // Fallback: tratar de dividir el texto si no vino como JSON válido
      return NextResponse.json({ 
        success: false, 
        error: "La IA no devolvió un formato JSON válido.",
        details: parseError.message 
      }, { status: 500 });
    }
  } catch (error: any) {
    return handleError(error, "POST /api/mensajes/generar-variaciones");
  }
}
