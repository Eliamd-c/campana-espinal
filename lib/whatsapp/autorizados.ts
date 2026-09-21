import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Quién puede hablarle a una línea, y qué mensajes ya se atendieron.
 *
 * Es la pieza que hace que esto sea inofensivo. La línea está en WhatsApp,
 * donde cualquiera que tenga el número puede escribir; lo único que separa a
 * Andrés de un desconocido es esta lista.
 */

/** Catálogo de agentes. Añadir uno aquí es lo único que hace falta. */
export const AGENTES = {
  agenda: {
    etiqueta: "Agenda",
    descripcion: "Registra y consulta reuniones y eventos de la campaña.",
  },
  datos: {
    etiqueta: "Consultas a la base",
    descripcion: "Responde preguntas sobre el padrón, solo de lectura.",
  },
} as const;

export type Agente = keyof typeof AGENTES;

export const esAgenteValido = (valor: unknown): valor is Agente =>
  typeof valor === "string" && valor in AGENTES;

/**
 * Deja un número en dígitos, como lo guarda WhatsApp.
 *
 * Llega de dos sitios con formas distintas: del socket como
 * `573133288298@s.whatsapp.net`, y del panel como lo escriba una persona
 * («+57 313 328 8298»). Los dos tienen que acabar igual o el filtro no
 * encuentra a quien sí está autorizado.
 */
export function normalizarNumero(valor: string): string {
  const soloDigitos = (valor.split("@")[0] || "").replace(/\D/g, "");
  /**
   * WhatsApp añade un sufijo de dispositivo en algunos identificadores
   * (`573133288298:12`). Se corta antes de limpiar, no después, para no
   * pegarlo al número.
   */
  return soloDigitos;
}

/** Igual que la anterior, pero partiendo del identificador del socket. */
export function numeroDeJid(jid: string): string {
  return normalizarNumero((jid.split(":")[0] || "").split("@")[0] || "");
}

export interface Autorizado {
  id: number;
  numero: string;
  nombre: string | null;
  usuarioId: string | null;
  /** Permisos de la cuenta asociada, para que el agente responda con ellos. */
  permisos: string[];
  usuarioActivo: boolean;
}

/**
 * ¿Puede este número hablarle a esta línea?
 *
 * Devuelve `null` cuando no, y quien llama debe responder con silencio: ni un
 * mensaje, ni una marca de leído. Cualquier reacción le confirma a un
 * desconocido que detrás del número hay un programa.
 *
 * Se comprueba también que la cuenta asociada siga activa. Si a alguien se le
 * desactiva la cuenta del panel, su WhatsApp deja de valer en el mismo
 * momento, sin tener que acordarse de venir a quitarlo de esta lista.
 */
export async function buscarAutorizado(
  lineaId: number,
  numero: string
): Promise<Autorizado | null> {
  const fila = await prisma.whatsappAutorizado.findUnique({
    where: { linea_id_numero: { linea_id: lineaId, numero } },
    select: {
      id: true,
      numero: true,
      nombre: true,
      usuario_id: true,
      activo: true,
      usuario: { select: { activo: true, permisos: true } },
    },
  });

  if (!fila || !fila.activo) return null;

  /**
   * Un número sin cuenta asociada no entra. Podría parecer excesivo, pero sin
   * cuenta no hay permisos con los que responder ni nombre que anotar en la
   * auditoría: el agente estaría actuando por nadie.
   */
  if (!fila.usuario_id || !fila.usuario) {
    logger.warn("[whatsapp] Número autorizado sin cuenta asociada, ignorado", {
      lineaId,
      autorizadoId: fila.id,
    });
    return null;
  }

  if (!fila.usuario.activo) return null;

  return {
    id: fila.id,
    numero: fila.numero,
    nombre: fila.nombre,
    usuarioId: fila.usuario_id,
    permisos: fila.usuario.permisos,
    usuarioActivo: true,
  };
}

/**
 * Marca un mensaje como atendido y dice si era nuevo.
 *
 * La comprobación es la propia inserción: el índice único de la tabla rechaza
 * el duplicado. Hacerlo en dos pasos —mirar si existe y luego insertar—
 * dejaría un hueco entre ambos por el que se cuelan dos entregas simultáneas
 * del mismo mensaje, que es justo lo que pasa cuando la aplicación despierta y
 * WhatsApp le vuelca todo lo pendiente de golpe.
 */
export async function marcarAtendido(
  lineaId: number,
  mensajeWa: string
): Promise<boolean> {
  try {
    await prisma.whatsappMensajeVisto.create({
      data: { linea_id: lineaId, mensaje_wa: mensajeWa },
    });
    return true;
  } catch {
    // Violación de la clave única: ya estaba atendido.
    return false;
  }
}

/**
 * Poda el registro de mensajes atendidos.
 *
 * Pasadas unas horas WhatsApp ya no reentrega nada, así que la fila solo
 * ocupa sitio. Se llama desde el latido, aprovechando que ya pasa por ahí.
 */
export async function podarAtendidos(horas = 48): Promise<number> {
  const limite = new Date(Date.now() - horas * 3600_000);
  const { count } = await prisma.whatsappMensajeVisto.deleteMany({
    where: { fecha: { lt: limite } },
  });
  return count;
}
