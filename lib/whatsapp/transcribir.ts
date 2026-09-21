import { logger } from "@/lib/logger";
import { proveedoresDisponibles, registrarRelevo } from "@/lib/ia/proveedor";

/**
 * Notas de voz a texto.
 *
 * En campaña la gente manda audios, no párrafos. Sin esto, la línea pide por
 * escrito lo que la persona ya dijo hablando, y acaba usándose menos.
 *
 * Va aparte de `lib/ia/generar.ts` porque el audio no viaja igual en los dos
 * proveedores: Gemini lo acepta incrustado como cualquier adjunto, mientras
 * que en OpenAI la transcripción es un servicio propio con su propia forma de
 * llamada. El relevo se mantiene: si el primero no puede, se intenta con el
 * segundo.
 */

/**
 * Tope de duración. Una solicitud de reunión cabe de sobra; lo que hay más
 * allá suele ser un reenvío o un audio mandado por error, y cada segundo se
 * paga.
 */
export const MAX_SEGUNDOS_AUDIO = 180;

/** Tope de tamaño, por si el aviso de duración viene mal. */
const MAX_BYTES = 8 * 1024 * 1024;

const INSTRUCCION =
  "Transcribe literalmente este audio en español de Colombia. " +
  "Devuelve solo la transcripción, sin comentarios, sin comillas y sin " +
  "describir lo que oyes. Si no se entiende nada, responde exactamente: (inaudible)";

async function conGemini(
  apiKey: string,
  audio: Buffer,
  mimeType: string
): Promise<string> {
  const respuesta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: INSTRUCCION },
              { inlineData: { mimeType, data: audio.toString("base64") } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    }
  );

  if (!respuesta.ok) {
    throw new Error(`Gemini ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
  }

  const cuerpo = await respuesta.json();
  return (cuerpo?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
}

async function conOpenAI(
  apiKey: string,
  audio: Buffer,
  mimeType: string
): Promise<string> {
  const formulario = new FormData();
  formulario.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), "nota.ogg");
  formulario.append("model", "whisper-1");
  formulario.append("language", "es");

  const respuesta = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formulario,
  });

  if (!respuesta.ok) {
    throw new Error(`OpenAI ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
  }

  const cuerpo = await respuesta.json();
  return String(cuerpo?.text ?? "").trim();
}

export class ErrorTranscripcion extends Error {
  constructor(
    mensaje: string,
    readonly motivo: "SIN_CLAVE" | "DEMASIADO_LARGO" | "FALLO_SERVICIO"
  ) {
    super(mensaje);
    this.name = "ErrorTranscripcion";
  }
}

/**
 * Transcribe una nota de voz, con relevo entre proveedores.
 *
 * Devuelve el texto tal cual lo oyó. No se corrige ni se interpreta aquí: de
 * eso se encarga el agente, que además va a repetir lo entendido y a pedir
 * confirmación. Un audio mal oído que se convierte en una dirección inventada
 * es exactamente lo que esa confirmación existe para atrapar.
 */
export async function transcribirAudio(
  audio: Buffer,
  mimeType: string,
  segundos?: number
): Promise<string> {
  if (segundos && segundos > MAX_SEGUNDOS_AUDIO) {
    throw new ErrorTranscripcion(
      `El audio dura ${Math.round(segundos)} segundos.`,
      "DEMASIADO_LARGO"
    );
  }

  if (audio.byteLength > MAX_BYTES) {
    throw new ErrorTranscripcion("El audio pesa demasiado.", "DEMASIADO_LARGO");
  }

  const intentos = await proveedoresDisponibles("agenda");
  if (intentos.length === 0) {
    throw new ErrorTranscripcion("No hay ninguna clave de IA configurada.", "SIN_CLAVE");
  }

  let ultimoFallo: unknown = null;

  for (let i = 0; i < intentos.length; i++) {
    const { proveedor, apiKey } = intentos[i];

    try {
      const texto =
        proveedor === "gemini"
          ? await conGemini(apiKey, audio, mimeType)
          : await conOpenAI(apiKey, audio, mimeType);

      if (texto) return texto;
      throw new Error("transcripción vacía");
    } catch (error) {
      ultimoFallo = error;
      const siguiente = intentos[i + 1];
      if (siguiente) {
        registrarRelevo("agenda", proveedor, siguiente.proveedor, "transcripción");
        continue;
      }
    }
  }

  logger.error("[whatsapp] No se pudo transcribir la nota de voz", {
    error: String(ultimoFallo),
  });
  throw new ErrorTranscripcion("No se pudo transcribir.", "FALLO_SERVICIO");
}
