import makeWASocket, { useMultiFileAuthState, DisconnectReason, ConnectionState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path from "path";
import fs from "fs";

export type InstanciaWhatsApp = {
  id: string; // Ej: "zona-norte", "zona-sur"
  estado: "conectando" | "conectado" | "desconectado" | "qr";
  qr?: string;
  socket?: ReturnType<typeof makeWASocket>;
};

class WhatsAppManager {
  private instancias: Map<string, InstanciaWhatsApp> = new Map();
  private readonly authFolder = path.join(process.cwd(), "whatsapp_auth");

  constructor() {
    if (!fs.existsSync(this.authFolder)) {
      fs.mkdirSync(this.authFolder, { recursive: true });
    }
  }

  public async inicializarInstancia(id: string): Promise<InstanciaWhatsApp> {
    if (this.instancias.has(id)) {
      return this.instancias.get(id)!;
    }

    const authDir = path.join(this.authFolder, id);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false, // We will surface the QR to the web frontend
      browser: ["Campana Espinal", "Chrome", "1.0.0"],
    });

    const instancia: InstanciaWhatsApp = {
      id,
      estado: "conectando",
      socket: sock,
    };

    this.instancias.set(id, instancia);

    sock.ev.on("creds.update", saveCreds);

    // Escuchar mensajes entrantes y reenviar al webhook de perfilamiento
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        // Ignorar mensajes propios (fromMe) y mensajes vacíos
        if (msg.key.fromMe || !msg.message) continue;
        
        const texto =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          null;

        if (!texto) continue;

        // Extraer número limpio (sin @s.whatsapp.net y sin @g.us para grupos)
        const jid = msg.key.remoteJid || "";
        if (jid.endsWith("@g.us")) continue; // Ignorar grupos

        const numero = jid.split("@")[0].replace(/\D/g, "");
        // Normalizar: quitar código de país colombiano (57) para buscar en BD
        const numeroNormalizado = numero.startsWith("57") ? numero.slice(2) : numero;

        const webhookSecret = process.env.INTERNAL_WEBHOOK_SECRET || "dev-secret";
        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

        fetch(`${baseUrl}/api/whatsapp/webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": webhookSecret,
          },
          body: JSON.stringify({
            instancia_id: id,
            numero: numeroNormalizado,
            texto,
            timestamp: msg.messageTimestamp,
          }),
        }).catch(err => console.error("[Manager] Error al llamar webhook:", err));
      }
    });

    sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        instancia.estado = "qr";
        instancia.qr = qr;
      }

      if (connection === "close") {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        
        instancia.estado = "desconectado";
        instancia.qr = undefined;
        
        if (shouldReconnect) {
          // Reconnect automatically
          setTimeout(() => this.inicializarInstancia(id), 5000);
        } else {
          // Logged out, clean up auth folder
          fs.rmSync(authDir, { recursive: true, force: true });
          this.instancias.delete(id);
        }
      } else if (connection === "open") {
        instancia.estado = "conectado";
        instancia.qr = undefined;
        console.log(`[WhatsApp] Instancia ${id} conectada exitosamente.`);
      }
    });

    return instancia;
  }

  public getInstancia(id: string): InstanciaWhatsApp | undefined {
    return this.instancias.get(id);
  }

  public getAllInstancias(): InstanciaWhatsApp[] {
    return Array.from(this.instancias.values());
  }

  public async enviarMensaje(id: string, numero: string, texto: string) {
    const instancia = this.instancias.get(id);
    if (!instancia || instancia.estado !== "conectado" || !instancia.socket) {
      throw new Error(`Instancia ${id} no está conectada`);
    }

    // El número debe tener el formato de WhatsApp (ej: 573001234567@s.whatsapp.net)
    const jid = `${numero}@s.whatsapp.net`;
    
    // Simular escritura para reducir riesgo de baneo
    await instancia.socket.presenceSubscribe(jid);
    await new Promise((r) => setTimeout(r, 500));
    await instancia.socket.sendPresenceUpdate("composing", jid);
    await new Promise((r) => setTimeout(r, 2000));
    await instancia.socket.sendPresenceUpdate("paused", jid);

    await instancia.socket.sendMessage(jid, { text: texto });
  }
}

// Singleton para mantener la conexión viva entre hot reloads en dev
const globalForManager = global as unknown as { waManager: WhatsAppManager };
export const waManager = globalForManager.waManager || new WhatsAppManager();

if (process.env.NODE_ENV !== "production") globalForManager.waManager = waManager;
