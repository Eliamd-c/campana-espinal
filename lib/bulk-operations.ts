import prisma from "./db";
import { Prisma } from "@prisma/client";

/**
 * Bulk upsert de contactos
 * - Evita duplicados
 * - Actualiza si existe
 * - Procesa en batches de 500 para evitar sobrecarga o bloqueos de transacción
 */
export async function bulkUpsertContactos(
  contactos: Array<{
    cedula: string;
    nombre?: string;
    telefono?: string;
    barrio?: string;
    intencion_voto?: string;
  }>
): Promise<{
  creados: number;
  actualizados: number;
  errores: Array<{ cedula: string; error: string }>;
}> {
  const resultados = {
    creados: 0,
    actualizados: 0,
    errores: [] as Array<{ cedula: string; error: string }>,
  };

  if (contactos.length === 0) return resultados;

  // Filtrar cedulas válidas
  const contactosValidos = contactos.filter(c => c.cedula && c.cedula.trim() !== "");
  
  // Procesar en chunks de 500 contactos para máxima eficiencia
  const chunkSize = 500;
  for (let i = 0; i < contactosValidos.length; i += chunkSize) {
    const chunk = contactosValidos.slice(i, i + chunkSize);
    const cedulasChunk = chunk.map(c => c.cedula);

    try {
      // 1. Identificar cuáles ya existen en la base de datos
      const existentes = await prisma.contacto.findMany({
        where: { cedula: { in: cedulasChunk } },
        select: { cedula: true }
      });
      const existentesSet = new Set(existentes.map(e => e.cedula));

      // 2. Ejecutar transacción del chunk
      await prisma.$transaction(
        chunk.map((contacto) =>
          prisma.contacto.upsert({
            where: { cedula: contacto.cedula },
            update: {
              nombre: contacto.nombre || undefined,
              telefono: contacto.telefono || undefined,
              barrio: contacto.barrio || undefined,
              intencion_voto: contacto.intencion_voto || undefined,
              fecha_ultimo_contacto: new Date(),
            },
            create: {
              cedula: contacto.cedula,
              nombre: contacto.nombre || "Sin Nombre",
              telefono: contacto.telefono || "",
              barrio: contacto.barrio || "",
              intencion_voto: contacto.intencion_voto || "desconocido",
              es_nuevo: true,
            },
          })
        )
      );

      // 3. Contabilizar creados y actualizados en este chunk
      chunk.forEach(contacto => {
        if (existentesSet.has(contacto.cedula)) {
          resultados.actualizados++;
        } else {
          resultados.creados++;
        }
      });

    } catch (error: any) {
      console.error(`[BulkOperations] Error en chunk ${Math.floor(i / chunkSize) + 1}:`, error);
      // Si el chunk completo falló (por ejemplo, por clave foránea u otra restricción),
      // registramos el error para cada cedula de este chunk para que la importación no crashee entera.
      chunk.forEach(contacto => {
        resultados.errores.push({
          cedula: contacto.cedula,
          error: error.message || "Error al insertar/actualizar contacto en batch."
        });
      });
    }
  }

  return resultados;
}

/**
 * Bulk update de intención de voto para múltiples contactos
 */
export async function bulkUpdateContactos(
  updates: Array<{ cedula: string; intencion_voto: string }>
): Promise<number> {
  if (updates.length === 0) return 0;

  // Procesar en transacciones agrupadas por chunks de 500
  const chunkSize = 500;
  let totalActualizados = 0;

  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    
    await prisma.$transaction(
      chunk.map((u) =>
        prisma.contacto.update({
          where: { cedula: u.cedula },
          data: { intencion_voto: u.intencion_voto }
        })
      )
    );
    totalActualizados += chunk.length;
  }

  return totalActualizados;
}

/**
 * Bulk delete de contactos con cascada manual opcional
 */
export async function bulkDeleteContactos(
  cedulas: string[],
  deleteRelated: boolean = false
): Promise<{
  eliminados: number;
  errores: string[];
}> {
  if (cedulas.length === 0) {
    return { eliminados: 0, errores: [] };
  }

  try {
    if (deleteRelated) {
      // Eliminar con cascada manual agrupada
      await prisma.$transaction([
        // Primero eliminar asistencias a eventos
        prisma.asistenteEvento.deleteMany({
          where: { contacto_cedula: { in: cedulas } },
        }),
        // Luego mensajes enviados/recibidos
        prisma.mensaje.deleteMany({
          where: { contacto_cedula: { in: cedulas } },
        }),
        // Enlaces de rastreo de clics
        prisma.clicRastreo.deleteMany({
          where: { contacto_cedula: { in: cedulas } },
        }),
        // Finalmente contactos
        prisma.contacto.deleteMany({
          where: { cedula: { in: cedulas } },
        }),
      ]);
    } else {
      // Solo eliminar de la tabla contactos si no tiene referencias
      await prisma.contacto.deleteMany({
        where: { cedula: { in: cedulas } },
      });
    }

    return { eliminados: cedulas.length, errores: [] };
  } catch (error: any) {
    console.error("[BulkOperations] Error en eliminación masiva:", error);
    return { eliminados: 0, errores: [error.message || "Error eliminando contactos."] };
  }
}

/**
 * Batch procesamiento genérico para colecciones de datos grandes
 */
export async function procesarEnBatches<T, R>(
  items: T[],
  procesador: (batch: T[]) => Promise<R[]>,
  batchSize: number = 100
): Promise<R[]> {
  const resultados: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`[BatchProcessor] 📦 Procesando bloque ${Math.floor(i / batchSize) + 1}...`);

    try {
      const batchResultados = await procesador(batch);
      resultados.push(...batchResultados);
    } catch (error) {
      console.error(`[BatchProcessor] ❌ Error en bloque ${Math.floor(i / batchSize) + 1}:`, error);
    }
  }

  return resultados;
}
