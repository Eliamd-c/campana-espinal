import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, AnyMessageContent } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import * as http from 'http';
import { usePrismaAuthState } from '../lib/whatsapp/usePrismaAuthState';

const prisma = new PrismaClient();

// Mapa global de sockets activos
const activeSockets = new Map<number, any>();

function logActivity(lineaId: number | string, tipo: string, mensaje: string) {
    console.log(`[LINEA ${lineaId}] [${tipo.toUpperCase()}] ${mensaje}`);
}

async function startWhatsAppLine(lineaId: number, numero?: string) {
    const sessionName = `linea_${lineaId}`;
    const { state, saveCreds } = await usePrismaAuthState(sessionName);
    const { version } = await fetchLatestBaileysVersion();
    
    logActivity(lineaId, 'info', 'Iniciando motor de WhatsApp...');

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
    });

    activeSockets.set(lineaId, sock);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            logActivity(lineaId, 'info', 'Nuevo QR generado, guárdalo o escanéalo.');
            await prisma.lineaWhatsapp.update({
                where: { id: lineaId },
                data: { qr_actual: qr, estado: 'qr_listo' }
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            logActivity(lineaId, 'error', `Conexión cerrada. Reconectando: ${shouldReconnect}`);
            
            await prisma.lineaWhatsapp.update({
                where: { id: lineaId },
                data: { estado: 'desconectado', qr_actual: null }
            });

            activeSockets.delete(lineaId);

            if (shouldReconnect) {
                setTimeout(() => startWhatsAppLine(lineaId, numero), 5000);
            } else {
                // Fue deslogueado (borró dispositivo) - limpiamos el estado en DB
                await prisma.whatsappAuthState.deleteMany({
                    where: { sessionId: `linea_${lineaId}` }
                });
            }
        } else if (connection === 'open') {
            logActivity(lineaId, 'success', '¡Conexión de WhatsApp abierta exitosamente!');
            
            // Si no teníamos el número guardado y lo podemos obtener del socket
            const botNumber = sock.user?.id.split(':')[0];
            
            await prisma.lineaWhatsapp.update({
                where: { id: lineaId },
                data: { 
                    estado: 'conectado', 
                    qr_actual: null, 
                    ultima_conexion: new Date(),
                    ...(botNumber && !numero ? { numero_telefono: botNumber } : {})
                }
            });
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid) return;

        const isAudio = msg.message.audioMessage || msg.message.documentMessage?.mimetype?.includes('audio');
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        // Aquí mandamos el mensaje a procesar por IA Inbound
        const apiUrl = 'http://localhost:3000/api/whatsapp/procesar-mensaje';
        
        if (isAudio) {
            logActivity(lineaId, 'audio', `Audio recibido de ${remoteJid}`);
            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', { }, { 
                    logger: undefined as any, reuploadRequest: sock.updateMediaMessage 
                });
                
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        audioBase64: (buffer as Buffer).toString('base64'),
                        texto: null,
                        mimeType: 'audio/ogg',
                        sender: remoteJid,
                        lineaId: lineaId
                    })
                });
                const data = await res.json();
                if (data.success && data.mensaje) {
                    await sock.sendMessage(remoteJid, { text: data.mensaje });
                }
            } catch (error) {
                logActivity(lineaId, 'error', `Fallo crítico procesando audio: ${error}`);
            }
        } else if (text) {
            logActivity(lineaId, 'info', `Texto recibido de ${remoteJid}`);
            try {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        audioBase64: null,
                        texto: text,
                        mimeType: null,
                        sender: remoteJid,
                        lineaId: lineaId
                    })
                });
                const data = await res.json();
                if (data.success && data.mensaje) {
                    await sock.sendMessage(remoteJid, { text: data.mensaje });
                }
            } catch(e) {
                logActivity(lineaId, 'error', `Error enviando texto a IA: ${e}`);
            }
        }
    });
}

// Función para inicializar todas las líneas desde la BD
async function bootstrapAllLines() {
    const lineas = await prisma.lineaWhatsapp.findMany();
    logActivity('SISTEMA', 'info', `Encontradas ${lineas.length} líneas en la base de datos.`);
    
    // Si no hay ninguna, creamos la primera por defecto para pruebas
    if (lineas.length === 0) {
        const nuevaLinea = await prisma.lineaWhatsapp.create({
            data: { nombre: 'Línea Principal' }
        });
        startWhatsAppLine(nuevaLinea.id);
    } else {
        for (const linea of lineas) {
            startWhatsAppLine(linea.id, linea.numero_telefono || undefined);
        }
    }
}

// Worker de BullMQ integrado en el bot
const redisConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });

const whatsappWorker = new Worker("whatsapp-messages", async (job: Job) => {
    const { instancia_id, numero, texto, mensaje_db_id, mediaUrl, pollOptions, delayMin, delayMax } = job.data;
    
    // Convertir instancia_id a number (ID de base de datos)
    const lineaId = parseInt(instancia_id, 10);
    const sock = activeSockets.get(lineaId);

    if (!sock) {
        throw new Error(`Socket para la línea ${lineaId} no está activo.`);
    }

    const jid = `${numero}@s.whatsapp.net`;

    try {
        let content: AnyMessageContent;

        if (pollOptions && pollOptions.length > 0) {
            content = {
                poll: {
                    name: texto,
                    values: pollOptions,
                    selectableCount: 1
                }
            };
        } else if (mediaUrl) {
            // Simulando envío de media por URL
            if (mediaUrl.endsWith('.mp4')) {
                content = { video: { url: mediaUrl }, caption: texto };
            } else {
                content = { image: { url: mediaUrl }, caption: texto };
            }
        } else {
            content = { text: texto };
        }

        // --- DEFENSA ANTI-BAN: Jitter Gaussiano Dinámico ---
        // Simular que una persona humana está escribiendo el mensaje
        const minMs = (delayMin || 5) * 1000;
        const maxMs = (delayMax || 15) * 1000;
        const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);
        logActivity(lineaId, 'info', `Esperando ${delayMs}ms (Anti-Ban Jitter) antes de enviar a ${numero}...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));

        await sock.sendMessage(jid, content);

        await prisma.mensaje.update({
            where: { id: mensaje_db_id },
            data: { estado: "enviado" },
        });
        
        // Incrementar contador
        await prisma.lineaWhatsapp.update({
            where: { id: lineaId },
            data: { mensajes_enviados_hoy: { increment: 1 } }
        });

        logActivity(lineaId, 'success', `Mensaje enviado a ${numero}`);
    } catch (error: any) {
        throw error;
    }
}, {
    connection: redisConnection,
    concurrency: 1 // RECOMENDACIÓN ANTI-BAN: 1 solo mensaje concurrente por proceso worker para no saturar la conexión
});

whatsappWorker.on('failed', async (job, err) => {
    if (job && job.data.mensaje_db_id) {
        await prisma.mensaje.update({
            where: { id: job.data.mensaje_db_id },
            data: { estado: "fallido_definitivo" },
        });
    }
});

// Mini servidor HTTP para recibir comandos (sincronizar líneas nuevas)
const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/sync') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            const data = JSON.parse(body || '{}');
            if (data.lineaId) {
                startWhatsAppLine(parseInt(data.lineaId, 10));
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } else {
                res.writeHead(400);
                res.end();
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(3002, () => {
    logActivity('SISTEMA', 'info', 'Servidor de control Bot escuchando en puerto 3002');
    bootstrapAllLines();
});
