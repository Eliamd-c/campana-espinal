import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { puedeTransicionar, type Estado } from "./estados";

/**
 * Qué se hace con una solicitud, y cómo se mueve una reunión de fecha.
 *
 * Vive aparte de las rutas porque lo usan dos sitios: la bandeja del panel y
 * el agente de WhatsApp. Es la misma lección de `crear.ts` — dos caminos
 * distintos a la misma tabla acaban validando cosas distintas.
 *
 * La regla de fondo es que aquí **no se borra nada**. Rechazar deja constancia
 * de la decisión, posponer deja la fecha en que vuelve, duplicar enlaza con la
 * original, y reprogramar crea una reunión nueva atada a la vieja. Quien
 * pregunte la semana que viene «¿qué pasó con lo que pedí?» tiene respuesta.
 */

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string; status: number };

async function cargar(id: string) {
  return prisma.agendamiento.findUnique({
    where: { id },
    select: {
      id: true,
      titulo: true,
      estado: true,
      fecha_inicio: true,
      fecha_fin: true,
      plantilla_id: true,
      reglas_congeladas: true,
      barrio: true,
      direccion: true,
      datos: true,
      lider_id: true,
      responsable: true,
      asistentes_esperados: true,
      presupuesto_estimado: true,
      notas: true,
      texto_original: true,
      campos_por_confirmar: { select: { campo: true } },
      recursos_solicitados: {
        orderBy: { orden: "asc" },
        select: { item: true, cantidad_solicitada: true, orden: true },
      },
    },
  });
}

function comprobarPaso(actual: string, destino: Estado): string | null {
  if (!puedeTransicionar(actual as Estado, destino)) {
    return `No se puede pasar de «${actual}» a «${destino}».`;
  }
  return null;
}

/** Aceptar: la solicitud pasa a ser un cupo apartado en la agenda. */
export async function aceptar(id: string, quien: string): Promise<Resultado<{ estado: string }>> {
  const fila = await cargar(id);
  if (!fila) return { ok: false, error: "No existe", status: 404 };

  const problema = comprobarPaso(fila.estado, "cupo");
  if (problema) return { ok: false, error: problema, status: 409 };

  await prisma.agendamiento.update({
    where: { id },
    data: { estado: "cupo", pospuesto_hasta: null },
  });

  logger.info("[agenda] Solicitud aceptada", { id, quien });
  return { ok: true, datos: { estado: "cupo" } };
}

/** Rechazar: nunca llegó a ser reunión, y se anota por qué. */
export async function rechazar(
  id: string,
  quien: string,
  motivo: string
): Promise<Resultado<{ estado: string }>> {
  const fila = await cargar(id);
  if (!fila) return { ok: false, error: "No existe", status: 404 };

  const problema = comprobarPaso(fila.estado, "rechazado");
  if (problema) return { ok: false, error: problema, status: 409 };

  await prisma.agendamiento.update({
    where: { id },
    data: {
      estado: "rechazado",
      motivo_cancelacion: motivo,
      cancelado_por: quien,
      fecha_cancelado: new Date(),
      pospuesto_hasta: null,
    },
  });

  logger.info("[agenda] Solicitud rechazada", { id, quien });
  return { ok: true, datos: { estado: "rechazado" } };
}

/**
 * Posponer: se aparca hasta una fecha y vuelve sola ese día.
 *
 * La fecha tiene que estar por delante; posponer hasta ayer es no posponer, y
 * dejaría la solicitud fuera de la bandeja para siempre sin que nadie lo note.
 */
export async function posponer(
  id: string,
  quien: string,
  hasta: Date
): Promise<Resultado<{ estado: string; hasta: Date }>> {
  const fila = await cargar(id);
  if (!fila) return { ok: false, error: "No existe", status: 404 };

  if (hasta.getTime() <= Date.now()) {
    return { ok: false, error: "Esa fecha ya pasó.", status: 400 };
  }

  const problema = comprobarPaso(fila.estado, "pospuesto");
  if (problema) return { ok: false, error: problema, status: 409 };

  await prisma.agendamiento.update({
    where: { id },
    data: { estado: "pospuesto", pospuesto_hasta: hasta },
  });

  logger.info("[agenda] Solicitud pospuesta", { id, quien, hasta });
  return { ok: true, datos: { estado: "pospuesto", hasta } };
}

/** Duplicada: se enlaza con la que ya existía en vez de borrarla. */
export async function marcarDuplicada(
  id: string,
  quien: string,
  originalId: string
): Promise<Resultado<{ estado: string }>> {
  if (id === originalId) {
    return { ok: false, error: "No puede ser duplicada de sí misma.", status: 400 };
  }

  const [fila, original] = await Promise.all([cargar(id), cargar(originalId)]);
  if (!fila) return { ok: false, error: "No existe", status: 404 };
  if (!original) return { ok: false, error: "La original no existe", status: 404 };

  const problema = comprobarPaso(fila.estado, "rechazado");
  if (problema) return { ok: false, error: problema, status: 409 };

  await prisma.agendamiento.update({
    where: { id },
    data: {
      estado: "rechazado",
      duplicado_de: originalId,
      motivo_cancelacion: `Duplicada de «${original.titulo}»`,
      cancelado_por: quien,
      fecha_cancelado: new Date(),
      pospuesto_hasta: null,
    },
  });

  logger.info("[agenda] Solicitud marcada como duplicada", { id, originalId, quien });
  return { ok: true, datos: { estado: "rechazado" } };
}

/** Cancelar una reunión que sí existía, con su motivo. */
export async function cancelar(
  id: string,
  quien: string,
  motivo: string
): Promise<Resultado<{ estado: string }>> {
  const fila = await cargar(id);
  if (!fila) return { ok: false, error: "No existe", status: 404 };

  const problema = comprobarPaso(fila.estado, "cancelado");
  if (problema) return { ok: false, error: problema, status: 409 };

  await prisma.agendamiento.update({
    where: { id },
    data: {
      estado: "cancelado",
      motivo_cancelacion: motivo,
      cancelado_por: quien,
      fecha_cancelado: new Date(),
    },
  });

  logger.info("[agenda] Reunión cancelada", { id, quien });
  return { ok: true, datos: { estado: "cancelado" } };
}

/**
 * Reprogramar: se crea una reunión nueva y se cancela la vieja, enlazadas.
 *
 * No se edita la fecha de la original a propósito. Editando, nadie sabe
 * después que aquello se movió, ni desde cuándo, ni quién lo hizo; y el día
 * que alguien reclama «pero si era el jueves» no hay nada que enseñar.
 * Además, como esto solo añade filas, puede hacerlo el agente de WhatsApp sin
 * riesgo de destruir lo que ya estaba.
 *
 * Se copian los recursos y los campos por confirmar: mover una reunión de día
 * no hace que deje de necesitar las sillas.
 */
export async function reprogramar(
  id: string,
  quien: string,
  nuevaFecha: Date,
  motivo?: string
): Promise<Resultado<{ id: string; fecha_inicio: Date }>> {
  const fila = await cargar(id);
  if (!fila) return { ok: false, error: "No existe", status: 404 };

  if (fila.estado === "ejecutado") {
    return { ok: false, error: "Esa reunión ya se hizo: no se puede mover.", status: 409 };
  }
  if (fila.estado === "cancelado" || fila.estado === "rechazado") {
    return { ok: false, error: "Esa reunión ya no está en pie.", status: 409 };
  }
  if (nuevaFecha.getTime() < Date.now()) {
    return { ok: false, error: "Esa fecha ya pasó.", status: 400 };
  }

  /**
   * Si la original tenía duración, se conserva: mover una reunión de dos
   * horas no la convierte en una de media.
   */
  const duracion =
    fila.fecha_fin ? fila.fecha_fin.getTime() - fila.fecha_inicio.getTime() : null;

  const nueva = await prisma.$transaction(async (tx) => {
    const creada = await tx.agendamiento.create({
      data: {
        plantilla_id: fila.plantilla_id,
        reglas_congeladas: fila.reglas_congeladas as any,
        titulo: fila.titulo,
        fecha_inicio: nuevaFecha,
        fecha_fin: duracion ? new Date(nuevaFecha.getTime() + duracion) : null,
        barrio: fila.barrio,
        direccion: fila.direccion,
        datos: fila.datos as any,
        /**
         * Nace como cupo, no como confirmada, aunque la original lo estuviera:
         * cambiar el día obliga a avisar a la gente, y hasta que eso pase no
         * hay nada confirmado.
         */
        estado: "cupo",
        lider_id: fila.lider_id,
        responsable: fila.responsable,
        asistentes_esperados: fila.asistentes_esperados,
        presupuesto_estimado: fila.presupuesto_estimado,
        notas: fila.notas,
        texto_original: fila.texto_original,
        creado_por: quien,
        reprogramado_de: fila.id,
        reprogramado_por: quien,
        campos_por_confirmar: fila.campos_por_confirmar.length
          ? {
              create: fila.campos_por_confirmar.map((c) => ({
                campo: c.campo,
                marcado_por: quien,
              })),
            }
          : undefined,
        recursos_solicitados: fila.recursos_solicitados.length
          ? {
              create: fila.recursos_solicitados.map((r) => ({
                item: r.item,
                cantidad_solicitada: r.cantidad_solicitada,
                estado: "solicitado",
                orden: r.orden,
              })),
            }
          : undefined,
      },
      select: { id: true, fecha_inicio: true },
    });

    await tx.agendamiento.update({
      where: { id: fila.id },
      data: {
        estado: "cancelado",
        motivo_cancelacion: motivo?.trim()
          ? `Reprogramada: ${motivo.trim()}`
          : "Reprogramada para otra fecha",
        cancelado_por: quien,
        fecha_cancelado: new Date(),
      },
    });

    return creada;
  });

  logger.info("[agenda] Reunión reprogramada", { de: fila.id, a: nueva.id, quien });
  return { ok: true, datos: nueva };
}

/**
 * Devuelve a la bandeja lo pospuesto cuya fecha ya llegó.
 *
 * Se llama desde el latido, que ya pasa cada pocos minutos. Podría calcularse
 * al leer la bandeja, pero entonces el estado guardado diría «pospuesto» de
 * algo que ya toca: preferimos que la base diga la verdad a que la diga solo
 * la pantalla.
 */
export async function despertarPospuestos(): Promise<number> {
  const { count } = await prisma.agendamiento.updateMany({
    where: { estado: "pospuesto", pospuesto_hasta: { lte: new Date() } },
    data: { estado: "borrador", pospuesto_hasta: null },
  });

  if (count > 0) logger.info("[agenda] Solicitudes pospuestas devueltas a la bandeja", { count });
  return count;
}
