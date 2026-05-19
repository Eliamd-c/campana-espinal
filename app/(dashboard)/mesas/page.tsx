"use client";

import { useEffect, useState } from "react";

interface Puesto {
  nombre: string;
  direccion: string;
  mesas: {
    numero: string;
    contactos: number;
    meta: number;
  }[];
}

export default function MesasPage() {
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargarEstadisticas = async () => {
      setCargando(true);
      try {
        const res = await fetch("/api/mesas/estadisticas");
        const json = await res.json();
        if (json.data) setPuestos(json.data);
      } catch (error) {
        console.error("Error al cargar mesas:", error);
      } finally {
        setCargando(false);
      }
    };
    cargarEstadisticas();
  }, []);

  const getColorCobertura = (porcentaje: number) => {
    if (porcentaje >= 80) return "bg-green-100 text-green-700 border-green-200";
    if (porcentaje >= 40) return "bg-yellow-100 text-yellow-700 border-yellow-200";
    return "bg-red-100 text-red-700 border-red-200";
  };

  const getEmojiCobertura = (porcentaje: number) => {
    if (porcentaje >= 80) return "🟢 Fortín";
    if (porcentaje >= 40) return "🟡 Medio";
    return "🔴 Débil";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Mesas de Votación</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cobertura e influencia por centro y mesa de votación
          </p>
        </div>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
          onClick={() => alert("Sincronización con Registraduría iniciada")}
        >
          Sincronizar Mesas
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {cargando ? (
          <div className="col-span-full py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : puestos.length === 0 ? (
          <div className="col-span-full py-16 text-center text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-4xl mb-3">🗳️</p>
            <p className="font-medium">No se encontraron datos de mesas</p>
            <p className="text-sm mt-1">Sincroniza los datos con la Registraduría</p>
          </div>
        ) : (
          puestos.map((puesto, idx) => {
            const totalContactos = puesto.mesas.reduce((acc, m) => acc + m.contactos, 0);
            const totalMeta = puesto.mesas.reduce((acc, m) => acc + m.meta, 0);
            const coberturaTotal = (totalContactos / totalMeta) * 100;

            return (
              <div key={idx} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-gray-50">
                  <div>
                    <h3 className="font-bold text-lg text-gray-800">{puesto.nombre}</h3>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                      📍 {puesto.direccion}
                    </p>
                  </div>
                  <div className={`px-3 py-1 rounded-full border text-xs font-bold ${getColorCobertura(coberturaTotal)}`}>
                    {getEmojiCobertura(coberturaTotal)}
                  </div>
                </div>

                <div className="p-5">
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 font-medium">Cobertura global del puesto</span>
                      <span className="font-bold text-gray-800">{Math.round(coberturaTotal)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, coberturaTotal)}%` }}
                      />
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Detalle por mesas</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {puesto.mesas.map((mesa, mIdx) => {
                      const cob = (mesa.contactos / mesa.meta) * 100;
                      return (
                        <div key={mIdx} className="border border-gray-100 rounded-xl p-3 flex justify-between items-center hover:bg-gray-50 transition">
                          <div>
                            <p className="text-sm font-bold text-gray-800">Mesa {mesa.numero}</p>
                            <p className="text-xs text-gray-500">{mesa.contactos} / {mesa.meta} pers.</p>
                          </div>
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${getColorCobertura(cob)}`}>
                            {Math.round(cob)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
