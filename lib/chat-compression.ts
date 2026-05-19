import prisma from "./db";

/**
 * Comprimir historial de chat
 * - Resume conversaciones antiguas
 * - Mantiene los últimos N mensajes completos
 */
export async function comprimirHistorialChat(
  sesionId: string,
  ultimosMensajesParaMantener: number = 5
) {
  try {
    const historial = await prisma.chatMemoria.findMany({
      where: { sesion_id: sesionId },
      orderBy: { timestamp: "asc" },
    });

    if (historial.length <= ultimosMensajesParaMantener) {
      return; // No es necesario comprimir aún
    }

    const antiguosCount = historial.length - ultimosMensajesParaMantener;
    const antiguos = historial.slice(0, antiguosCount);

    // Filtrar para no re-comprimir resúmenes anteriores
    const antiguosValidos = antiguos.filter(m => !m.contenido.startsWith("[RESUMEN DE CONVERSACIÓN"));
    if (antiguosValidos.length === 0) return;

    // Generar resumen simple de conversación antigua
    const resumen = generarResumenHistorial(antiguosValidos);

    const primerAnciano = antiguosValidos[0];
    const ultimoAnciano = antiguosValidos[antiguosValidos.length - 1];

    // Crear un único registro de resumen en la base de datos
    await prisma.chatMemoria.create({
      data: {
        sesion_id: sesionId,
        rol: "system",
        contenido: `[RESUMEN DE CONVERSACIÓN ANTERIOR]\n${resumen}\n[FIN RESUMEN]`,
        tipo: "analista",
        timestamp: new Date((primerAnciano.timestamp.getTime() + ultimoAnciano.timestamp.getTime()) / 2),
      },
    });

    // Eliminar los mensajes antiguos que ya fueron resumidos para no sobrecargar el almacenamiento
    const idsAEliminar = antiguosValidos.map(m => m.id);
    await prisma.chatMemoria.deleteMany({
      where: {
        id: { in: idsAEliminar }
      }
    });

    console.log(`[ChatCompression] 🧹 Historial resumido. Eliminados ${idsAEliminar.length} mensajes antiguos.`);

  } catch (error) {
    console.error("[ChatCompression] ⚠️ Error comprimiendo historial:", error);
  }
}

/**
 * Generar un resumen a partir de un arreglo de mensajes
 */
function generarResumenHistorial(mensajes: any[]): string {
  if (mensajes.length === 0) return "Sin conversación anterior.";

  const usuarios = mensajes.filter((m) => m.rol === "user");
  const temas = usuarios
    .map((m) => {
      const tema = m.contenido.trim().split(/\s+/).slice(0, 10).join(" ");
      return `"${tema}${m.contenido.length > 50 ? '...' : ''}"`;
    })
    .join(", ");

  return `Se consultó sobre los siguientes temas en la conversación anterior: ${temas}. 
Última actualización registrada: ${new Date().toLocaleDateString('es-CO')}`;
}

/**
 * Obtener el historial OPTIMIZADO para Gemini
 * - Mantiene los últimos N mensajes completos
 * - Resume los mensajes más antiguos
 */
export async function getHistorialOptimizado(
  sesionId: string,
  ultimosMensajes: number = 5
): Promise<any[]> {
  try {
    const todoHistorial = await prisma.chatMemoria.findMany({
      where: { sesion_id: sesionId },
      orderBy: { timestamp: "asc" },
    });

    if (todoHistorial.length <= ultimosMensajes) {
      return todoHistorial;
    }

    // Dividir en antiguos y recientes
    const antiguos = todoHistorial.slice(0, -ultimosMensajes);
    const recientes = todoHistorial.slice(-ultimosMensajes);

    // Obtener los resúmenes anteriores existentes en los antiguos para preservarlos directamente
    const resumenesExistentes = antiguos.filter(m => m.rol === "system" && m.contenido.startsWith("[RESUMEN DE CONVERSACIÓN"));
    const antiguosSinResumenes = antiguos.filter(m => !(m.rol === "system" && m.contenido.startsWith("[RESUMEN DE CONVERSACIÓN")));

    let resumenAntiguos = "";
    if (antiguosSinResumenes.length > 0) {
      resumenAntiguos = generarResumenHistorial(antiguosSinResumenes);
    }

    const consolidado: any[] = [];

    // Agregar resúmenes existentes
    resumenesExistentes.forEach(r => {
      consolidado.push({
        sesion_id: sesionId,
        rol: "model", // Se entrega a Gemini como rol model para mantener coherencia
        contenido: r.contenido,
        tipo: "analista",
        timestamp: r.timestamp
      });
    });

    // Agregar nuevo resumen si hay mensajes viejos sueltos
    if (resumenAntiguos) {
      consolidado.push({
        sesion_id: sesionId,
        rol: "model",
        contenido: `[CONTEXTO DE CONVERSACIÓN PREVIA]\n${resumenAntiguos}\n[FIN CONTEXTO]`,
        tipo: "analista",
        timestamp: new Date()
      });
    }

    // Agregar los últimos N mensajes recientes intactos
    consolidado.push(...recientes);

    return consolidado;
  } catch (error) {
    console.error("[ChatCompression] ⚠️ Error al obtener historial optimizado:", error);
    // Fallback: retornar historial completo en caso de error
    return prisma.chatMemoria.findMany({
      where: { sesion_id: sesionId },
      orderBy: { timestamp: "asc" }
    });
  }
}

/**
 * Limpiar sesiones antiguas (job de mantenimiento periódico)
 */
export async function limpiarSesionesAntiguas(diasCorte: number = 30): Promise<number> {
  try {
    const fechaCorte = new Date(Date.now() - diasCorte * 24 * 60 * 60 * 1000);

    const eliminados = await prisma.chatMemoria.deleteMany({
      where: {
        timestamp: {
          lt: fechaCorte,
        },
      },
    });

    console.log(`[ChatCompression] 🗑️ Limpieza periódica: Eliminados ${eliminados.count} mensajes de hace más de ${diasCorte} días.`);
    return eliminados.count;
  } catch (error) {
    console.error("[ChatCompression] ⚠️ Error en limpieza de sesiones antiguas:", error);
    return 0;
  }
}
