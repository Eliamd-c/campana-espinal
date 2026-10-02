"use client";

import { useState, memo } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { NavLink } from "./NavLink";
import { modulosVisibles } from "@/lib/permisos";
import {
  BarChart3,
  Camera,
  Users,
  Calendar,
  Star,
  MessageSquare,
  Smartphone,
  Vote,
  Link2,
  Sparkles,
  BookOpen,
  KeyRound,
  Landmark,
  Circle,
  type LucideIcon,
} from "lucide-react";

/**
 * Iconos de verdad, no emojis.
 *
 * Un emoji lo dibuja el sistema operativo: cambia de forma y de color entre
 * un Android y un iPhone, no hereda el color del texto y no se puede alinear
 * con el resto. En una herramienta de trabajo se nota, y se nota como
 * descuido.
 */
const ICONOS: Record<string, LucideIcon> = {
  chart: BarChart3,
  camara: Camera,
  personas: Users,
  calendario: Calendar,
  estrella: Star,
  concejo: Landmark,
  mensaje: MessageSquare,
  telefono: Smartphone,
  urna: Vote,
  enlace: Link2,
  chispa: Sparkles,
  libro: BookOpen,
  candado: KeyRound,
};

/**
 * El menú solo muestra lo que la cuenta puede abrir.
 *
 * Antes estaban los once módulos fijos para todo el mundo. A quien solo lleva
 * la agenda eso le enseñaba diez puertas que se cierran al tocarlas: los
 * datos estaban protegidos —eso lo hacen las rutas de API—, pero la
 * experiencia era la de alguien a quien no se le tiene confianza.
 */
interface DashboardSidebarProps {
  session: any;
  permisos: string[];
}

export const DashboardSidebar = memo(function Sidebar({
  session,
  permisos,
}: DashboardSidebarProps) {
  const navigation = modulosVisibles(permisos).map((m) => ({
    name: m.nombre,
    href: m.ruta,
    Icono: ICONOS[m.icono] ?? Circle,
  }));
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Prefetch generator for contacts
  const prefetchContactos = () => ({
    queryKey: ["contactos", 1, "", "", "", "", ""],
    queryFn: async () => {
      const res = await fetch("/api/contactos?page=1&limit=50");
      return res.json();
    },
  });

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="w-full md:w-64 bg-white shadow-md flex-shrink-0 flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-gray-200 bg-emerald-700">
          <h1 className="text-xl font-bold text-white">Campaña Espinal</h1>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const isContactos = item.href === "/contactos";

            return (
              <NavLink
                key={item.name}
                href={item.href}
                prefetchFn={isContactos ? prefetchContactos : undefined}
                className={`flex items-center px-2 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 border-l-4 border-emerald-700 shadow-sm"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <item.Icono className="mr-3 w-5 h-5 shrink-0" aria-hidden="true" />
                {item.name}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="overflow-hidden mr-2">
              <p className="text-sm font-bold text-gray-700 truncate">
                {session?.user?.name || "Usuario"}
              </p>
              <p className="text-xs text-gray-500 capitalize truncate">
                {session?.user?.role || "Rol"}
              </p>
            </div>
            <button
              onClick={() => signOut()}
              className="text-xs text-red-600 hover:text-white hover:bg-red-600 px-2 py-1 rounded transition-colors flex-shrink-0"
            >
              Salir
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Header & Menu */}
      <div className="md:hidden flex flex-col w-full">
        <div className="bg-emerald-700 shadow-sm h-16 flex items-center justify-between px-4 border-b border-emerald-800">
          <h1 className="text-lg font-bold text-white">Campaña Espinal</h1>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-white hover:bg-emerald-600 p-2 rounded-md"
          >
            <span className="text-2xl">{mobileMenuOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="bg-white border-b border-gray-200 py-2 shadow-xl animate-in slide-in-from-top duration-200">
            {navigation.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const isContactos = item.href === "/contactos";

              return (
                <NavLink
                  key={item.name}
                  href={item.href}
                  prefetchFn={isContactos ? prefetchContactos : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center px-6 py-3 text-base font-medium ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <item.Icono className="mr-3 w-5 h-5 shrink-0" aria-hidden="true" />
                  {item.name}
                </NavLink>
              );
            })}
            <div className="border-t border-gray-100 p-4 bg-gray-50 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">
                {session?.user?.role || "Rol"}: {session?.user?.name || "Usuario"}
              </span>
              <button onClick={() => signOut()} className="text-red-600 text-sm font-bold">Cerrar Sesión</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}, (prevProps, nextProps) => {
  // Only re-render if user session role or name changes
  return (
    prevProps.session?.user?.name === nextProps.session?.user?.name &&
    prevProps.session?.user?.role === nextProps.session?.user?.role &&
    prevProps.permisos.join() === nextProps.permisos.join()
  );
});
