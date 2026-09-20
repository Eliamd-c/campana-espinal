import prisma from "@/lib/db";
import { generarAnalisis, promptClasificarIntencionVoto } from "@/lib/gemini";
import { elegirDeListaCerrada, pareceInyeccion } from "@/lib/ia/sanitizar";
import { logger } from "@/lib/logger";

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
    // Se registra el intento pero no se bloquea: quien lo haga en serio no
    // usará palabras reconocibles, y perder el perfilado de un mensaje
    // legítimo por un falso positivo sería peor.
    if (pareceInyeccion(texto)) {
      logger.warn("[perfilado] El mensaje parece intentar reescribir el prompt", {
        cedula: contacto_cedula,
      });
    }

    // 1. Llamar a Gemini para clasificar
    const prompt = promptClasificarIntencionVoto(texto);
    const respuesta = await generarAnalisis(prompt);

    // 2. La respuesta solo puede ser uno de los tres valores previstos. Es la
    //    contención final: aunque una inyección tuerza al modelo, lo que se
    //    guarda en la ficha del votante sigue siendo un valor válido o nada.
    const intencion = elegirDeListaCerrada(respuesta, INTENCION_VALIDAS);

    if (!intencion) {
      logger.warn("[perfilado] La IA devolvió algo fuera de la lista prevista", {
        cedula: contacto_cedula,
        longitudRespuesta: respuesta?.length ?? 0,
      });
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

    logger.info("[perfilado] Intención de voto actualizada", { intencion });
    return intencion;
  } catch (error) {
    // Error silencioso: el perfilamiento nunca debe bloquear la operación normal
    logger.error("[perfilado] Error al perfilar", { error: String(error) });
    return null;
  }
}
