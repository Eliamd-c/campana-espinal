"use client";

import { GRUPOS_DE_PERMISOS } from "@/lib/permisos";

/**
 * Casillas para conceder permisos.
 *
 * Cada casilla dice lo que concede en lenguaje llano, no el nombre técnico:
 * quien crea una cuenta tiene que entender qué está dando. Los permisos que
 * más daño hacen si esa cuenta se compromete llevan una advertencia visible,
 * porque la diferencia entre «ver una ficha» y «descargar el padrón entero»
 * no se aprecia leyendo `contactos.exportar`.
 */
export function SelectorPermisos({
  seleccionados,
  onCambiar,
  deshabilitado = false,
}: {
  seleccionados: string[];
  onCambiar: (permisos: string[]) => void;
  deshabilitado?: boolean;
}) {
  function alternar(permiso: string) {
    onCambiar(
      seleccionados.includes(permiso)
        ? seleccionados.filter((p) => p !== permiso)
        : [...seleccionados, permiso]
    );
  }

  return (
    <div className="space-y-5">
      {GRUPOS_DE_PERMISOS.map((grupo) => (
        <fieldset key={grupo.grupo} className="border border-gray-200 rounded-md p-4">
          <legend className="text-sm font-medium text-gray-900 px-1">{grupo.grupo}</legend>

          <div className="space-y-3 mt-2">
            {grupo.permisos.map(({ permiso, etiqueta, advertencia }) => (
              <label
                key={permiso}
                className={`flex items-start gap-3 ${deshabilitado ? "opacity-50" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={seleccionados.includes(permiso)}
                  onChange={() => alternar(permiso)}
                  disabled={deshabilitado}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <span className="text-sm">
                  <span className="text-gray-900">{etiqueta}</span>
                  {advertencia && (
                    <span className="block text-amber-700 text-xs mt-0.5">⚠ {advertencia}</span>
                  )}
                  <span className="block text-gray-400 text-xs font-mono mt-0.5">{permiso}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <p className="text-xs text-gray-500">
        Sin ninguna casilla marcada, la cuenta puede entrar pero no ve nada. Es
        el punto de partida a propósito: se concede lo que hace falta, no se
        quita lo que sobra.
      </p>
    </div>
  );
}
