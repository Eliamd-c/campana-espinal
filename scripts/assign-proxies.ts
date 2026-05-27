import { asignarProxiesPendientes } from "../lib/whatsapp/proxies";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  console.log("🚀 Iniciando asignación automática de proxies para las líneas de WhatsApp...");
  try {
    const asignados = await asignarProxiesPendientes();
    console.log(`✅ Proceso finalizado. Se asignaron proxies a ${asignados} líneas.`);
  } catch (error) {
    console.error("❌ Error durante la asignación de proxies:", error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
