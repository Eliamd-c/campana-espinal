import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  type WASocket,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  borrarCredenciales,
  estadoAuthPostgres,
  tieneCredenciales,
} from "./auth-postgres";

/**
 * Conexión con WhatsApp: una línea, un socket, un solo intento a la vez.
 *
 * Esto no es una petición web: es una conexión que se queda abierta. El
 * alojamiento compartido apaga la aplicación cuando nadie la visita, así que
 * el socket se abre bajo demanda —desde el panel la primera vez, desde el
 * latido del cron después— y se guarda en el ámbito global del proceso para
 * sobrevivir entre peticiones. Cuando esto se mude al VPS el mecanismo será
 * el mismo, solo que el proceso ya no se dormirá.
 *
 * Tres reglas gobiernan el archivo:
 *
 *  1. **Nunca dos sockets para la misma línea.** Dos conexiones con las
 *     mismas credenciales se pelean, se desconectan mutuamente y es la clase
 *     de comportamiento por el que WhatsApp bloquea un número.
 *  2. **Reconectar con freno.** Un bucle de reintentos inmediatos es lo peor
 *     que se le puede hacer a una cuenta. Cada fallo espera más que el
 *     anterior.
 *  3. **Si el teléfono cerró la sesión, no insistir.** Las credenciales ya no
 *     valen; hay que escanear otra vez y el panel tiene que decirlo.
 */

/** Estados que se guardan en `lineas_whatsapp.estado`. */
export type EstadoLinea =
  | "desconectado"
  | "conectando"
  | "qr_listo"
  | "conectado"
  | "baneado";

interface Conexion {
  sock: WASocket | null;
  estado: EstadoLinea;
  /** Promesa del intento en curso, para que dos peticiones no abran dos sockets. */
  abriendo: Promise<void> | null;
  /** Fallos seguidos. Vuelve a cero en cuanto la conexión abre. */
  fallos: number;
  /** Temporizador de reintento, para poder cancelarlo. */
  reintento: NodeJS.Timeout | null;
  /** Último motivo de caída, tal como se le muestra a quien mira el panel. */
  detalle: string | null;
  /** Sesión cerrada desde el teléfono: no se reconecta hasta escanear de nuevo. */
  requiereQr: boolean;
}

/**
 * El registro vive en `globalThis` y no en un módulo normal porque Next puede
 * recargar los módulos entre peticiones. Si el mapa se recreara, se perdería
 * la referencia al socket abierto y acabaríamos con dos conexiones vivas para
 * la misma línea, que es justamente lo que hay que evitar.
 */
const global_ = globalThis as unknown as { conexionesWa?: Map<number, Conexion> };
const conexiones: Map<number, Conexion> = (global_.conexionesWa ??= new Map());

/** Baileys habla mucho. Su ruido va aparte del registro de la aplicación. */
const registroBaileys = pino({ level: "silent" });

const sesionDe = (lineaId: number) => `linea-${lineaId}`;

/** 10 s, 20 s, 40 s… hasta un tope de 5 minutos. */
const RETRASO_BASE_MS = 10_000;
const RETRASO_MAXIMO_MS = 5 * 60_000;

function conexionDe(lineaId: number): Conexion {
  let conexion = conexiones.get(lineaId);
  if (!conexion) {
    conexion = {
      sock: null,
      estado: "desconectado",
      abriendo: null,
      fallos: 0,
      reintento: null,
      detalle: null,
      requiereQr: false,
    };
    conexiones.set(lineaId, conexion);
  }
  return conexion;
}

/**
 * Guarda el estado en la base.
 *
 * El panel lee de ahí, no de la memoria del proceso, y por eso importa que
 * sea fiel: una línea caída tiene que verse caída. Si el panel dijera
 * «conectado» mientras el socket está muerto, quien escriba pensará que el
 * sistema lo ignoró.
 */
async function anotarEstado(
  lineaId: number,
  estado: EstadoLinea,
  extra: { qr?: string | null; telefono?: string | null; conectada?: boolean } = {}
) {
  const conexion = conexionDe(lineaId);
  conexion.estado = estado;

  try {
    await prisma.lineaWhatsapp.update({
      where: { id: lineaId },
      data: {
        estado,
        ...(extra.qr !== undefined ? { qr_actual: extra.qr } : {}),
        ...(extra.telefono ? { numero_telefono: extra.telefono } : {}),
        ...(extra.conectada ? { ultima_conexion: new Date() } : {}),
      },
    });
  } catch (error) {
    logger.error("[whatsapp] No se pudo anotar el estado de la línea", {
      lineaId,
      estado,
      error: String(error),
    });
  }
}

function cancelarReintento(conexion: Conexion) {
  if (conexion.reintento) {
    clearTimeout(conexion.reintento);
    conexion.reintento = null;
  }
}

function programarReintento(lineaId: number) {
  const conexion = conexionDe(lineaId);
  cancelarReintento(conexion);

  const retraso = Math.min(
    RETRASO_BASE_MS * 2 ** Math.max(0, conexion.fallos - 1),
    RETRASO_MAXIMO_MS
  );

  logger.info("[whatsapp] Reintento programado", {
    lineaId,
    fallos: conexion.fallos,
    en_segundos: Math.round(retraso / 1000),
  });

  /**
   * `unref` para que un reintento pendiente no impida al proceso terminar.
   * En el alojamiento compartido el proceso se apaga a menudo, y un
   * temporizador colgando solo consigue que tarde más en irse.
   */
  conexion.reintento = setTimeout(() => {
    conexion.reintento = null;
    abrirLinea(lineaId).catch((error) =>
      logger.error("[whatsapp] Falló el reintento", { lineaId, error: String(error) })
    );
  }, retraso);
  conexion.reintento.unref?.();
}

/**
 * Abre el socket de una línea. Si ya hay uno abierto o abriéndose, no hace
 * nada: es seguro llamarla en cada latido del cron.
 */
export async function abrirLinea(lineaId: number): Promise<void> {
  const conexion = conexionDe(lineaId);

  if (conexion.sock && conexion.estado === "conectado") return;
  if (conexion.abriendo) return conexion.abriendo;

  conexion.abriendo = (async () => {
    cancelarReintento(conexion);
    await anotarEstado(lineaId, "conectando", { qr: null });

    const sessionId = sesionDe(lineaId);
    const { state, guardarCreds } = await estadoAuthPostgres(sessionId);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: registroBaileys,
      auth: {
        creds: state.creds,
        /**
         * Caché de claves por delante de Postgres. Sin ella, cada mensaje
         * dispara varias consultas a la base; con una base remota, eso se
         * nota en el tiempo de respuesta.
         */
        keys: makeCacheableSignalKeyStore(state.keys, registroBaileys),
      },
      browser: Browsers.appropriate("Desktop"),
      /**
       * Que la línea no aparezca «en línea». A un desconocido que escribe y
       * no recibe respuesta, ver el número activo a todas horas ya le dice
       * que hay un programa detrás.
       */
      markOnlineOnConnect: false,
      /**
       * Sin historial al vincular. Solo interesa lo que llegue a partir de
       * ahora, y traerse conversaciones enteras de un teléfono es más datos
       * personales de los que este sistema tiene por qué guardar.
       */
      syncFullHistory: false,
    });

    conexion.sock = sock;
    conexion.requiereQr = false;
    sock.ev.on("creds.update", guardarCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        conexion.fallos = 0;
        conexion.detalle = "Escanea el código desde WhatsApp → Dispositivos vinculados.";
        const imagen = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        await anotarEstado(lineaId, "qr_listo", { qr: imagen });
        logger.info("[whatsapp] Código QR listo", { lineaId });
      }

      if (connection === "open") {
        conexion.fallos = 0;
        conexion.detalle = null;
        cancelarReintento(conexion);
        const jid = jidNormalizedUser(sock.user?.id || "");
        const telefono = jid.split("@")[0] || null;
        await anotarEstado(lineaId, "conectado", {
          qr: null,
          telefono,
          conectada: true,
        });
        logger.info("[whatsapp] Línea conectada", { lineaId, telefono });
      }

      if (connection === "close") {
        const codigo = (lastDisconnect?.error as any)?.output?.statusCode;
        conexion.sock = null;
        conexion.abriendo = null;

        /**
         * Sesión cerrada desde el teléfono, o número bloqueado. En ninguno de
         * los dos casos sirve reintentar: las credenciales están muertas y
         * insistir con ellas solo añade ruido a ojos de WhatsApp.
         */
        if (codigo === DisconnectReason.loggedOut) {
          await borrarCredenciales(sessionId);
          conexion.requiereQr = true;
          conexion.detalle =
            "La sesión se cerró desde el teléfono. Hay que escanear el QR otra vez.";
          await anotarEstado(lineaId, "desconectado", { qr: null });
          logger.warn("[whatsapp] Sesión cerrada desde el teléfono", { lineaId });
          return;
        }

        if (codigo === DisconnectReason.forbidden) {
          conexion.requiereQr = true;
          conexion.detalle = "WhatsApp bloqueó este número.";
          await anotarEstado(lineaId, "baneado", { qr: null });
          logger.error("[whatsapp] Número bloqueado por WhatsApp", { lineaId });
          return;
        }

        conexion.fallos += 1;
        conexion.detalle =
          (lastDisconnect?.error as Error | undefined)?.message ||
          `Conexión cerrada (${codigo ?? "sin código"})`;
        await anotarEstado(lineaId, "desconectado", { qr: null });
        logger.warn("[whatsapp] Conexión cerrada", {
          lineaId,
          codigo,
          detalle: conexion.detalle,
        });
        programarReintento(lineaId);
      }
    });
  })();

  try {
    await conexion.abriendo;
  } catch (error) {
    conexion.sock = null;
    conexion.fallos += 1;
    conexion.detalle = String(error);
    await anotarEstado(lineaId, "desconectado", { qr: null });
    logger.error("[whatsapp] No se pudo abrir la línea", { lineaId, error: String(error) });
    programarReintento(lineaId);
  } finally {
    /**
     * Solo se suelta el cerrojo si el socket sigue vivo. Si se cayó durante
     * el intento, el manejador de `close` ya lo soltó y ya programó el
     * reintento.
     */
    if (conexion.sock) conexion.abriendo = null;
  }
}

/**
 * Cierra el socket sin borrar las credenciales. La línea sigue vinculada y
 * volverá a conectar en el siguiente latido.
 */
export async function cerrarLinea(lineaId: number): Promise<void> {
  const conexion = conexionDe(lineaId);
  cancelarReintento(conexion);
  try {
    conexion.sock?.end(undefined);
  } catch {
    /* ya estaba cerrado */
  }
  conexion.sock = null;
  conexion.abriendo = null;
  await anotarEstado(lineaId, "desconectado", { qr: null });
}

/**
 * Desvincula el dispositivo: cierra sesión en el teléfono y borra las
 * credenciales. Después de esto hace falta escanear un QR nuevo.
 */
export async function desvincularLinea(lineaId: number): Promise<void> {
  const conexion = conexionDe(lineaId);
  cancelarReintento(conexion);
  try {
    await conexion.sock?.logout();
  } catch {
    /* si el socket ya no responde, basta con borrar las credenciales */
  }
  conexion.sock = null;
  conexion.abriendo = null;
  conexion.requiereQr = true;
  await borrarCredenciales(sesionDe(lineaId));
  await anotarEstado(lineaId, "desconectado", { qr: null });
  logger.info("[whatsapp] Línea desvinculada", { lineaId });
}

/** Lo que el panel necesita saber y la base no guarda. */
export function estadoEnMemoria(lineaId: number) {
  const conexion = conexiones.get(lineaId);
  return {
    viva: Boolean(conexion?.sock),
    fallos: conexion?.fallos ?? 0,
    detalle: conexion?.detalle ?? null,
    requiereQr: conexion?.requiereQr ?? false,
  };
}

/**
 * Reabre las líneas que ya están vinculadas. Es lo que llama el latido del
 * cron, y el motivo de que exista: en el alojamiento compartido la aplicación
 * se apaga sola, y sin alguien que la despierte la línea queda muda.
 *
 * Solo se reconecta lo que tiene credenciales guardadas. Una línea que nunca
 * se vinculó no debe abrir sockets por su cuenta: estaría generando códigos
 * QR que nadie mira.
 */
export async function reabrirLineasVinculadas(): Promise<
  { lineaId: number; estado: EstadoLinea }[]
> {
  const lineas = await prisma.lineaWhatsapp.findMany({ select: { id: true } });
  const resultado: { lineaId: number; estado: EstadoLinea }[] = [];

  for (const { id } of lineas) {
    const conexion = conexionDe(id);

    if (conexion.requiereQr) {
      resultado.push({ lineaId: id, estado: conexion.estado });
      continue;
    }

    if (!(await tieneCredenciales(sesionDe(id)))) continue;

    if (!conexion.sock && !conexion.abriendo && !conexion.reintento) {
      await abrirLinea(id);
    }

    resultado.push({ lineaId: id, estado: conexionDe(id).estado });
  }

  return resultado;
}
