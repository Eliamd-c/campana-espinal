import prisma from "@/lib/db";
import { generarAnalisis, promptClasificarIntencionVoto } from "@/lib/gemini";

const INTENCION_VALIDAS = ["positivo", "negativo", "indeciso"] as const;
type IntencionVoto = typeof INTENCION_VALIDAS[number];

/**
 * Analiza un mensaje de WhatsApp recibido e inyecta silenciosamente la
 * intención de voto al perfil del contacto si se puede determinar.
 * 
 * @param contacto_cedula - Cédula del contacto que envió el mensaje
 * @param texto - Texto del mensaje recibido
 */
export async function perfilarIntencionVoto(
  contacto_cedula: string,
  texto: string
): Promise<IntencionVoto | null> {
  if (!texto || texto.trim().length < 5) {
    // Mensaje muy corto, no hay suficiente señal para analizar
    return null;
  }

  try {
    // 1. Llamar a Gemini para clasificar
    const prompt = promptClasificarIntencionVoto(texto);
    const respuesta = await generarAnalisis(prompt);
    
    // 2. Limpiar y validar la respuesta de la IA
    const intencionRaw = respuesta.trim().toLowerCase().replace(/[^a-z]/g, "");
    const intencion = INTENCION_VALIDAS.find(v => intencionRaw.startsWith(v)) || null;

    if (!intencion) {
      console.warn(`[Perfilamiento] IA devolvió respuesta inesperada: "${respuesta}"`);
      return null;
    }

    // 3. Actualizar silenciosamente el perfil del contacto
    await prisma.contacto.update({
      where: { cedula: contacto_cedula },
      data: {
        intencion_voto: intencion,
        ultima_encuesta: new Date(),
      },
    });

    console.log(`[Perfilamiento] Contacto ${contacto_cedula} → ${intencion}`);
    return intencion;
  } catch (error) {
    // Error silencioso: el perfilamiento nunca debe bloquear la operación normal
    console.error(`[Perfilamiento] Error al perfilar contacto ${contacto_cedula}:`, error);
    return null;
  }
}
