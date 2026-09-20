"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface Usuario {
  id: string;
  username: string | null;
  name: string | null;
  role: string;
  activo: boolean;
  ultimoAcceso: string | null;
}

/**
 * Pantalla de cuenta.
 *
 * Cada persona cambia aquí su contraseña, y quien tenga rol de administrador
 * ve además la gestión de usuarios. Antes no existía nada de esto: había una
 * sola cuenta compartida, así que no se sabía quién hacía qué y no se podía
 * cerrar el acceso a nadie que dejara el equipo.
 */
export default function CuentaPage() {
  const { data: session } = useSession();
  const esAdmin = (session?.user as any)?.role === "admin";

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi cuenta</h1>
        <p className="text-gray-600 mt-1">
          Sesión iniciada como{" "}
          <span className="font-medium">{session?.user?.name ?? "—"}</span>
          {esAdmin && (
            <span className="ml-2 text-xs bg-gray-900 text-white px-2 py-0.5 rounded">
              administrador
            </span>
          )}
        </p>
      </div>

      <CambiarContrasena />
      {esAdmin && <GestionUsuarios />}
    </div>
  );
}

function CambiarContrasena() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado(null);

    if (nueva !== repetida) {
      setEstado({ tipo: "error", texto: "La nueva contraseña y su repetición no coinciden." });
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch("/api/usuarios/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual, nueva }),
      });
      const json = await res.json();

      if (!res.ok) {
        setEstado({ tipo: "error", texto: json.error ?? "No se pudo cambiar la contraseña." });
        return;
      }

      setEstado({ tipo: "ok", texto: json.mensaje ?? "Contraseña actualizada." });
      setActual("");
      setNueva("");
      setRepetida("");
    } catch {
      setEstado({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Cambiar mi contraseña</h2>
      <p className="text-sm text-gray-500 mt-1">
        Mínimo 12 caracteres, con mayúsculas, minúsculas y números. Al cambiarla
        tendrás que volver a entrar.
      </p>

      <form onSubmit={enviar} className="mt-4 space-y-4">
        <Campo label="Contraseña actual" valor={actual} onChange={setActual} />
        <Campo label="Nueva contraseña" valor={nueva} onChange={setNueva} />
        <Campo label="Repite la nueva" valor={repetida} onChange={setRepetida} />

        {estado && (
          <p
            className={`text-sm ${estado.tipo === "ok" ? "text-green-700" : "text-red-600"}`}
            role="status"
          >
            {estado.texto}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando || !actual || !nueva}
          className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-40"
        >
          {enviando ? "Guardando…" : "Cambiar contraseña"}
        </button>
      </form>
    </section>
  );
}

function Campo({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      <input
        type="password"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
    </label>
  );
}

function GestionUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ username: "", nombre: "", rol: "coordinador", password: "" });

  async function cargar() {
    setCargando(true);
    try {
      const res = await fetch("/api/usuarios");
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
      setAviso(json.error ?? "No se pudo crear el usuario.");
      return;
    }

    setNuevo({ username: "", nombre: "", rol: "coordinador", password: "" });
    setAviso(null);
    cargar();
  }

  async function cambiarEstado(id: string, activo: boolean) {
    const res = await fetch("/api/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, activo }),
    });
    const json = await res.json();
    if (!res.ok) setAviso(json.error ?? "No se pudo actualizar.");
    cargar();
  }

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Usuarios del panel</h2>
      <p className="text-sm text-gray-500 mt-1">
        Cada persona con su propia cuenta. Al desactivar una, esa persona deja
        de entrar inmediatamente, sin afectar a las demás.
      </p>

      {aviso && <p className="text-sm text-red-600 mt-3">{aviso}</p>}

      <div className="mt-5 overflow-x-auto">
        {cargando ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-4 font-medium">Usuario</th>
                <th className="py-2 pr-4 font-medium">Rol</th>
                <th className="py-2 pr-4 font-medium">Último acceso</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-medium text-gray-900">{u.username}</td>
                  <td className="py-2 pr-4 text-gray-600">{u.role}</td>
                  <td className="py-2 pr-4 text-gray-500">
                    {u.ultimoAcceso
                      ? new Date(u.ultimoAcceso).toLocaleString("es-CO")
                      : "nunca"}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        u.activo ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {u.activo ? "activo" : "desactivado"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => cambiarEstado(u.id, !u.activo)}
                      className="text-xs underline text-gray-600 hover:text-gray-900"
                    >
                      {u.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form onSubmit={crear} className="mt-8 border-t border-gray-200 pt-6 space-y-4">
        <h3 className="font-medium text-gray-900">Añadir usuario</h3>

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
            <span className="block text-sm font-medium text-gray-700 mb-1">Nombre para mostrar</span>
            <input
              value={nuevo.nombre}
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Rol</span>
            <select
              value={nuevo.rol}
              onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="coordinador">coordinador</option>
              <option value="admin">administrador</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Contraseña inicial</span>
            <input
              type="password"
              value={nuevo.password}
              onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
              autoComplete="new-password"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={!nuevo.username || !nuevo.password}
          className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-40"
        >
          Crear usuario
        </button>
      </form>
    </section>
  );
}
