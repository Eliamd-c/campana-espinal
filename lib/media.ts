import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Subida de imágenes y vídeos para el constructor de mensajes.
 *
 * Antes se subía desde el navegador con la clave `anon`, que es pública, y el
 * propio mensaje de error pedía «crea el bucket 'media' y hazlo público». Eso
 * significaba que cualquiera que leyera el JavaScript de la web podía escribir
 * ficheros en el almacenamiento de la campaña, sin límite de tipo ni de
 * tamaño, y que todo lo subido quedaba accesible a quien acertara la URL.
 *
 * Ahora el bucket es privado y la subida pasa por el servidor, que exige
 * sesión y valida el fichero antes de aceptarlo. El navegador nunca toca el
 * almacenamiento.
 */

export const BUCKET = "media";

/** 25 MB. Coincide con el límite configurado en el propio bucket. */
export const TAMANO_MAXIMO = 25 * 1024 * 1024;

/**
 * Tipos admitidos, con la firma binaria que debe tener el fichero.
 *
 * No basta con mirar el `Content-Type` ni la extensión: los dos los elige
 * quien sube. Se comprueba el contenido real.
 */
const FIRMAS: { tipo: string; extension: string; firma: number[]; desplazamiento?: number }[] = [
  { tipo: "image/jpeg", extension: "jpg", firma: [0xff, 0xd8, 0xff] },
  { tipo: "image/png", extension: "png", firma: [0x89, 0x50, 0x4e, 0x47] },
  { tipo: "image/gif", extension: "gif", firma: [0x47, 0x49, 0x46, 0x38] },
  // WEBP y MP4 llevan la marca unos bytes más adelante.
  { tipo: "image/webp", extension: "webp", firma: [0x57, 0x45, 0x42, 0x50], desplazamiento: 8 },
  { tipo: "video/mp4", extension: "mp4", firma: [0x66, 0x74, 0x79, 0x70], desplazamiento: 4 },
  { tipo: "video/webm", extension: "webm", firma: [0x1a, 0x45, 0xdf, 0xa3] },
  { tipo: "audio/ogg", extension: "ogg", firma: [0x4f, 0x67, 0x67, 0x53] },
  { tipo: "audio/mpeg", extension: "mp3", firma: [0x49, 0x44, 0x33] },
];

export interface Reconocido {
  tipo: string;
  extension: string;
}

/**
 * Reconoce el fichero por su contenido. Devuelve `null` si no es ninguno de
 * los tipos admitidos, de modo que un HTML con JavaScript renombrado a `.png`
 * no llega al almacenamiento.
 */
export function reconocerMedio(bytes: Uint8Array): Reconocido | null {
  for (const { tipo, extension, firma, desplazamiento = 0 } of FIRMAS) {
    if (bytes.length < desplazamiento + firma.length) continue;
    const coincide = firma.every((b, i) => bytes[desplazamiento + i] === b);
    if (coincide) return { tipo, extension };
  }
  return null;
}

/**
 * Cliente con la clave de servicio. Vive solo en el servidor: esa clave se
 * salta RLS por completo, así que no puede acabar en el navegador ni en una
 * variable `NEXT_PUBLIC_*`.
 */
export function clienteDeServicio(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !clave) return null;

  return createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
