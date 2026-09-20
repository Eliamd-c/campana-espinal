import { obtenerConfig, type ClaveConfig } from "@/lib/configuracion";
import { logger } from "@/lib/logger";

/**
 * Elección de proveedor de IA, con relevo automático.
 *
 * El sistema tiene que seguir funcionando cuando a un proveedor se le acaba
 * el crédito. Eso no es una hipótesis: pasó, y con Gemini agotado el escáner
 * de planillas dejaba de leer aunque hubiera una clave de OpenAI configurada.
 *
 * De ahí las dos piezas de este archivo:
 *
 *  - Cada módulo puede fijar su proveedor, o dejar «auto» y seguir al
 *    general. Dos trabajos distintos -leer cédulas manuscritas de una foto y
 *    ordenar una frase- no tienen por qué ganarlos el mismo servicio.
 *  - Si el preferido falla por cupo o por clave, se intenta con el otro. Solo
 *    por esos motivos: si el modelo devuelve una respuesta mala, repetirla en
 *    el otro proveedor gastaría el doble para obtener otra respuesta mala.
 */

export type Proveedor = "gemini" | "openai";

export type ModuloIA = "ocr" | "agenda" | "analisis";

const AJUSTE_POR_MODULO: Record<ModuloIA, ClaveConfig> = {
  ocr: "PROVEEDOR_IA_OCR",
  agenda: "PROVEEDOR_IA_AGENDA",
  analisis: "PROVEEDOR_IA_ANALISIS",
};

const CLAVE_API: Record<Proveedor, ClaveConfig> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
};

export interface IntentoProveedor {
  proveedor: Proveedor;
  apiKey: string;
}

function esProveedor(valor: string | null): valor is Proveedor {
  return valor === "gemini" || valor === "openai";
}

/**
 * Devuelve los proveedores a intentar, en orden, ya con su clave.
 *
 * Un proveedor sin clave no entra en la lista: intentarlo solo serviría para
 * cambiar un error de cupo por uno de autenticación. Si la lista vuelve
 * vacía, es que no hay ninguna clave configurada y quien llama debe decirlo
 * con claridad, no fingir un fallo del modelo.
 */
export async function proveedoresDisponibles(modulo: ModuloIA): Promise<IntentoProveedor[]> {
  const delModulo = await obtenerConfig(AJUSTE_POR_MODULO[modulo]);
  const general = await obtenerConfig("PROVEEDOR_IA");

  const preferido: Proveedor = esProveedor(delModulo)
    ? delModulo
    : esProveedor(general)
      ? general
      : "gemini";

  const alternativo: Proveedor = preferido === "gemini" ? "openai" : "gemini";

  const intentos: IntentoProveedor[] = [];

  for (const proveedor of [preferido, alternativo]) {
    const apiKey = await obtenerConfig(CLAVE_API[proveedor]);
    // "dummy_key" es el relleno que usan los entornos sin IA configurada.
    if (apiKey && apiKey !== "dummy_key") {
      intentos.push({ proveedor, apiKey });
    }
  }

  return intentos;
}

/**
 * ¿Merece la pena reintentar con el otro proveedor?
 *
 * Solo cuando el problema es de acceso o de cupo: sin crédito (429), clave
 * mala o caducada (401/403), o el servicio caído (5xx). Un 400 significa que
 * la petición estaba mal construida y repetirla en otro sitio dará igual.
 */
export function convieneRelevar(status: number, cuerpo?: string): boolean {
  if (status === 429 || status === 401 || status === 403) return true;
  if (status >= 500) return true;

  const texto = (cuerpo ?? "").toLowerCase();
  return (
    texto.includes("resource_exhausted") ||
    texto.includes("insufficient_quota") ||
    texto.includes("quota") ||
    texto.includes("billing")
  );
}

/** Deja constancia del relevo: si pasa a menudo, es que hay que recargar. */
export function registrarRelevo(modulo: ModuloIA, de: Proveedor, a: Proveedor, motivo: string) {
  logger.warn("[ia] Relevo de proveedor", { modulo, de, a, motivo });
}
