"use client";

import { createContext, useContext } from "react";

/**
 * Los permisos de quien mira, disponibles en las pantallas.
 *
 * Sirve para ocultar lo que una cuenta no puede usar: una pestaña, un botón.
 * No protege nada —de eso se encargan las rutas de API, que comprueban en el
 * servidor—, pero evita lo que pasaba hasta ahora: que alguien viera media
 * aplicación llena de puertas que devuelven un error al tocarlas.
 */
const PermisosContext = createContext<string[]>([]);

export function PermisosProvider({
  permisos,
  children,
}: {
  permisos: string[];
  children: React.ReactNode;
}) {
  return <PermisosContext.Provider value={permisos}>{children}</PermisosContext.Provider>;
}

/** Todos los permisos de la cuenta. */
export function usePermisos(): string[] {
  return useContext(PermisosContext);
}

/** ¿Puede esta cuenta hacer esto? */
export function usePuede(permiso: string): boolean {
  return useContext(PermisosContext).includes(permiso);
}
