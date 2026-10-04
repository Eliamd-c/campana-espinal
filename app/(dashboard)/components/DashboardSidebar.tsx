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
  Menu,
  X,
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
      <div className="w-full md:w-64 bg-surface border-r border-line flex-shrink-0 flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-brand-700 bg-brand">
          <h1 className="text-xl font-display font-extrabold tracking-tight text-white">Campaña Espinal</h1>
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
                    ? "bg-brand-50 text-brand border-l-4 border-brand shadow-sm"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <item.Icono className="mr-3 w-5 h-5 shrink-0" aria-hidden="true" />
                {item.name}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-4 border-t border-line bg-surface-2">
          <div className="flex items-center justify-between">
            <div className="overflow-hidden mr-2">
              <p className="text-sm font-bold text-ink truncate">
                {session?.user?.name || "Usuario"}
              </p>
              <p className="text-xs text-ink-muted capitalize truncate">
                {session?.user?.role || "Rol"}
              </p>
            </div>
            <button
              onClick={() => signOut()}
              className="text-xs text-neg hover:text-white hover:bg-neg px-2 py-1 rounded transition-colors flex-shrink-0"
            >
              Salir
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Header & Menu */}
      <div className="md:hidden flex flex-col w-full">
        <div className="bg-brand shadow-sm h-16 flex items-center justify-between px-4 border-b border-brand-700">
          <h1 className="text-lg font-display font-extrabold tracking-tight text-white">Campaña Espinal</h1>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-white hover:bg-brand-700 p-2 rounded-md"
            aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="bg-surface border-b border-line py-2 shadow-xl animate-in slide-in-from-top duration-200">
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
                      ? "bg-brand-50 text-brand"
                      : "text-ink-muted hover:bg-surface-2"
                  }`}
                >
                  <item.Icono className="mr-3 w-5 h-5 shrink-0" aria-hidden="true" />
                  {item.name}
                </NavLink>
              );
            })}
            <div className="border-t border-line p-4 bg-surface-2 flex justify-between items-center">
              <span className="text-sm font-medium text-ink-muted">
                {session?.user?.role || "Rol"}: {session?.user?.name || "Usuario"}
              </span>
              <button onClick={() => signOut()} className="text-neg text-sm font-bold">Cerrar Sesión</button>
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
