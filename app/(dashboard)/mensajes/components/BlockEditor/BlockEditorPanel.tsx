"use client";

import type { Bloque } from "@/lib/message-builder/types";
import TextBlockEditor from "./TextBlockEditor";
import PollBlockEditor from "./PollBlockEditor";
import ImageBlockEditor from "./ImageBlockEditor";
import VideoBlockEditor from "./VideoBlockEditor";
import ButtonBlockEditor from "./ButtonBlockEditor";

export default function BlockEditorPanel({ 
  bloque, 
  onActualizar 
}: { 
  bloque: Bloque, 
  onActualizar: (config: any) => void 
}) {
  return (
    <div className="flex-1 bg-white overflow-y-auto">
      <div className="p-4 border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <span>Editando:</span> 
          <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-1 rounded uppercase tracking-wider">
            {bloque.tipo}
          </span>
        </h3>
      </div>
      
      {bloque.tipo === "texto" && <TextBlockEditor config={bloque.config} onActualizar={onActualizar} />}
      {bloque.tipo === "encuesta" && <PollBlockEditor config={bloque.config} onActualizar={onActualizar} />}
      {bloque.tipo === "imagen" && <ImageBlockEditor config={bloque.config} onActualizar={onActualizar} />}
      {bloque.tipo === "video" && <VideoBlockEditor config={bloque.config} onActualizar={onActualizar} />}
      {bloque.tipo === "boton" && <ButtonBlockEditor config={bloque.config} onActualizar={onActualizar} />}
      
      {!["texto", "encuesta", "imagen", "video", "boton"].includes(bloque.tipo) && (
        <div className="p-6 text-center text-slate-400 text-sm">
          Propiedades no disponibles para {bloque.tipo}
        </div>
      )}
    </div>
  );
}
