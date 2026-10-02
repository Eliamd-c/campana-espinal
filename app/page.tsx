import { redirect } from "next/navigation";
import { sesionConPermisos } from "@/lib/auth/permisos-sesion";
import { rutaDeInicio } from "@/lib/permisos";

/**
 * La puerta de entrada.
 *
 * Antes redirigía siempre a `/login`, sin mirar la sesión: tras un acceso
 * correcto, el login mandaba a `/` y esto devolvía otra vez a `/login`. El
 * resultado era que con las credenciales correctas la pantalla «solo se
 * recargaba». Ahora, con sesión, cada cuenta entra por la primera puerta que
 * tenga abierta; sin sesión, va al login.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const cuenta = await sesionConPermisos();
  if (!cuenta) redirect("/login");

  redirect(rutaDeInicio(cuenta.permisos));
}
