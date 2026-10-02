import { redirect } from "next/navigation";

/**
 * La puerta de entrada.
 *
 * Antes redirigía a `/login` sin mirar la sesión: como el login manda a `/`
 * tras autenticar, un acceso correcto rebotaba otra vez a `/login` y la
 * pantalla «solo se recargaba». Ahora manda a `/dashboard`, y es el layout
 * del panel quien exige la sesión: sin ella, redirige a `/login`; con ella,
 * entra.
 *
 * Se deja como una redirección síncrona, sin tocar base de datos ni sesión
 * aquí, para que esta ruta no pese nada al compilar. El reparto por permisos
 * ya lo resuelve el propio panel.
 */
export default function Home() {
  redirect("/dashboard");
}
