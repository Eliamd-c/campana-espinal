import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

/**
 * Reglas de acceso a los datos de votantes.
 *
 * El padrón son 5.985 personas con su cédula, su teléfono y su intención de
 * voto. Bajo la Ley 1581, la intención política es **dato sensible**: exige
 * autorización expresa y protección reforzada. Lo que sigue parte de dos
 * ideas:
 *
 *  1. Nadie necesita el padrón entero de una vez. Quien lo pide en bloque o
 *     está exportando, o está extrayendo.
 *  2. Los accesos masivos dejan rastro. Si un día se filtran los datos, la
 *     diferencia entre saber quién los sacó y no saberlo está aquí.
 */

/** Registros que se pueden pedir en una sola petición. */
export const MAXIMO_POR_PAGINA = 200;

/** Valor por defecto cuando no se pide nada en concreto. */
export const POR_DEFECTO = 50;

/**
 * A partir de cuántos registros se considera que un acceso es masivo y se
 * anota en la auditoría. Consultar una ficha o una pantalla de resultados es
 * trabajo normal; barrer cientos de personas, no.
 */
export const UMBRAL_ACCESO_MASIVO = 100;

/**
 * Acota el tamaño de página que pide el cliente.
 *
 * Antes se hacía `Number(searchParams.get("limit")) || 50`, sin tope: con
 * `?limit=999999` una sola petición devolvía las 5.985 cédulas.
 */
export function limitarPagina(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return POR_DEFECTO;
  return Math.min(Math.trunc(n), MAXIMO_POR_PAGINA);
}

export interface AccesoADatos {
  /** Quién consulta. Sale de la sesión, nunca de la petición. */
  usuarioId: string;
  /** Qué ruta se consultó. */
  ruta: string;
  /** Cuántos registros se devolvieron. */
  registros: number;
  /** Filtros aplicados, sin datos personales dentro. */
  filtros?: Record<string, unknown>;
}

/**
 * Deja constancia de un acceso masivo a datos personales.
 *
 * Se guarda qué se consultó y cuánto, nunca el contenido: un registro de
 * auditoría que copie las cédulas convierte la propia auditoría en una
 * segunda copia del padrón.
 *
 * No interrumpe la petición si falla: perder una anotación es malo, pero
 * dejar a la campaña sin poder consultar sus datos por un fallo de escritura
 * lo es más.
 */
export async function registrarAccesoADatos(acceso: AccesoADatos): Promise<void> {
  if (acceso.registros < UMBRAL_ACCESO_MASIVO) return;

  try {
    await prisma.auditoria.create({
      data: {
        tabla: "contactos",
        accion: "consulta_masiva",
        usuario_id: acceso.usuarioId,
        datos_despues: {
          ruta: acceso.ruta,
          registros: acceso.registros,
          filtros: acceso.filtros ?? {},
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    logger.warn("[datos] No se pudo registrar el acceso", { error: String(error) });
  }
}
