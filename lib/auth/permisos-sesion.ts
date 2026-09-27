import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

/**
 * Los permisos de quien está mirando, para las pantallas.
 *
 * Es el equivalente de `exigirPermiso` para el lado visual, y la diferencia
 * importa: aquello **impide** una acción, esto solo decide qué se pinta.
 * Ocultar un botón es comodidad; lo que de verdad protege los datos sigue
 * siendo la comprobación de la ruta de API, que no se toca.
 *
 * Existe porque el menú mostraba los once módulos a todo el mundo. A una
 * cuenta con acceso solo a la agenda —la de quien lleva la agenda del
 * candidato— eso le enseñaba diez puertas cerradas, y la primera pantalla al
 * entrar era un tablero lleno de errores.
 *
 * Los permisos se leen de la base y no del token de sesión, por el mismo
 * motivo que en `exigirPermiso`: quitar un permiso surte efecto de inmediato
 * y no cuando caduque la sesión.
 */
export interface SesionConPermisos {
  usuarioId: string;
  username: string | null;
  nombre: string | null;
  permisos: string[];
}

export async function sesionConPermisos(): Promise<SesionConPermisos | null> {
  const session = await getServerSession(authOptions);
  const usuarioId = (session?.user as { id?: string } | undefined)?.id;
  if (!usuarioId) return null;

  const cuenta = await prisma.user.findUnique({
    where: { id: usuarioId },
    select: { id: true, username: true, name: true, activo: true, permisos: true },
  });

  if (!cuenta || !cuenta.activo) return null;

  return {
    usuarioId: cuenta.id,
    username: cuenta.username,
    nombre: cuenta.name,
    permisos: cuenta.permisos,
  };
}
