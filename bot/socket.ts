import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { PrismaClient } from '@prisma/client';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();
const activeSockets = new Map<number, any>();

function logActivity(lineaId: number | string, tipo: string, mensaje: string) {
    console.log(`[SOCKET] [LINEA ${lineaId}] [${tipo.toUpperCase()}] ${mensaje}`);
}

async function startWhatsAppLine(lineaId: number, numero?: string) {
    const sessionDir = path.join(__dirname, 'sessions', `linea_${lineaId}`);
    
    // Ensure directory exists
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    
    logActivity(lineaId, 'info', 'Iniciando motor de WhatsApp...');

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
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
                // Fue deslogueado (borró dispositivo) - limpiamos el directorio
                logActivity(lineaId, 'warn', 'Sesión cerrada explícitamente. Limpiando credenciales locales.');
                try {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                } catch(e) {}
            }
        } else if (connection === 'open') {
            logActivity(lineaId, 'success', '¡Conexión de WhatsApp abierta exitosamente!');
            
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

        const apiUrl = 'http://localhost:3000/api/whatsapp/procesar-mensaje';
        
        if (isAudio) {
            logActivity(lineaId, 'audio', `Audio recibido de ${remoteJid}`);
            // Nota: descarga de audio omitida por brevedad en este boilerplate, 
            // pero el flujo principal maneja texto para la IA.
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

async function bootstrapAllLines() {
    const lineas = await prisma.lineaWhatsapp.findMany();
    logActivity('SISTEMA', 'info', `Encontradas ${lineas.length} líneas en la base de datos.`);
    
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

// Servidor HTTP interno
const server = http.createServer(async (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', async () => {
        if (req.method === 'POST' && req.url === '/api/sync') {
            const data = JSON.parse(body || '{}');
            if (data.lineaId) {
                startWhatsAppLine(parseInt(data.lineaId, 10));
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } else {
                res.writeHead(400);
                res.end(JSON.stringify({ error: "Missing lineaId" }));
            }
        } 
        else if (req.method === 'POST' && req.url === '/api/send') {
            // Endpoint para uso interno del Worker
            try {
                const { lineaId, jid, content } = JSON.parse(body || '{}');
                const sock = activeSockets.get(parseInt(lineaId, 10));
                if (!sock) {
                    res.writeHead(404);
                    return res.end(JSON.stringify({ error: "Socket no encontrado o desconectado" }));
                }

                await sock.sendMessage(jid, content);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } catch(e: any) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
            }
        }
        else {
            res.writeHead(404);
            res.end();
        }
    });
});

server.listen(3002, () => {
    logActivity('SISTEMA', 'info', 'Servidor de control Socket escuchando en puerto 3002');
    bootstrapAllLines();
});
