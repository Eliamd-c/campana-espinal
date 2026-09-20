import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Verificación de origen para los webhooks entrantes.
 *
 * Estas rutas son públicas por necesidad: quien las llama es un proveedor
 * externo que no puede traer una sesión de usuario. El middleware las deja
 * pasar, así que esto es lo único que separa a Evolution API de cualquiera
 * que conozca la URL. Sin ello se pueden inyectar mensajes falsos, marcar
 * líneas como caídas y disparar respuestas de IA a números arbitrarios.
 */

export type ResultadoVerificacion =
  | { ok: true }
  | { ok: false; motivo: string };

/**
 * Compara dos secretos sin que el tiempo empleado revele cuántos caracteres
 * coinciden. Se comparan los hashes y no los valores para que `timingSafeEqual`
 * reciba siempre buffers del mismo tamaño: con longitudes distintas lanzaría,
 * y esa excepción ya sería en sí misma una filtración.
 */
function coincideEnTiempoConstante(recibido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/**
 * Exige que la petición traiga el secreto compartido del webhook.
 *
 * Si la variable de entorno no está configurada, se rechaza todo: un webhook
 * sin secreto configurado es un webhook abierto, y prefiero que deje de
 * funcionar visiblemente a que siga aceptando a cualquiera en silencio.
 *
 * @param cabeceras nombres aceptados, en orden de preferencia. Distintos
 *   proveedores usan distintos nombres y Evolution API permite configurar el
 *   suyo en los headers del webhook.
 */
export function verificarSecretoWebhook(
  req: NextRequest,
  nombreVariable: string,
  cabeceras: string[] = ["x-webhook-secret", "x-internal-secret", "apikey", "authorization"]
): ResultadoVerificacion {
  const esperado = process.env[nombreVariable];

  if (!esperado || esperado.length < 16) {
    logger.error("[webhook] Secreto no configurado; se rechaza la petición", {
      variable: nombreVariable,
    });
    return {
      ok: false,
      motivo: `${nombreVariable} no está configurado o es demasiado corto`,
    };
  }

  /**
   * Un secreto compartido que se puede adivinar no es un secreto. Una frase
   * como `webhook_secreto_campana_2024` la escribe cualquiera que conozca el
   * proyecto, y con ella se inyectan mensajes entrantes falsos.
   */
  if (/secreto|secret|webhook|campana|espinal|password|clave|12345/i.test(esperado)) {
    logger.error("[webhook] El secreto configurado es predecible; se rechaza la petición", {
      variable: nombreVariable,
    });
    return {
      ok: false,
      motivo: `${nombreVariable} contiene palabras predecibles; genera uno con 'openssl rand -base64 24'`,
    };
  }

  for (const cabecera of cabeceras) {
    const valorBruto = req.headers.get(cabecera);
    if (!valorBruto) continue;

    // `Authorization: Bearer <secreto>` es la forma habitual de enviarlo.
    const valor = valorBruto.replace(/^Bearer\s+/i, "").trim();

    if (coincideEnTiempoConstante(valor, esperado)) {
      return { ok: true };
    }
  }

  logger.warn("[webhook] Petición rechazada por secreto inválido o ausente", {
    ruta: req.nextUrl.pathname,
    ip: req.ip ?? "desconocida",
    userAgent: req.headers.get("user-agent"),
  });

  return { ok: false, motivo: "Secreto de webhook inválido o ausente" };
}

/**
 * Identificadores de eventos ya procesados, con el momento en que llegaron.
 *
 * Un secreto compartido demuestra quién envía, pero no impide que la misma
 * petición se reenvíe una y otra vez: quien capture una legítima puede
 * duplicar mensajes entrantes y volver a disparar respuestas automáticas.
 */
const vistos = new Map<string, number>();

/** Ventana durante la que se recuerda un evento. */
const VENTANA_REPLAY_MS = 10 * 60 * 1000;

/** Tope de identificadores guardados, para que el mapa no crezca sin fin. */
const MAX_VISTOS = 20_000;

/**
 * ¿Es la primera vez que llega este evento?
 *
 * Devuelve `false` si ya se procesó en los últimos minutos. El identificador
 * lo aporta el proveedor (el id del mensaje de WhatsApp, por ejemplo), que es
 * único por evento.
 */
export function esEventoNuevo(identificador: string | null | undefined): boolean {
  if (!identificador) {
    // Sin identificador no se puede saber: se deja pasar, porque rechazar
    // sería peor (se perderían mensajes legítimos).
    return true;
  }

  const ahora = Date.now();
  const anterior = vistos.get(identificador);

  if (anterior !== undefined && ahora - anterior < VENTANA_REPLAY_MS) {
    logger.warn("[webhook] Evento repetido, se descarta", { identificador });
    return false;
  }

  vistos.set(identificador, ahora);

  if (vistos.size > MAX_VISTOS) {
    const caducados: string[] = [];
    for (const clave of Array.from(vistos.keys())) {
      const cuando = vistos.get(clave);
      if (cuando === undefined || ahora - cuando > VENTANA_REPLAY_MS) {
        caducados.push(clave);
      }
    }
    for (const clave of caducados) vistos.delete(clave);

    // Si aún así no baja (avalancha de eventos frescos), se vacía: perder la
    // memoria de replay es menos grave que quedarse sin memoria.
    if (vistos.size > MAX_VISTOS) vistos.clear();
  }

  return true;
}
