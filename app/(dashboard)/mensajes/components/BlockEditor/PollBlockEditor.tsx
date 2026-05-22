"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

export default function PollBlockEditor({ config, onActualizar }: any) {
  const [newOptionText, setNewOptionText] = useState("");

  const agregarOpcion = () => {
    if (!newOptionText.trim()) return;
    
    const newOption = {
      id: `opt_${Date.now()}`,
      texto: newOptionText,
      emoji: "●",
    };

    onActualizar({
      ...config,
      opciones: [...(config.opciones || []), newOption],
    });
    setNewOptionText("");
  };

  const eliminarOpcion = (id: string) => {
    onActualizar({
      ...config,
      opciones: config.opciones.filter((o: any) => o.id !== id),
    });
  };

  return (
    <div className="space-y-5 p-4">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-2">Pregunta</label>
        <input
          type="text"
          value={config.pregunta || ""}
          onChange={(e) => onActualizar({ ...config, pregunta: e.target.value })}
          placeholder="¿Cuál es tu pregunta?"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-2">Opciones</label>
        <div className="space-y-2 mb-3">
          {config.opciones?.map((opt: any, i: number) => (
            <div key={opt.id} className="flex gap-2 items-center bg-slate-50 p-1.5 rounded-lg border border-slate-200">
              <input
                type="text"
                value={opt.emoji}
                onChange={(e) => {
                  const nuevas = [...config.opciones];
                  nuevas[i].emoji = e.target.value;
                  onActualizar({ ...config, opciones: nuevas });
                }}
                maxLength={2}
                className="w-8 border border-slate-200 rounded px-1 py-1 text-sm text-center bg-white outline-none"
              />
              <input
                type="text"
                value={opt.texto}
                onChange={(e) => {
                  const nuevas = [...config.opciones];
                  nuevas[i].texto = e.target.value;
                  onActualizar({ ...config, opciones: nuevas });
                }}
                className="flex-1 border border-transparent rounded px-2 py-1 text-sm bg-transparent hover:bg-white focus:bg-white focus:border-slate-200 outline-none transition-colors"
              />
              <button
                onClick={() => eliminarOpcion(opt.id)}
                className="text-slate-400 hover:text-red-500 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newOptionText}
            onChange={(e) => setNewOptionText(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && agregarOpcion()}
            placeholder="Nueva opción..."
            className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-300"
          />
          <button
            onClick={agregarOpcion}
            className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-slate-900 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-100">
        <label className="block text-xs font-bold text-slate-700 mb-2">Tipo de Selección</label>
        <select
          value={config.tipo_encuesta || "single"}
          onChange={(e) => onActualizar({ ...config, tipo_encuesta: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white"
        >
          <option value="single">Una única respuesta</option>
          <option value="multiple">Múltiples respuestas</option>
        </select>
      </div>

      <label className="flex items-center gap-2 cursor-pointer group">
        <input
          type="checkbox"
          checked={config.permitir_otro || false}
          onChange={(e) => onActualizar({ ...config, permitir_otro: e.target.checked })}
          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
        />
        <span className="text-sm font-medium text-slate-600 group-hover:text-slate-800 transition-colors">
          Permitir "Otro" personalizado
        </span>
      </label>
    </div>
  );
}
