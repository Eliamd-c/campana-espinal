"use client";

import type { BlockConfig } from "@/lib/message-builder/types";
import { ListTodo } from "lucide-react";

export default function PollBlock({ config }: { config: BlockConfig }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-3">
        <ListTodo className="w-5 h-5 text-indigo-600" />
        <h4 className="font-bold text-slate-800 text-sm">{config.pregunta || "Pregunta de Encuesta"}</h4>
      </div>
      <div className="space-y-2">
        {config.opciones?.map((opt) => (
          <div key={opt.id} className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
            <span className="text-lg leading-none">{opt.emoji || "●"}</span>
            <span className="text-sm font-medium text-slate-700">{opt.texto}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between items-center">
        <span className="text-xs text-slate-400 font-medium">
          {config.tipo_encuesta === "multiple" ? "Selección Múltiple" : "Selección Única"}
        </span>
        {config.permitir_otro && <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded">Permite "Otro"</span>}
      </div>
    </div>
  );
}
