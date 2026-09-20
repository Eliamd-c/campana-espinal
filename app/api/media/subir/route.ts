import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import {
  BUCKET,
  TAMANO_MAXIMO,
  clienteDeServicio,
  reconocerMedio,
} from "@/lib/media";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

export const dynamic = "force-dynamic";

/** Duración del enlace que se devuelve. Una semana. */
const VALIDEZ_ENLACE = 7 * 24 * 60 * 60;

/**
 * Sube una imagen o un vídeo al constructor de mensajes.
 *
 * Exige sesión y comprueba el contenido real del fichero. El navegador ya no
 * habla con el almacenamiento: antes lo hacía con la clave pública, lo que
 * permitía a cualquiera escribir en él.
 */
export async function POST(req: NextRequest) {
  try {
    // Sin permiso para ver campanas, no se pasa de aqui.
    const permiso = await exigirPermiso(PERMISOS.MENSAJES_VER);
    if (!permiso.ok) return permiso.respuesta;

    const formulario = await req.formData();
    const archivo = formulario.get("archivo");

    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
    }

    if (archivo.size === 0) {
      return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
    }

    if (archivo.size > TAMANO_MAXIMO) {
      return NextResponse.json(
        { error: `El archivo supera los ${Math.round(TAMANO_MAXIMO / 1024 / 1024)} MB.` },
        { status: 413 }
      );
    }

    const bytes = new Uint8Array(await archivo.arrayBuffer());

    /**
     * El tipo se deduce del contenido, no de lo que declare el navegador ni
     * de la extensión: ambos los elige quien sube. Así un HTML con JavaScript
     * renombrado a `.png` no entra.
     */
    const reconocido = reconocerMedio(bytes);
    if (!reconocido) {
      logger.warn("[media] Archivo rechazado: el contenido no es un medio admitido");
      return NextResponse.json(
        { error: "Solo se admiten imágenes (JPG, PNG, WEBP, GIF), vídeo (MP4, WEBM) o audio." },
        { status: 415 }
      );
    }

    /**
     * La configuración se comprueba después de validar el archivo: así un
     * intento de subir algo que no toca se rechaza igual aunque falte la
     * clave, y el mensaje que ve quien sube es el que corresponde.
     */
    const supabase = clienteDeServicio();
    if (!supabase) {
      logger.error("[media] Falta SUPABASE_SECRET_KEY: no se puede subir");
      return NextResponse.json(
        { error: "El almacenamiento no está configurado en el servidor." },
        { status: 503 }
      );
    }

    // Nombre generado en el servidor: nada de lo que venga del cliente entra
    // en la ruta, así que no se puede escribir fuera de su sitio.
    const ruta = `${new Date().getFullYear()}/${randomUUID()}.${reconocido.extension}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, bytes, { contentType: reconocido.tipo, upsert: false });

    if (error) {
      logger.error("[media] Error subiendo al almacenamiento", { error: error.message });
      return NextResponse.json({ error: "No se pudo guardar el archivo." }, { status: 502 });
    }

    /**
     * El bucket es privado, así que se devuelve un enlace firmado con
     * caducidad en vez de una URL pública permanente.
     */
    const { data: firmado, error: errorFirma } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(ruta, VALIDEZ_ENLACE);

    if (errorFirma || !firmado) {
      logger.error("[media] No se pudo firmar el enlace", { error: errorFirma?.message });
      return NextResponse.json({ error: "No se pudo preparar el enlace." }, { status: 502 });
    }

    logger.info("[media] Archivo subido", { tipo: reconocido.tipo, bytes: archivo.size });

    return NextResponse.json({ url: firmado.signedUrl, ruta, tipo: reconocido.tipo });
  } catch (error) {
    logger.error("[media] Error inesperado", { error: String(error) });
    return NextResponse.json({ error: "No se pudo subir el archivo." }, { status: 500 });
  }
}
