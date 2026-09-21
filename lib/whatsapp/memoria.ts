import prisma from "@/lib/db";
import type { TurnoNeutro } from "@/lib/ia/agente";

/**
 * La conversación de cada persona con cada línea.
 *
 * Sin esto, el agente empieza de cero en cada mensaje: alguien escribe «el 4
 * de agosto en Caballero y Góngora», el agente resume y pregunta si está bien,
 * la persona contesta «sí» — y el agente no sabe a qué está diciendo que sí.
 * La confirmación, que es la garantía de que nada se guarda a ciegas, depende
 * de que haya memoria.
 *
 * Se guarda en `chat_memoria`, la misma tabla del asistente del panel, con un
 * identificador de sesión propio por línea y por número. Dos agentes distintos
 * no comparten hilo, y dos personas tampoco.
 */

/** Cuántos turnos se recuerdan. */
const MAX_TURNOS = 20;

/**
 * Identificador del hilo.
 *
 * Lleva la línea además del número a propósito: la misma persona escribiéndole
 * a la agenda y a las consultas de base son dos conversaciones separadas. Un
 * agente que arrastra el contexto del otro produce respuestas raras que nadie
 * sabe explicar.
 */
export function sesionDeChat(lineaId: number, numero: string): string {
  return `wa-${lineaId}-${numero}`.slice(0, 80);
}

export async function cargarHistorial(
  sesionId: string,
  tipo: string
): Promise<TurnoNeutro[]> {
  const filas = await prisma.chatMemoria.findMany({
    where: { sesion_id: sesionId, tipo },
    orderBy: { timestamp: "desc" },
    take: MAX_TURNOS,
    select: { rol: true, contenido: true },
  });

  return filas.reverse().map((f) => ({
    rol: f.rol === "assistant" ? ("modelo" as const) : ("usuario" as const),
    texto: f.contenido,
  }));
}

export async function guardarTurno(
  sesionId: string,
  tipo: string,
  rol: "user" | "assistant",
  contenido: string
): Promise<void> {
  await prisma.chatMemoria.create({
    data: { sesion_id: sesionId, tipo, rol, contenido },
  });
}

/**
 * Poda los hilos viejos.
 *
 * Son mensajes de WhatsApp de gente de la campaña: no hay motivo para
 * guardarlos indefinidamente, y cuanto menos quede almacenado, menos hay que
 * proteger. Se llama desde el latido.
 */
export async function podarMemoria(dias = 30): Promise<number> {
  const limite = new Date(Date.now() - dias * 24 * 3600_000);
  const { count } = await prisma.chatMemoria.deleteMany({
    where: { sesion_id: { startsWith: "wa-" }, timestamp: { lt: limite } },
  });
  return count;
}
