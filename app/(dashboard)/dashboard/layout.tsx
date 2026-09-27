import { redirect } from "next/navigation";
import { sesionConPermisos } from "@/lib/auth/permisos-sesion";
import { rutaDeInicio, tienePermiso, PERMISOS } from "@/lib/permisos";

/**
 * El tablero del padrón no es para todo el mundo.
 *
 * Muestra el resumen de contactos y el asistente de análisis. Quien no puede
 * ver informes no debería aterrizar aquí para encontrarse la pantalla vacía y
 * media docena de peticiones rechazadas: se le lleva a lo suyo.
 *
 * La comprobación va en un layout de servidor porque la página es de cliente
 * y no puede decidir esto antes de pintarse.
 */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cuenta = await sesionConPermisos();
  if (!cuenta) redirect("/login");

  if (!tienePermiso(cuenta.permisos, PERMISOS.INFORMES_VER)) {
    redirect(rutaDeInicio(cuenta.permisos));
  }

  return <>{children}</>;
}
