import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Configuración guardada en base de datos.
 *
 * Permite cambiar claves de API desde el panel sin tocar el entorno del
 * hosting. A cambio obliga a tres cosas, porque una clave de API en una tabla
 * es un secreto en un sitio donde normalmente no se esperan secretos:
 *
 *  1. Los valores sensibles se guardan **cifrados**. Quien lea la tabla -- un
 *     respaldo, una consulta, una fuga -- no obtiene la clave.
 *  2. Nunca se devuelven por la API. La pantalla muestra «configurada» o «sin
 *     configurar», nada más. Una clave que no sale del servidor no se puede
 *     copiar desde el navegador.
 *  3. Solo se pueden escribir claves del catálogo de abajo. Sin esto, la
 *     tabla se convierte en un almacén de cualquier cosa.
 */

/** Claves admitidas. Lo que no esté aquí se rechaza. */
export const CLAVES_CONFIG = {
  PROVEEDOR_IA: {
    etiqueta: "Proveedor de IA",
    sensible: false,
    opciones: ["gemini", "openai"] as const,
    ayuda: "Qué servicio interpreta el texto de los agendamientos.",
  },
  GEMINI_API_KEY: {
    etiqueta: "Clave de Google Gemini",
    sensible: true,
    ayuda: "Se guarda cifrada y no se muestra después de grabarla.",
  },
  OPENAI_API_KEY: {
    etiqueta: "Clave de OpenAI",
    sensible: true,
    ayuda: "Se guarda cifrada y no se muestra después de grabarla.",
  },
} as const;

export type ClaveConfig = keyof typeof CLAVES_CONFIG;

export function esClaveValida(clave: string): clave is ClaveConfig {
  return Object.prototype.hasOwnProperty.call(CLAVES_CONFIG, clave);
}

export function esSensible(clave: string): boolean {
  return esClaveValida(clave) && CLAVES_CONFIG[clave].sensible;
}

/**
 * Marca de formato. Distingue un valor cifrado de uno en claro, para poder
 * migrar los que ya estaban guardados sin cifrar.
 */
const PREFIJO = "v1";

function claveDeCifrado(): Buffer {
  const bruta = process.env.CONFIG_ENCRYPTION_KEY;

  if (!bruta) {
    throw new Error(
      "CONFIG_ENCRYPTION_KEY no está definida. Sin ella no se pueden guardar " +
        "ni leer las claves de API. Genera una con `openssl rand -base64 32`."
    );
  }

  const clave = Buffer.from(bruta, "base64");
  if (clave.length !== 32) {
    throw new Error(
      `CONFIG_ENCRYPTION_KEY debe ser de 32 bytes en base64 (son ${clave.length}). ` +
        "Genera una con `openssl rand -base64 32`."
    );
  }

  return clave;
}

/**
 * Cifra con AES-256-GCM. GCM y no CBC porque además de ocultar el valor
 * detecta si alguien lo ha manipulado en la base: al descifrar, un texto
 * alterado falla en vez de devolver basura.
 */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", claveDeCifrado(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const etiqueta = cipher.getAuthTag();

  return [
    PREFIJO,
    iv.toString("base64"),
    etiqueta.toString("base64"),
    cifrado.toString("base64"),
  ].join(":");
}

/** ¿Este valor está cifrado, o quedó en claro de antes? */
export function estaCifrado(valor: string): boolean {
  return valor.startsWith(`${PREFIJO}:`) && valor.split(":").length === 4;
}

export function descifrar(guardado: string): string {
  // Valor antiguo sin cifrar: se devuelve tal cual para no romper nada
  // mientras se migra.
  if (!estaCifrado(guardado)) return guardado;

  const [, ivB64, etiquetaB64, datosB64] = guardado.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    claveDeCifrado(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(etiquetaB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(datosB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Lee una clave de configuración. **Solo para uso en el servidor.**
 *
 * Si no está en la base, cae a la variable de entorno del mismo nombre: así
 * el despliegue sigue funcionando aunque nadie haya entrado al panel.
 */
export async function obtenerConfig(clave: ClaveConfig): Promise<string | null> {
  try {
    const fila = await prisma.configuracionGlobal.findUnique({ where: { clave } });

    if (fila?.valor) {
      return esSensible(clave) ? descifrar(fila.valor) : fila.valor;
    }
  } catch (error) {
    logger.warn("[configuracion] No se pudo leer de la base", {
      clave,
      error: String(error),
    });
  }

  return process.env[clave] ?? null;
}

/** Guarda una clave, cifrándola si es sensible. */
export async function guardarConfig(clave: ClaveConfig, valor: string): Promise<void> {
  const aGuardar = esSensible(clave) ? cifrar(valor) : valor;

  await prisma.configuracionGlobal.upsert({
    where: { clave },
    update: { valor: aGuardar },
    create: { clave, valor: aGuardar },
  });
}

/**
 * Estado de la configuración para la pantalla.
 *
 * De las claves sensibles se dice si están puestas y poco más: los últimos
 * cuatro caracteres, lo justo para reconocer cuál es sin que sirva para nada
 * a quien la vea.
 */
export async function estadoConfiguracion() {
  const filas = await prisma.configuracionGlobal.findMany();
  const porClave = new Map(filas.map((f) => [f.clave, f]));

  return Object.entries(CLAVES_CONFIG).map(([clave, definicion]) => {
    const fila = porClave.get(clave);
    const enEntorno = Boolean(process.env[clave]);
    const sensible = definicion.sensible;

    let pista: string | null = null;
    if (sensible && fila?.valor) {
      try {
        const claro = descifrar(fila.valor);
        pista = claro.length > 4 ? `…${claro.slice(-4)}` : "…";
      } catch {
        pista = null;
      }
    }

    return {
      clave,
      etiqueta: definicion.etiqueta,
      ayuda: definicion.ayuda,
      sensible,
      opciones: "opciones" in definicion ? definicion.opciones : null,
      // El valor solo viaja cuando no es sensible.
      valor: sensible ? null : (fila?.valor ?? process.env[clave] ?? null),
      configurada: Boolean(fila?.valor) || enEntorno,
      origen: fila?.valor ? "base de datos" : enEntorno ? "entorno" : null,
      pista,
      actualizado: fila?.actualizado ?? null,
    };
  });
}
