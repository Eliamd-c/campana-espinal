import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardSidebar } from "./components/DashboardSidebar";
import { DashboardHeader } from "./components/DashboardHeader";
import { PermisosProvider } from "./components/PermisosProvider";
import { sesionConPermisos } from "@/lib/auth/permisos-sesion";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch session on the server for ultra-fast initial paint
  const session = await getServerSession(authOptions);

  /**
   * Los permisos se leen aquí una vez y bajan al menú y a las pantallas. Se
   * leen de la base, no del token: quitarle un permiso a alguien surte efecto
   * en cuanto recargue, sin esperar a que caduque su sesión.
   */
  const cuenta = await sesionConPermisos();
  const permisos = cuenta?.permisos ?? [];

  // Segunda capa tras el middleware: si este layout se renderizara sin sesion,
  // el dashboard entero quedaria a la vista. No se pinta nada sin sesion.
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* Sidebar Component (Handles both Desktop & Mobile Views) */}
      <DashboardSidebar session={session} permisos={permisos} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Component (Handles smart search) */}
        <DashboardHeader />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-10 max-w-7xl mx-auto w-full">
          <PermisosProvider permisos={permisos}>{children}</PermisosProvider>
        </main>
      </div>
    </div>
  );
}
