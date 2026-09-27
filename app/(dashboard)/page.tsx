import { redirect } from "next/navigation";
import { sesionConPermisos } from "@/lib/auth/permisos-sesion";
import { rutaDeInicio } from "@/lib/permisos";

/**
 * La puerta de entrada.
 *
 * Antes mandaba a todo el mundo a `/dashboard`, el tablero del padrón. Quien
 * solo lleva la agenda aterrizaba en una pantalla que no puede leer, llena de
 * peticiones rechazadas. Ahora cada cuenta entra por la primera puerta que
 * tenga abierta.
 */
export const dynamic = "force-dynamic";

export default async function RootDashboardPage() {
  const cuenta = await sesionConPermisos();
  if (!cuenta) redirect("/login");

  redirect(rutaDeInicio(cuenta.permisos));
}
