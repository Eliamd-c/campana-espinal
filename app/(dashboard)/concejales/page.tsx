"use client";

/**
 * Administración de la pirámide: candidatos al concejo y sus líderes.
 *
 * Aquí el equipo del alcalde arma la estructura. Los concejales y los líderes
 * NO son usuarios del sistema: son datos. Esta pantalla es donde se crean los
 * concejales y se cuelga cada líder del suyo (uno solo). Al digitalizar una
 * planilla, de esa relación sale a quién se le acredita el trabajo.
 */

import { useEffect, useState, useCallback } from "react";
import { Landmark, UserPlus, Loader2 } from "lucide-react";

interface Concejal {
  id: number;
  nombre: string | null;
  partido: string | null;
  numero_tarjeton: string | null;
  _count: { lideres: number; reuniones: number };
}

interface Lider {
  id: number;
  nombre: string | null;
  barrio: string | null;
  concejal_id: number | null;
}

export default function ConcejalesPage() {
  const [concejales, setConcejales] = useState<Concejal[]>([]);
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [cargando, setCargando] = useState(true);

  const [nombre, setNombre] = useState("");
  const [partido, setPartido] = useState("");
  const [tarjeton, setTarjeton] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    try {
      const [rc, rl] = await Promise.all([
        fetch("/api/concejales"),
        fetch("/api/lideres"),
      ]);
      const dc = await rc.json();
      const dl = await rl.json();
      setConcejales(dc.data || []);
      setLideres(dl.data || []);
    } catch {
      setError("No se pudieron cargar los datos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crearConcejal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (nombre.trim().length < 2) {
      setError("Escribe el nombre del concejal.");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/concejales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, partido, numero_tarjeton: tarjeton }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "No se pudo crear el concejal.");
        return;
      }
      setNombre("");
      setPartido("");
      setTarjeton("");
      await cargar();
    } finally {
      setGuardando(false);
    }
  };

  const asignarLider = async (liderId: number, concejalId: number | null) => {
    // Optimista: se refleja ya y, si falla, se recarga el estado real.
    setLideres((prev) =>
      prev.map((l) => (l.id === liderId ? { ...l, concejal_id: concejalId } : l))
    );
    const res = await fetch(`/api/lideres/${liderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concejal_id: concejalId }),
    });
    if (!res.ok) {
      setError("No se pudo guardar la asignación. Revisa e inténtalo de nuevo.");
      await cargar();
    } else {
      // Actualiza los contadores de la pirámide.
      cargar();
    }
  };

  const lideresDe = (concejalId: number | null) =>
    lideres.filter((l) => l.concejal_id === concejalId);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Landmark className="w-6 h-6 text-emerald-600" /> Concejales
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Candidatos al concejo de la coalición y los líderes que le trabajan a
          cada uno. El trabajo de cada líder se le acredita a su concejal, y todo
          suma para el alcalde.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-md p-3">{error}</div>
      )}

      {/* Alta de concejal */}
      <form
        onSubmit={crearConcejal}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4"
      >
        <h2 className="font-semibold text-gray-800">Agregar candidato al concejo</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Juan Martínez"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Partido</span>
            <input
              value={partido}
              onChange={(e) => setPartido(e.target.value)}
              placeholder="Ej. Cambio Radical"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">N° de tarjetón</span>
            <input
              value={tarjeton}
              onChange={(e) => setTarjeton(e.target.value)}
              placeholder="Ej. CR6"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={guardando}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-all inline-flex items-center gap-2"
        >
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Agregar concejal
        </button>
      </form>

      {/* La pirámide: cada concejal con sus líderes */}
      <div className="space-y-4">
        {concejales.length === 0 && (
          <p className="text-sm text-gray-500">
            Aún no hay concejales. Agrega el primero arriba.
          </p>
        )}

        {concejales.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-gray-800">{c.nombre}</h3>
                <p className="text-xs text-gray-500">
                  {[c.partido, c.numero_tarjeton].filter(Boolean).join(" · ") || "Sin partido / tarjetón"}
                </p>
              </div>
              <div className="text-xs text-gray-500 text-right">
                <span className="font-semibold text-emerald-700">{c._count.lideres}</span> líderes ·{" "}
                <span className="font-semibold text-emerald-700">{c._count.reuniones}</span> reuniones
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Líderes</p>
              <ListaLideres
                lideres={lideresDe(c.id)}
                concejales={concejales}
                onAsignar={asignarLider}
                vacio="Ningún líder asignado todavía."
              />
            </div>
          </div>
        ))}

        {/* Líderes sin concejal: del alcalde directamente */}
        <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-6">
          <h3 className="font-bold text-gray-700">Líderes del alcalde (sin concejal)</h3>
          <p className="text-xs text-gray-500 mb-3">
            Líderes que no cuelgan de ningún concejal. Su trabajo cuenta directo
            para el alcalde.
          </p>
          <ListaLideres
            lideres={lideresDe(null)}
            concejales={concejales}
            onAsignar={asignarLider}
            vacio="No hay líderes sin asignar."
          />
        </div>
      </div>
    </div>
  );
}

function ListaLideres({
  lideres,
  concejales,
  onAsignar,
  vacio,
}: {
  lideres: Lider[];
  concejales: Concejal[];
  onAsignar: (liderId: number, concejalId: number | null) => void;
  vacio: string;
}) {
  if (lideres.length === 0) {
    return <p className="text-sm text-gray-400">{vacio}</p>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {lideres.map((l) => (
        <li key={l.id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-gray-800">
            {l.nombre || "Sin nombre"}
            {l.barrio && <span className="text-gray-400"> · {l.barrio}</span>}
          </span>
          <select
            value={l.concejal_id ?? ""}
            onChange={(e) =>
              onAsignar(l.id, e.target.value === "" ? null : Number(e.target.value))
            }
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">— Del alcalde —</option>
            {concejales.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  );
}
