import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import prisma from "@/lib/db";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

export interface MensajeJobData {
  instancia_id: string;
  contacto_cedula: string;
  numero: string;
  texto: string;
  mensaje_db_id: number;
}

const isBuildPhase = 
  process.env.NEXT_PHASE === "phase-production-build" || 
  process.env.NEXT_PHASE === "phase-export" || 
  process.env.IS_BUILD === "true";

let redisConnection: any;
let whatsappQueue: any;
let whatsappWorker: any;

if (isBuildPhase) {
  logger.info("[Queue] 🏗️ Build phase detected. Using mock Redis and Queue to prevent connection crashes.");
  redisConnection = {
    on: () => {},
    quit: async () => {},
  };
  whatsappQueue = {
    addBulk: async () => [],
    add: async () => ({}),
  };
  whatsappWorker = null;
} else {
  redisConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

  whatsappQueue = new Queue<MensajeJobData>("whatsapp-messages", {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: true,
    },
  });

  const getRandomDelay = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

  const procesarMensaje = async (job: Job<MensajeJobData>) => {
    const { instancia_id, numero, texto, mensaje_db_id } = job.data;

    try {
      // 1. Verificación de horario (solo entre 8 AM y 9 PM)
      const horaActual = new Date().getHours();
      if (horaActual < 8 || horaActual >= 21) {
        logger.warn("Postergando mensaje por horario no hábil", { mensaje_db_id });
        throw new Error("Fuera de horario hábil.");
      }

      // 2. Retraso aleatorio
      const isDev = process.env.NODE_ENV !== "production";
      const delayMs = isDev ? getRandomDelay(1000, 2000) : getRandomDelay(45000, 180000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // 3. Enviar
      const resEnvio = await fetch("http://localhost:3001/api/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineaId: instancia_id,
          numeros: [numero],
          tipo: "texto",
          contenido: texto,
        }),
      });

      if (!resEnvio.ok) {
        throw new Error(`HTTP ${resEnvio.status}`);
      }

      // 4. Actualizar estado
      await prisma.mensaje.update({
        where: { id: mensaje_db_id },
        data: { estado: "enviado" },
      });

      logger.info("Mensaje enviado exitosamente desde cola", { mensaje_db_id, numero });
    } catch (error: any) {
      Sentry.captureException(error, { tags: { job: "whatsapp-queue", mensaje_id: mensaje_db_id } });
      throw error; // Reintentar si falló
    }
  };

  whatsappWorker = new Worker<MensajeJobData>("whatsapp-messages", procesarMensaje, {
    connection: redisConnection,
    concurrency: 1,
    limiter: {
      max: 20,
      duration: 15 * 60 * 1000,
    },
  });

  whatsappWorker.on("completed", (job) => {
    logger.debug(`Job ${job.id} finalizado`);
  });

  whatsappWorker.on("failed", async (job, err) => {
    const attempts = job?.attemptsMade || 0;
    const maxAttempts = job?.opts?.attempts || 3;

    logger.error(`Job ${job?.id} falló (Intento ${attempts}/${maxAttempts})`, { error: err.message });

    if (attempts >= maxAttempts && job?.data.mensaje_db_id) {
      // 💀 Dead-letter logic: Marcar como fallo definitivo en DB
      await prisma.mensaje.update({
        where: { id: job.data.mensaje_db_id },
        data: { estado: "fallido_definitivo" },
      });
      logger.crit("Mensaje fallido definitivamente tras múltiples reintentos", { 
        mensaje_id: job.data.mensaje_db_id,
        numero: job.data.numero 
      });
    }
  });
}

export { redisConnection, whatsappQueue, whatsappWorker };
