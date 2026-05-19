import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resetData() {
  console.log("🚀 Iniciando limpieza de datos operativos...");

  try {
    // El orden es importante por las claves foráneas
    await prisma.$transaction([
      prisma.asistenteEvento.deleteMany(),
      prisma.clicRastreo.deleteMany(),
      prisma.mensaje.deleteMany(),
      prisma.campanaVariacion.deleteMany(),
      prisma.campana.deleteMany(),
      prisma.enlaceCorto.deleteMany(),
      prisma.reunion.deleteMany(),
      prisma.evento.deleteMany(),
      prisma.contacto.deleteMany(),
      prisma.lider.deleteMany(),
      prisma.auditoria.deleteMany(),
      prisma.chatMemoria.deleteMany(),
      prisma.contenido.deleteMany(),
    ]);

    console.log("✅ Datos eliminados exitosamente.");
    console.log("📝 Nota: Los usuarios y plantillas de checklist se han conservado.");
  } catch (error) {
    console.error("❌ Error al eliminar datos:", error);
  } finally {
    await prisma.$disconnect();
  }
}

resetData();
