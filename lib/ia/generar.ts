import {
  proveedoresDisponibles,
  convieneRelevar,
  registrarRelevo,
  type ModuloIA,
  type Proveedor,
} from "./proveedor";
import { logger } from "@/lib/logger";

/**
 * Una sola puerta para pedirle algo a la IA, sea quien sea el proveedor.
 *
 * Antes cada ruta hablaba directamente con el SDK de Gemini, así que cambiar
 * de proveedor obligaba a reescribir la ruta entera y quedarse sin crédito
 * dejaba el módulo muerto. Aquí dentro está lo único que de verdad difiere
 * entre los dos servicios -cómo se arma la petición y dónde viene el texto en
 * la respuesta- y fuera todo el mundo pide igual.
 *
 * No se usa ningún SDK: las dos APIs se llaman por HTTP, igual que ya hacía
 * el módulo de agenda con OpenAI. Una dependencia menos que mantener y
 * ninguna sorpresa de versiones en producción.
 */

/** Archivo adjunto a la petición, en data URL. */
export interface AdjuntoIA {
  dataUrl: string;
  mimeType: string;
  /** El base64 sin la cabecera `data:...;base64,`. */
  base64: string;
}

export interface PeticionIA {
  modulo: ModuloIA;
  prompt: string;
  /** Imagen o PDF que el modelo debe mirar. */
  adjunto?: AdjuntoIA;
  /** Pedir la respuesta como JSON. */
  json?: boolean;
  /** 0 salvo que haga falta variedad: los mismos datos deben dar lo mismo. */
  temperatura?: number;
}

export interface RespuestaIA {
  texto: string;
  proveedor: Proveedor;
}

/**
 * Error con causa distinguible, para que quien llama sepa si el problema es
 * de configuración -y hay que mandar a alguien al panel- o del servicio.
 */
export class ErrorIA extends Error {
  constructor(
    mensaje: string,
    readonly codigo: "SIN_CLAVE" | "SIN_CUPO" | "FALLO_SERVICIO",
  ) {
    super(mensaje);
    this.name = "ErrorIA";
  }
}

/**
 * Modelos por proveedor.
 *
 * En OCR se usa el modelo grande de OpenAI a propósito: leer cédulas escritas
 * a mano es justo donde los modelos pequeños se equivocan, y un dígito mal
 * deja el contacto inservible. En texto, el pequeño basta y cuesta mucho
 * menos.
 */
const MODELOS = {
  gemini: { texto: "gemini-2.5-flash", vision: "gemini-1.5-flash" },
  openai: { texto: "gpt-4o-mini", vision: "gpt-4o" },
} as const;

const esPdf = (mimeType: string) => mimeType === "application/pdf";

async function pedirAGemini(p: PeticionIA, apiKey: string): Promise<string> {
  const modelo = p.adjunto ? MODELOS.gemini.vision : MODELOS.gemini.texto;

  const partes: unknown[] = [{ text: p.prompt }];
  if (p.adjunto) {
    // Gemini acepta imagen y PDF por la misma vía.
    partes.push({ inlineData: { mimeType: p.adjunto.mimeType, data: p.adjunto.base64 } });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: partes }],
        generationConfig: {
          temperature: p.temperatura ?? 0,
          ...(p.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  );

  const cuerpo = await res.text();
  if (!res.ok) throw new FalloProveedor(res.status, cuerpo);

  const datos = JSON.parse(cuerpo);
  const texto = datos?.candidates?.[0]?.content?.parts
    ?.map((parte: { text?: string }) => parte.text ?? "")
    .join("");

  return texto ?? "";
}

async function pedirAOpenAI(p: PeticionIA, apiKey: string): Promise<string> {
  const cabeceras = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  /**
   * Un PDF no cabe en la API de chat de OpenAI: hay que pasar por la de
   * respuestas, que sí admite documentos. Es la razón de que haya dos
   * caminos aquí y solo uno en Gemini.
   */
  if (p.adjunto && esPdf(p.adjunto.mimeType)) {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: cabeceras,
      body: JSON.stringify({
        model: MODELOS.openai.vision,
        temperature: p.temperatura ?? 0,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: p.prompt },
              {
                type: "input_file",
                filename: "planilla.pdf",
                file_data: p.adjunto.dataUrl,
              },
            ],
          },
        ],
      }),
    });

    const cuerpo = await res.text();
    if (!res.ok) throw new FalloProveedor(res.status, cuerpo);

    const datos = JSON.parse(cuerpo);
    // `output_text` es el atajo; si no viene, se arma desde las partes.
    if (typeof datos.output_text === "string") return datos.output_text;

    const partes = datos?.output?.flatMap((o: any) => o?.content ?? []) ?? [];
    return partes.map((c: any) => c?.text ?? "").join("");
  }

  const contenido: unknown[] = [{ type: "text", text: p.prompt }];
  if (p.adjunto) {
    contenido.push({ type: "image_url", image_url: { url: p.adjunto.dataUrl } });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify({
      model: p.adjunto ? MODELOS.openai.vision : MODELOS.openai.texto,
      temperature: p.temperatura ?? 0,
      ...(p.json ? { response_format: { type: "json_object" } } : {}),
      messages: [{ role: "user", content: p.adjunto ? contenido : p.prompt }],
    }),
  });

  const cuerpo = await res.text();
  if (!res.ok) throw new FalloProveedor(res.status, cuerpo);

  const datos = JSON.parse(cuerpo);
  return datos?.choices?.[0]?.message?.content ?? "";
}

/** Fallo de un proveedor concreto, con lo justo para decidir si se releva. */
class FalloProveedor extends Error {
  constructor(
    readonly status: number,
    readonly cuerpo: string,
  ) {
    super(`El proveedor respondió ${status}`);
  }
}

/**
 * Pide a la IA y, si el proveedor preferido no puede atender, pasa al otro.
 *
 * El detalle del error se queda en el registro y nunca sale hacia el
 * navegador: la respuesta de estas APIs puede arrastrar fragmentos del prompt
 * o de la propia clave.
 */
export async function generarConIA(p: PeticionIA): Promise<RespuestaIA> {
  const intentos = await proveedoresDisponibles(p.modulo);

  if (intentos.length === 0) {
    throw new ErrorIA(
      "No hay ninguna clave de IA configurada. Añade la de Gemini o la de OpenAI en Configuración.",
      "SIN_CLAVE",
    );
  }

  let ultimoFallo: FalloProveedor | null = null;

  for (let i = 0; i < intentos.length; i++) {
    const { proveedor, apiKey } = intentos[i];

    try {
      const texto =
        proveedor === "openai" ? await pedirAOpenAI(p, apiKey) : await pedirAGemini(p, apiKey);

      if (i > 0) {
        logger.info("[ia] Atendido por el proveedor de respaldo", {
          modulo: p.modulo,
          proveedor,
        });
      }

      return { texto, proveedor };
    } catch (error) {
      if (!(error instanceof FalloProveedor)) throw error;

      ultimoFallo = error;
      const siguiente = intentos[i + 1];

      if (siguiente && convieneRelevar(error.status, error.cuerpo)) {
        registrarRelevo(p.modulo, proveedor, siguiente.proveedor, `HTTP ${error.status}`);
        continue;
      }

      logger.error("[ia] El proveedor falló y no hay relevo posible", {
        modulo: p.modulo,
        proveedor,
        status: error.status,
      });
      break;
    }
  }

  const sinCupo = ultimoFallo && convieneRelevar(ultimoFallo.status, ultimoFallo.cuerpo);

  throw new ErrorIA(
    sinCupo
      ? "Los servicios de IA configurados no tienen crédito disponible."
      : "El servicio de IA no respondió correctamente.",
    sinCupo ? "SIN_CUPO" : "FALLO_SERVICIO",
  );
}
