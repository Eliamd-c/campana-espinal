import prisma from "@/lib/db";

export async function registrarAuditoria(
  usuarioId: string | number,
  accion: string,
  detalles?: any
) {
  try {
    await prisma.auditoria.create({
      data: {
        usuario_id: String(usuarioId),
        accion,
        datos_despues: detalles ? (typeof detalles === 'string' ? JSON.parse(detalles) : detalles) : null,
      },
    });
  } catch (error) {
    console.error("Error al registrar auditoría:", error);
    // No lanzamos error para no interrumpir el flujo principal
  }
}
