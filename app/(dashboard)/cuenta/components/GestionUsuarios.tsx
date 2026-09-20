"use client";

import { useEffect, useState } from "react";
import { SelectorPermisos } from "./SelectorPermisos";

interface Usuario {
  id: string;
  username: string | null;
  name: string | null;
  role: string;
  activo: boolean;
  ultimoAcceso: string | null;
  permisos: string[];
}

/**
 * Gestión de cuentas del panel.
 *
 * Visible solo para quien tiene `usuarios.gestionar`, que en la práctica es
 * la cuenta del desarrollador. Ocultarla es comodidad: quien no tenga el
 * permiso recibe 403 del servidor aunque llegue a la pantalla.
 */
export function GestionUsuarios({ miId }: { miId?: string }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [permisosEditados, setPermisosEditados] = useState<string[]>([]);

  const [nuevo, setNuevo] = useState({
    username: "",
    nombre: "",
    rol: "coordinador",
    password: "",
    permisos: [] as string[],
  });

  async function cargar() {
    setCargando(true);
    try {
      const res = await fetch("/api/usuarios");
      if (!res.ok) {
        setAviso({ tipo: "error", texto: "No tienes permiso para gestionar cuentas." });
        setUsuarios([]);
        return;
      }
      const json = await res.json();
      setUsuarios(json.data ?? []);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);

    const res = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuevo),
    });
    const json = await res.json();

    if (!res.ok) {
      setAviso({ tipo: "error", texto: json.error ?? "No se pudo crear la cuenta." });
      return;
    }

    setNuevo({ username: "", nombre: "", rol: "coordinador", password: "", permisos: [] });
    setAviso({
      tipo: "ok",
      texto:
        nuevo.permisos.length === 0
          ? "Cuenta creada sin permisos: podrá entrar pero no verá nada hasta que le concedas algo."
          : `Cuenta creada con ${nuevo.permisos.length} permisos.`,
    });
    cargar();
  }

  async function guardarPermisos(id: string) {
    setAviso(null);
    const res = await fetch("/api/usuarios/permisos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, permisos: permisosEditados }),
    });
    const json = await res.json();

    if (!res.ok) {
      setAviso({ tipo: "error", texto: json.error ?? "No se pudieron guardar los permisos." });
      return;
    }

    setEditando(null);
    setAviso({ tipo: "ok", texto: "Permisos actualizados. El cambio es inmediato." });
    cargar();
  }

  async function cambiarEstado(id: string, activo: boolean) {
    setAviso(null);
    const res = await fetch("/api/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, activo }),
    });
    const json = await res.json();
    if (!res.ok) setAviso({ tipo: "error", texto: json.error ?? "No se pudo actualizar." });
    cargar();
  }

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Cuentas del panel</h2>
      <p className="text-sm text-gray-500 mt-1">
        Cada persona con su propia cuenta y solo los permisos que necesita. Al
        desactivar una, esa persona deja de entrar de inmediato, sin afectar a
        las demás.
      </p>

      {aviso && (
        <p
          className={`text-sm mt-3 ${aviso.tipo === "ok" ? "text-green-700" : "text-red-600"}`}
          role="status"
        >
          {aviso.texto}
        </p>
      )}

      {/* ── Listado ──────────────────────────────────────────────────── */}
      <div className="mt-5 space-y-3">
        {cargando ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : usuarios.length === 0 ? (
          <p className="text-sm text-gray-500">No hay cuentas que mostrar.</p>
        ) : (
          usuarios.map((u) => (
            <div key={u.id} className="border border-gray-200 rounded-md p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {u.username}
                    {u.id === miId && (
                      <span className="ml-2 text-xs text-gray-500">(tu cuenta)</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {u.permisos.length === 0
                      ? "sin permisos: entra pero no ve nada"
                      : `${u.permisos.length} permisos`}
                    {" · último acceso: "}
                    {u.ultimoAcceso
                      ? new Date(u.ultimoAcceso).toLocaleString("es-CO")
                      : "nunca"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      u.activo ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {u.activo ? "activa" : "desactivada"}
                  </span>

                  <button
                    onClick={() => {
                      setEditando(editando === u.id ? null : u.id);
                      setPermisosEditados(u.permisos);
                      setAviso(null);
                    }}
                    className="text-xs underline text-gray-600 hover:text-gray-900"
                  >
                    {editando === u.id ? "Cerrar" : "Permisos"}
                  </button>

                  <button
                    onClick={() => cambiarEstado(u.id, !u.activo)}
                    className="text-xs underline text-gray-600 hover:text-gray-900"
                  >
                    {u.activo ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>

              {editando === u.id && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  {u.id === miId ? (
                    <p className="text-sm text-amber-700">
                      No puedes cambiar tus propios permisos. Tiene que hacerlo
                      otra persona con permiso de gestión de cuentas: así, si
                      alguien entra con tu sesión, no puede ampliarse solo.
                    </p>
                  ) : (
                    <>
                      <SelectorPermisos
                        seleccionados={permisosEditados}
                        onCambiar={setPermisosEditados}
                      />
                      <div className="flex gap-3 mt-4">
                        <button
                          onClick={() => guardarPermisos(u.id)}
                          className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium"
                        >
                          Guardar permisos
                        </button>
                        <button
                          onClick={() => setEditando(null)}
                          className="text-sm text-gray-600 underline"
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── Alta ─────────────────────────────────────────────────────── */}
      <form onSubmit={crear} className="mt-8 border-t border-gray-200 pt-6 space-y-5">
        <h3 className="font-medium text-gray-900">Crear cuenta</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Usuario</span>
            <input
              value={nuevo.username}
              onChange={(e) => setNuevo({ ...nuevo, username: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="nombre.apellido"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">
              Nombre para mostrar
            </span>
            <input
              value={nuevo.nombre}
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña inicial
            </span>
            <input
              type="password"
              value={nuevo.password}
              onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
              autoComplete="new-password"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <span className="block text-xs text-gray-500 mt-1">
              Mínimo 12 caracteres, con mayúsculas, minúsculas y números.
            </span>
          </label>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Qué podrá hacer</p>
          <SelectorPermisos
            seleccionados={nuevo.permisos}
            onCambiar={(permisos) => setNuevo({ ...nuevo, permisos })}
          />
        </div>

        <button
          type="submit"
          disabled={!nuevo.username || !nuevo.password}
          className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-40"
        >
          Crear cuenta
        </button>
      </form>
    </section>
  );
}
