"use client";

import { useState } from "react";
import { X, Save, CheckCircle } from "lucide-react";
import type { Bloque } from "@/lib/message-builder/types";

export default function SaveTemplate({
  bloques,
  onClose,
}: {
  bloques: Bloque[];
  onClose: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("general");
  const [descripcion, setDescripcion] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!nombre.trim()) {
      setError("El nombre es requerido");
      return;
    }
    
    if (bloques.length === 0) {
      setError("No puedes guardar una plantilla vacía");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/message-builder/plantillas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, categoria, descripcion, bloques }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al guardar");

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Save className="w-5 h-5 text-indigo-600" />
            Guardar como Plantilla
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 flex flex-col items-center justify-center text-center">
            <CheckCircle className="w-16 h-16 text-emerald-500 mb-4 animate-bounce" />
            <h3 className="text-xl font-bold text-slate-800 mb-2">¡Plantilla Guardada!</h3>
            <p className="text-slate-500">Ya podrás usarla en tus futuras campañas.</p>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Nombre de la Plantilla</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Recordatorio de Votación"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Categoría</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white transition-all"
              >
                <option value="general">General</option>
                <option value="encuesta">Encuestas</option>
                <option value="evento">Eventos</option>
                <option value="recordatorio">Recordatorios</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Descripción (Opcional)</label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="¿Para qué sirve esta plantilla?"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm h-20 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              />
            </div>

            <div className="pt-2 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-indigo-200 flex justify-center items-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  "Guardar Plantilla"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
