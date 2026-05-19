"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Lider {
  id: number;
  nombre: string;
}

interface Reunion {
  id: number;
  titulo: string | null;
  fecha: string | null;
  lugar: string | null;
  lider_id: number | null;
  total_asistentes: number;
  nuevos_unicos: number;
  repetidos: number;
  alerta_trasteo: boolean;
  lider: Lider | null;
}

export default function ReunionesPage() {
  const [reuniones, setReuniones] = useState<Reunion[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch("/api/reuniones")
      .then((res) => res.json())
      .then((data) => {
        setReuniones(data.data || []);
      })
      .catch((error) => console.error("Error al cargar reuniones:", error))
      .finally(() => setCargando(false));
  }, []);

  const fechaFormat = (str: string | null) =>
    str ? new Date(str).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Reuniones</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestión y seguimiento de reuniones con líderes
          </p>
        </div>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
          onClick={() => alert("Funcionalidad de crear nueva reunión en desarrollo")}
        >
          + Nueva Reunión
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : reuniones.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-4xl mb-3">📅</p>
            <p className="font-medium">No se encontraron reuniones</p>
            <p className="text-sm mt-1">Aún no has registrado ninguna reunión</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Título</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Lugar</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Líder</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Asistentes</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Nuevos</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Repetidos</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Alerta Trasteo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reuniones.map((r) => (
                  <tr key={r.id} className="hover:bg-blue-50 cursor-pointer transition">
                    <td className="px-4 py-3 font-medium text-gray-800">{r.titulo || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{fechaFormat(r.fecha)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.lugar || "—"}</td>
                    <td className="px-4 py-3 font-medium text-blue-600 hover:underline">
                      {r.lider?.nombre || "—"}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-800">{r.total_asistentes}</td>
                    <td className="px-4 py-3 text-center text-green-600 font-medium">{r.nuevos_unicos}</td>
                    <td className="px-4 py-3 text-center text-orange-500 font-medium">{r.repetidos}</td>
                    <td className="px-4 py-3">
                      {r.alerta_trasteo ? (
                        <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
                          ⚠️ ALERTA
                        </span>
                      ) : (
                        <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded-full">
                          Normal
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
