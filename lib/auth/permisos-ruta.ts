import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { Permiso, tienePermiso } from "@/lib/permisos";

/**
 * Comprobación de permisos para las rutas de API.
 *
 * Se hace aquí, en el servidor, y no en el navegador. El middleware valida
 * que haya sesión pero no puede consultar permisos: corre en un entorno sin
 * acceso a la base. Ocultar botones en la interfaz es comodidad; lo que
 * impide de verdad una acción es esta comprobación, porque una petición
 * directa con `curl` se salta cualquier pantalla.
 */

export interface Autorizado {
  usuarioId: string;
  username: string | null;
  permisos: string[];
}

type Resultado =
  | { ok: true; quien: Autorizado }
  | { ok: false; respuesta: NextResponse };

/**
 * Exige que la petición venga de una cuenta con el permiso indicado.
 *
 * Los permisos se leen de la base en cada petición, no del token: así, quitar
 * un permiso surte efecto de inmediato y no cuando caduque la sesión. Es el
 * mismo motivo por el que se revalida el estado de la cuenta.
 */
export async function exigirPermiso(permiso: Permiso): Promise<Resultado> {
  const session = await getServerSession(authOptions);
  const usuarioId = (session?.user as any)?.id as string | undefined;

  if (!usuarioId) {
    return {
      ok: false,
      respuesta: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  const cuenta = await prisma.user.findUnique({
    where: { id: usuarioId },
    select: { id: true, username: true, permisos: true, activo: true },
  });

  if (!cuenta || !cuenta.activo) {
    return {
      ok: false,
      respuesta: NextResponse.json({ error: "Cuenta no disponible" }, { status: 401 }),
    };
  }

  if (!tienePermiso(cuenta.permisos, permiso)) {
    /**
     * Se registra el intento: alguien pidiendo algo para lo que no tiene
     * permiso es, o una pantalla mal montada, o alguien probando puertas.
     * Ambas cosas conviene saberlas.
     */
    logger.warn("[permisos] Acceso denegado", {
      usuario: cuenta.username,
      permiso,
    });

    return {
      ok: false,
      respuesta: NextResponse.json(
        { error: "No tienes permiso para esta acción", permiso_requerido: permiso },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    quien: { usuarioId: cuenta.id, username: cuenta.username, permisos: cuenta.permisos },
  };
}

/**
 * Igual que la anterior, pero basta con tener uno de varios permisos. Sirve
 * para rutas que valen tanto para quien captura como para quien consulta.
 */
export async function exigirAlgunPermiso(permisos: Permiso[]): Promise<Resultado> {
  for (const permiso of permisos) {
    const intento = await exigirPermiso(permiso);
    if (intento.ok) return intento;
  }

  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) {
    return {
      ok: false,
      respuesta: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  return {
    ok: false,
    respuesta: NextResponse.json(
      { error: "No tienes permiso para esta acción", permisos_requeridos: permisos },
      { status: 403 }
    ),
  };
}
