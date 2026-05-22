"use client";

import { Type, Image as ImageIcon, Video, ListTodo, MousePointerClick, Minus, ArrowDownToLine } from "lucide-react";
import type { BlockType } from "@/lib/message-builder/types";

export default function BlocksPalette({ onAgregarBloque }: { onAgregarBloque: (tipo: BlockType) => void }) {
  const bloques: { tipo: BlockType; label: string; icon: React.ReactNode }[] = [
    { tipo: "texto", label: "Texto", icon: <Type className="w-4 h-4" /> },
    { tipo: "imagen", label: "Imagen", icon: <ImageIcon className="w-4 h-4" /> },
    { tipo: "video", label: "Video", icon: <Video className="w-4 h-4" /> },
    { tipo: "encuesta", label: "Encuesta", icon: <ListTodo className="w-4 h-4" /> },
    { tipo: "boton", label: "Botón", icon: <MousePointerClick className="w-4 h-4" /> },
    { tipo: "divisor", label: "Divisor", icon: <Minus className="w-4 h-4" /> },
    { tipo: "espaciador", label: "Espacio", icon: <ArrowDownToLine className="w-4 h-4" /> },
  ];

  return (
    <div className="w-64 bg-white border-r border-slate-200 p-4 space-y-2 overflow-y-auto">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Añadir Bloque</h3>
      {bloques.map((bloque) => (
        <button
          key={bloque.tipo}
          onClick={() => onAgregarBloque(bloque.tipo)}
          className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors text-sm font-medium text-slate-700"
        >
          {bloque.icon} {bloque.label}
        </button>
      ))}
    </div>
  );
}
