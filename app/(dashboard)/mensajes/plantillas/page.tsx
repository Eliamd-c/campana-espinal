"use client";

import { useState, useEffect } from "react";
import { Save, Plus, Trash2, FileText, Variable } from "lucide-react";

interface Plantilla {
  id: number;
  nombre: string;
  categoria: string;
  texto: string;
  variables: string[];
  veces_usada: number;
}

export default function PlantillasPage() {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [nombre, setNombre] = useState("");
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarPlantillas();
  }, []);

  const cargarPlantillas = async () => {
    const res = await fetch("/api/plantillas");
    const json = await res.json();
    if (json.data) setPlantillas(json.data);
  };

  const guardarPlantilla = async () => {
    if (!nombre || !texto) return;
    setGuardando(true);
    await fetch("/api/plantillas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, texto, categoria: "Marketing" })
    });
    setNombre("");
    setTexto("");
    setGuardando(false);
    cargarPlantillas();
  };

  const eliminarPlantilla = async (id: number) => {
    if (!confirm("¿Seguro que deseas eliminar esta plantilla?")) return;
    await fetch(`/api/plantillas?id=${id}`, { method: "DELETE" });
    cargarPlantillas();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Plantillas de Mensaje</h1>
        <p className="text-slate-500">Guarda tus mensajes más exitosos para usarlos nuevamente.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4 h-fit">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-600" /> Nueva Plantilla
          </h2>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre interno</label>
            <input 
              type="text" 
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Invitación Mitin Centro"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">Cuerpo del Mensaje</label>
            </div>
            <textarea 
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe el mensaje..."
              rows={8}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
            ></textarea>
            <p className="text-xs text-slate-500 mt-1">Usa <code className="bg-slate-100 px-1 rounded">{"{{nombre}}"}</code> para personalizar.</p>
          </div>

          <button 
            onClick={guardarPlantilla}
            disabled={guardando || !nombre || !texto}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white py-2 px-4 rounded-lg font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            {guardando ? "Guardando..." : "Guardar Plantilla"}
          </button>
        </div>

        {/* Lista */}
        <div className="lg:col-span-2 space-y-4">
          {plantillas.map(p => (
            <div key={p.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-slate-400" />
                  <h3 className="font-bold text-slate-800">{p.nombre}</h3>
                  <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full font-medium">
                    {p.categoria}
                  </span>
                </div>
                <p className="text-slate-600 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                  {p.texto}
                </p>
                {p.variables.length > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <Variable className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs text-slate-500">
                      Variables: {p.variables.map(v => <code key={v} className="mx-1 px-1 bg-emerald-50 text-emerald-700 rounded">{v}</code>)}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 justify-center border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4">
                <div className="text-center md:text-right px-2">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Usos</p>
                  <p className="text-xl font-bold text-slate-800">{p.veces_usada}</p>
                </div>
                <button 
                  onClick={() => eliminarPlantilla(p.id)}
                  className="mt-auto flex items-center justify-center gap-1 px-3 py-1.5 text-sm text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Eliminar
                </button>
              </div>
            </div>
          ))}
          {plantillas.length === 0 && (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No has creado ninguna plantilla aún</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
