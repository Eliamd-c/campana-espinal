"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { GestionUsuarios } from "./components/GestionUsuarios";
import { PERMISOS, GRUPOS_DE_PERMISOS } from "@/lib/permisos";

/**
 * Pantalla de cuenta.
 *
 * Cada persona ve aquí lo que puede hacer y cambia su contraseña. Quien tenga
 * el permiso de gestión ve además las cuentas del panel. Antes no existía nada
 * de esto: había una sola cuenta compartida, así que no se sabía quién hacía
 * qué y no se podía cerrar el acceso a nadie que dejara el equipo.
 */
export default function CuentaPage() {
  const { data: session } = useSession();
  const usuario = session?.user as any;
  const permisos: string[] = usuario?.permisos ?? [];

  /**
   * Quien ve la gestión de cuentas es quien tiene el permiso, no quien tiene
   * un rol. Ocultarla es comodidad: si alguien llega a la pantalla sin el
   * permiso, el servidor le responde 403 igualmente.
   */
  const puedeGestionar = permisos.includes(PERMISOS.USUARIOS_GESTIONAR);

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi cuenta</h1>
        <p className="text-gray-600 mt-1">
          Sesión iniciada como{" "}
          <span className="font-medium">{session?.user?.name ?? "—"}</span>
          {puedeGestionar && (
            <span className="ml-2 text-xs bg-gray-900 text-white px-2 py-0.5 rounded">
              gestiona cuentas
            </span>
          )}
        </p>
      </div>

      <MisPermisos permisos={permisos} />
      <CambiarContrasena />
      {puedeGestionar && <GestionUsuarios miId={usuario?.id} />}
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

/** Lo que esta cuenta puede hacer, para que cada persona lo sepa. */
function MisPermisos({ permisos }: { permisos: string[] }) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Lo que puedes hacer</h2>
      {permisos.length === 0 ? (
        <p className="text-sm text-gray-600 mt-2">
          Tu cuenta todavía no tiene permisos. Pídeselos a quien gestiona las
          cuentas del panel.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1">
          {GRUPOS_DE_PERMISOS.flatMap((g) => g.permisos)
            .filter((p) => permisos.includes(p.permiso))
            .map((p) => (
              <li key={p.permiso} className="text-sm text-gray-700">
                · {p.etiqueta}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
