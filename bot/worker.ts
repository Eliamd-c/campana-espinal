import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function logWorker(tipo: string, mensaje: string) {
    console.log(`[WORKER] [${tipo.toUpperCase()}] ${mensaje}`);
}

const redisConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });

logWorker('info', 'Worker de BullMQ inicializado y esperando trabajos en "whatsapp-messages"...');

const whatsappWorker = new Worker("whatsapp-messages", async (job: Job) => {
    const { instancia_id, numero, texto, mensaje_db_id, mediaUrl, pollOptions, delayMin, delayMax } = job.data;
    
    const lineaId = parseInt(instancia_id, 10);
    
    // Asegurar código de país para Colombia (57) si tiene 10 dígitos
    let numLimpio = numero.replace(/\D/g, '');
    if (numLimpio.length === 10) numLimpio = `57${numLimpio}`;
    const jid = `${numLimpio}@s.whatsapp.net`;

    try {
        let content: any;

        if (pollOptions && pollOptions.length > 0) {
            content = {
                poll: {
                    name: texto,
                    values: pollOptions,
                    selectableCount: 1
                }
            };
        } else if (mediaUrl) {
            if (mediaUrl.endsWith('.mp4')) {
                content = { video: { url: mediaUrl }, caption: texto };
            } else {
                content = { image: { url: mediaUrl }, caption: texto };
            }
        } else {
            content = { text: texto };
        }

        // --- DEFENSA ANTI-BAN: Jitter Gaussiano Dinámico ---
        const minMs = (delayMin || 5) * 1000;
        const maxMs = (delayMax || 15) * 1000;
        const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);
        logWorker('info', `Jitter: Esperando ${delayMs}ms antes de enviar a ${numero}...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));

        // Enviar la orden al proceso de Socket vía HTTP local
        logWorker('info', `Enviando orden a Socket Manager para ${numero}...`);
        const response = await fetch('http://localhost:3002/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lineaId,
                jid,
                content
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status} del Socket Manager`);
        }

        // Marcar como enviado en la DB
        await prisma.mensaje.update({
            where: { id: mensaje_db_id },
            data: { estado: "enviado" },
        });
        
        await prisma.lineaWhatsapp.update({
            where: { id: lineaId },
            data: { mensajes_enviados_hoy: { increment: 1 } }
        });

        logWorker('success', `Mensaje despachado con éxito a ${numero}`);
    } catch (error: any) {
        logWorker('error', `Fallo al procesar job ${job.id}: ${error.message}`);
        throw error;
    }
}, {
    connection: redisConnection,
    concurrency: 1 // Solo procesamos 1 mensaje a la vez para no saturar a la IP/WhatsApp
});

whatsappWorker.on('failed', async (job, err) => {
    if (job && job.data.mensaje_db_id) {
        logWorker('error', `Job ${job.id} fallido definitivamente. Actualizando BD.`);
        await prisma.mensaje.update({
            where: { id: job.data.mensaje_db_id },
            data: { estado: "fallido_definitivo" },
        });
    }
});
