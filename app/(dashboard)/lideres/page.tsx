"use client";

import { useEffect, useState } from "react";

interface Lider {
  id: number;
  nombre: string;
  telefono: string;
  barrio: string;
  personas_nuevas: number;
  personas_repetidas: number;
  tasa_trasteo: number; // Decimal comes as string or number depending on serialization
  score: number;
  estado: string;
  _count: {
    contactos: number;
    reuniones: number;
  };
}

export default function LideresPage() {
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch("/api/lideres")
      .then((res) => res.json())
      .then((data) => {
        setLideres(data.data || []);
      })
      .catch((error) => console.error("Error al cargar líderes:", error))
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Líderes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ranking y métricas de desempeño
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cargando ? (
          <div className="col-span-full py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : lideres.length === 0 ? (
          <div className="col-span-full py-16 text-center text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-4xl mb-3">⭐</p>
            <p className="font-medium">No se encontraron líderes</p>
            <p className="text-sm mt-1">Registra líderes desde la creación de reuniones o contactos</p>
          </div>
        ) : (
          lideres.map((lider, index) => (
            <div key={lider.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4 hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-gray-400">#{index + 1}</span>
                    <h3 className="text-lg font-bold text-gray-800">{lider.nombre}</h3>
                  </div>
                  <p className="text-sm text-gray-500">{lider.barrio}</p>
                </div>
                {lider.estado === "alerta" ? (
                  <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
                    ⚠️ ALERTA
                  </span>
                ) : (
                  <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded-full">
                    Activo
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 font-medium">Score</p>
                  <p className="text-2xl font-bold text-blue-600">{lider.score}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 font-medium">Tasa Trasteo</p>
                  <p className={`text-xl font-bold ${Number(lider.tasa_trasteo) > 60 ? "text-red-600" : "text-gray-800"}`}>
                    {Number(lider.tasa_trasteo).toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Personas Nuevas</span>
                  <span className="font-medium text-green-600">{lider.personas_nuevas}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Personas Repetidas</span>
                  <span className="font-medium text-orange-500">{lider.personas_repetidas}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Reuniones</span>
                  <span className="font-medium text-gray-800">{lider._count.reuniones}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
