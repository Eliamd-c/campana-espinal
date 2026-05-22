import fs from 'fs';
import { Queue, Worker, Job } from 'bullmq';
import Redis from "ioredis";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

function logDebug(msg: string) {
  console.log(msg);
  try { fs.appendFileSync('debug.log', new Date().toISOString() + ' [QUEUE] ' + msg + '\n'); } catch(e) {}
}

export interface MensajeJobData {
  instancia_id: string; // ID de LineaWhatsapp
  contacto_cedula: string;
  numero: string;
  texto: string;
  mensaje_db_id: number;
  mediaUrl?: string;
  pollOptions?: string[];
  delayMin?: number;
  delayMax?: number;
}

const isBuildPhase = 
  process.env.NEXT_PHASE === "phase-production-build" || 
  process.env.NEXT_PHASE === "phase-export" || 
  process.env.IS_BUILD === "true";

let redisConnection: any;
let whatsappQueue: any;

if (isBuildPhase) {
  redisConnection = { on: () => {}, quit: async () => {} };
  whatsappQueue = { addBulk: async () => [], add: async () => ({}) };
} else {
  redisConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

  whatsappQueue = new Queue<MensajeJobData>("whatsapp-messages", {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
    },
  });
}

/**
 * Añade mensajes masivos distribuyéndolos (Round-Robin) entre las líneas activas.
 */
export async function encolarMensajesMasivos(mensajes: any[], mediaUrl?: string, pollOptions?: string[], options?: { lineaId?: number, delayMin?: number, delayMax?: number }) {
  logDebug(`encolarMensajesMasivos started with ${mensajes.length} messages.`);
  
  // 1. Obtener líneas conectadas y aptas
  let lineasActivas = await prisma.lineaWhatsapp.findMany({
    where: { estado: 'conectado' },
    select: { id: true, limite_diario: true, mensajes_enviados_hoy: true }
  });

  logDebug(`lineasActivas found: ${lineasActivas.length}`);

  if (lineasActivas.length === 0) {
    throw new Error("No hay líneas de WhatsApp conectadas para enviar mensajes.");
  }

  // Si se eligió una línea específica, filtrar para usar solo esa
  if (options?.lineaId) {
    lineasActivas = lineasActivas.filter(l => l.id === options.lineaId);
    if (lineasActivas.length === 0) {
      throw new Error("La línea seleccionada no está conectada o no existe.");
    }
  }

  // Filtrar líneas que superaron el límite diario
  const lineasDisponibles = lineasActivas.filter(l => (l.mensajes_enviados_hoy || 0) < (l.limite_diario || 500));

  logDebug(`lineasDisponibles: ${lineasDisponibles.length}`);

  if (lineasDisponibles.length === 0) {
    throw new Error("Las líneas seleccionadas han superado su límite de envío diario.");
  }

  const jobsData = [];
  let lineaIndex = 0;

  logDebug(`Iterating messages...`);
  for (const msj of mensajes) {
    const linea = lineasDisponibles[lineaIndex];
    
    // Actualizar el mensaje en DB para registrar qué línea lo enviará
    await prisma.mensaje.update({
      where: { id: msj.id },
      data: { linea_id: linea.id }
    });

    jobsData.push({
      name: `msg_${msj.id}`,
      data: {
        instancia_id: linea.id.toString(),
        contacto_cedula: msj.contacto_cedula,
        numero: msj.contacto?.telefono || "",
        texto: msj.texto || "",
        mensaje_db_id: msj.id,
        mediaUrl,
        pollOptions,
        delayMin: options?.delayMin,
        delayMax: options?.delayMax
      }
    });

    // Avanzar al siguiente celular (Round-Robin)
    lineaIndex = (lineaIndex + 1) % lineasDisponibles.length;
  }

  logDebug(`Calling whatsappQueue.addBulk with ${jobsData.length} jobs...`);
  
  // Timeout prevention in case Redis is down
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Timeout de conexión al motor de colas (Redis parece estar apagado).")), 3000);
  });
  
  await Promise.race([
    whatsappQueue.addBulk(jobsData),
    timeoutPromise
  ]);

  logDebug(`addBulk finished!`);
  logger.info(`Encolados ${jobsData.length} mensajes repartidos en ${lineasDisponibles.length} líneas.`);
}

export async function setupErrorHandlers() {
  whatsappQueue.on("failed", async (job, err) => {
    if (!job) return;
    const { mensaje_db_id, campana_id, numero } = job.data;
    
    try {
      await prisma.mensajeError.create({
        data: {
          mensaje_id: mensaje_db_id,
          campana_id,
          numero_telefono: numero,
          error_code: err.name,
          error_message: err.message.substring(0, 500),
          intentos: job.attemptsMade,
        },
      });
      
      // Marcar mensaje como fallido
      await prisma.mensaje.update({
        where: { id: mensaje_db_id },
        data: { estado: "fallido" }
      });
      
      logger.warn(`Mensaje ${mensaje_db_id} falló permanentemente. Error: ${err.message}`);
    } catch (e) {
      logger.error("Error guardando MensajeError:", e);
    }
  });
}

if (!isBuildPhase) {
  setupErrorHandlers();
}

export { redisConnection, whatsappQueue };
