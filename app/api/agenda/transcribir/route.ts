// Depende de quien hace la peticion: no se puede generar en el build.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";
import {
  ErrorTranscripcion,
  MAX_SEGUNDOS_AUDIO,
  transcribirAudio,
} from "@/lib/ia/transcribir";

/**
 * Pasa a texto lo que se acaba de grabar en el panel.
 *
 * Quien lleva la agenda del candidato trabaja de pie y en movimiento: la
 * gente le habla y tiene que capturar al vuelo. Escribir en un teléfono, de
 * pie y con una mano ocupada, es lo que hace que la herramienta se abandone
 * y vuelva la libreta de papel.
 *
 * Solo transcribe. No interpreta ni guarda nada: el texto vuelve a la
 * pantalla para que la persona lo lea y lo corrija antes de que nada toque la
 * agenda. Es la misma regla de siempre — un dato inventado que se guarda solo
 * es peor que un hueco vacío.
 */

/**
 * Tope de subida. Tres minutos de audio comprimido no llegan ni de lejos;
 * lo que pase de aquí es otra cosa, y conviene cortarlo antes de gastarlo en
 * una llamada al modelo.
 */
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const permiso = await exigirPermiso(PERMISOS.AGENDA_EDITAR);
  if (!permiso.ok) return permiso.respuesta;

  let audio: Buffer;
  let tipo: string;
  let segundos: number | undefined;

  try {
    const formulario = await req.formData();
    const archivo = formulario.get("audio");

    if (!(archivo instanceof Blob)) {
      return NextResponse.json({ error: "No llegó ningún audio." }, { status: 400 });
    }

    if (archivo.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "El audio pesa demasiado. Grábalo más corto." },
        { status: 413 }
      );
    }

    audio = Buffer.from(await archivo.arrayBuffer());
    tipo = archivo.type || "audio/webm";

    const dur = Number(formulario.get("segundos"));
    segundos = Number.isFinite(dur) && dur > 0 ? dur : undefined;
  } catch {
    return NextResponse.json({ error: "No se pudo leer el audio." }, { status: 400 });
  }

  try {
    const texto = await transcribirAudio(audio, tipo, segundos);

    logger.info("[agenda] Audio transcrito desde el panel", {
      usuario: permiso.quien.username,
      caracteres: texto.length,
      segundos,
    });

    return NextResponse.json({ data: { texto } });
  } catch (error) {
    if (error instanceof ErrorTranscripcion) {
      /**
       * Los tres motivos se distinguen porque llevan a acciones distintas:
       * grabar más corto, avisar a quien administra, o simplemente reintentar.
       * Un «no se pudo» genérico deja a la persona sin saber qué hacer.
       */
      const mensajes: Record<string, { texto: string; estado: number }> = {
        DEMASIADO_LARGO: {
          texto: `La grabación pasa de ${MAX_SEGUNDOS_AUDIO / 60} minutos. Grábala más corta.`,
          estado: 413,
        },
        SIN_CLAVE: {
          texto: "No hay ninguna clave de IA configurada. Avisa a quien administra el panel.",
          estado: 503,
        },
        FALLO_SERVICIO: {
          texto: "No se pudo transcribir ahora mismo. Inténtalo otra vez en un momento.",
          estado: 502,
        },
      };

      const salida = mensajes[error.motivo] ?? mensajes.FALLO_SERVICIO;
      return NextResponse.json({ error: salida.texto }, { status: salida.estado });
    }

    logger.error("[agenda] Error transcribiendo desde el panel", { error: String(error) });
    return NextResponse.json({ error: "No se pudo transcribir." }, { status: 500 });
  }
}
