import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';

const QR_FILE = path.join(__dirname, 'qr.txt');
const STATUS_FILE = path.join(__dirname, 'status.txt');
const LOGS_FILE = path.join(__dirname, 'logs.json');

function setStatus(status: string) {
    fs.writeFileSync(STATUS_FILE, status, 'utf-8');
}

function logActivity(tipo: string, mensaje: string) {
    const log = { timestamp: new Date().toISOString(), tipo, mensaje };
    let logs: any[] = [];
    if (fs.existsSync(LOGS_FILE)) {
        try { logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8')); } catch(e){}
    }
    logs.push(log);
    if (logs.length > 50) logs = logs.slice(-50); // Mantener solo los últimos 50
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
    console.log(`[${tipo.toUpperCase()}] ${mensaje}`);
}

async function connectToWhatsApp() {
    logActivity('info', 'Iniciando motor de WhatsApp...');
    setStatus('iniciando');

    const { state, saveCreds } = await useMultiFileAuthState('bot/auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            logActivity('info', 'Nuevo QR generado, esperando escaneo de la UI...');
            fs.writeFileSync(QR_FILE, qr, 'utf-8');
            setStatus('qr_listo');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            logActivity('error', `Conexión cerrada. Reconectando: ${shouldReconnect}`);
            setStatus('desconectado');
            if (fs.existsSync(QR_FILE)) fs.unlinkSync(QR_FILE);

            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            logActivity('success', '¡Conexión de WhatsApp abierta exitosamente!');
            setStatus('conectado');
            if (fs.existsSync(QR_FILE)) fs.unlinkSync(QR_FILE);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid) return;

        // Extraer el número de teléfono limpio
        const numeroRemitente = remoteJid.split('@')[0];

        // Leer whitelist dinámica
        let numerosAutorizados: string[] = [];
        const whitelistPath = path.join(__dirname, 'whitelist.json');
        if (fs.existsSync(whitelistPath)) {
            try {
                numerosAutorizados = JSON.parse(fs.readFileSync(whitelistPath, 'utf-8'));
            } catch(e) {}
        }

        // Filtro de Seguridad
        if (!numerosAutorizados.includes(numeroRemitente)) {
            logActivity('error', `Mensaje bloqueado (número no autorizado): ${numeroRemitente}`);
            return;
        }

        const isAudio = msg.message.audioMessage || msg.message.documentMessage?.mimetype?.includes('audio');
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (isAudio) {
            logActivity('audio', `Audio recibido de ${remoteJid}. Procesando...`);
            await sock.sendMessage(remoteJid, { text: 'He recibido tu nota de voz. Procesando con IA...' });

            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', { }, { 
                    logger: undefined as any, reuploadRequest: sock.updateMediaMessage 
                });
                
                logActivity('ia', `Enviando audio y contexto a Gemini...`);

                const res = await fetch('http://localhost:3000/api/whatsapp/procesar-mensaje', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        audioBase64: (buffer as Buffer).toString('base64'),
                        texto: null,
                        mimeType: 'audio/ogg',
                        sender: remoteJid
                    })
                });

                const data = await res.json();
                if (data.success) {
                    logActivity('success', `IA respondió: ${data.mensaje.substring(0, 30)}...`);
                    await sock.sendMessage(remoteJid, { text: data.mensaje });
                } else {
                    logActivity('error', `Error IA: ${data.mensaje}`);
                    await sock.sendMessage(remoteJid, { text: data.mensaje });
                }
            } catch (error) {
                logActivity('error', `Fallo crítico procesando audio: ${error}`);
            }
        } else if (text) {
            if (text.toLowerCase() === 'ping') {
                logActivity('info', `Ping recibido.`);
                await sock.sendMessage(remoteJid, { text: 'Pong! Motor de IA en línea y escuchando.' });
                return;
            }

            logActivity('info', `Texto recibido de ${remoteJid}. Enviando a IA para contexto...`);
            try {
                const res = await fetch('http://localhost:3000/api/whatsapp/procesar-mensaje', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        audioBase64: null,
                        texto: text,
                        mimeType: null,
                        sender: remoteJid
                    })
                });

                const data = await res.json();
                if (data.success) {
                    logActivity('success', `IA respondió al texto.`);
                    await sock.sendMessage(remoteJid, { text: data.mensaje });
                }
            } catch(e) {
                logActivity('error', `Error enviando texto a IA.`);
            }
        }
    });
}

connectToWhatsApp();
