"use client";

import { useState, useCallback } from "react";
import BlocksPalette from "./BlocksPalette";
import Canvas from "./Canvas";
import Preview from "./Preview";
import BlockEditorPanel from "./BlockEditor/BlockEditorPanel";
import SaveTemplate from "./SaveTemplate";

import { generarIdBloque, getConfigDefault } from "@/lib/message-builder/utils";
import type { Bloque, BlockType } from "@/lib/message-builder/types";
import { Save, RotateCcw, Paintbrush, ChevronRight, Eye, Settings } from "lucide-react";
import { useEffect } from "react";

interface MessageBuilderProps {
  initialBloques?: Bloque[];
  onContinue?: (bloques: Bloque[]) => void;
  nombreCampana?: string;
  setNombreCampana?: (nombre: string) => void;
}

export default function MessageBuilder({ initialBloques = [], onContinue, nombreCampana, setNombreCampana }: MessageBuilderProps) {
  const [bloques, setBloques] = useState<Bloque[]>(initialBloques);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"editar" | "preview">("preview");
  const [isDirty, setIsDirty] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Sync when initialBloques change (e.g. template selected)
  useEffect(() => {
    if (initialBloques.length > 0) {
      setBloques(initialBloques);
      setSelectedBlockId(null);
      setActiveTab("preview");
    }
  }, [initialBloques]);

  const agregarBloque = useCallback((tipo: BlockType) => {
    const nuevoBloque: Bloque = {
      id: generarIdBloque(),
      tipo,
      orden: bloques.length,
      config: getConfigDefault(tipo),
    };
    setBloques([...bloques, nuevoBloque]);
    setSelectedBlockId(nuevoBloque.id);
    setActiveTab("editar");
    setIsDirty(true);
  }, [bloques]);

  const actualizarBloque = useCallback((id: string, config: any) => {
    setBloques(bloques.map((b) => (b.id === id ? { ...b, config } : b)));
    setIsDirty(true);
  }, [bloques]);

  const eliminarBloque = useCallback((id: string) => {
    setBloques(bloques.filter((b) => b.id !== id));
    if (selectedBlockId === id) {
      setSelectedBlockId(null);
      setActiveTab("preview");
    }
    setIsDirty(true);
  }, [bloques, selectedBlockId]);

  const handleSelectBlock = useCallback((id: string | null) => {
    setSelectedBlockId(id);
    if (id) {
      setActiveTab("editar");
    }
  }, []);

  const moverBloque = useCallback(
    (id: string, direccion: "up" | "down") => {
      const index = bloques.findIndex((b) => b.id === id);
      if ((direccion === "up" && index === 0) || (direccion === "down" && index === bloques.length - 1))
        return;

      const nuevoBloques = [...bloques];
      if (direccion === "up") {
        [nuevoBloques[index], nuevoBloques[index - 1]] = [nuevoBloques[index - 1], nuevoBloques[index]];
      } else {
        [nuevoBloques[index], nuevoBloques[index + 1]] = [nuevoBloques[index + 1], nuevoBloques[index]];
      }
      setBloques(nuevoBloques);
      setIsDirty(true);
    },
    [bloques]
  );

  const onDragEnd = useCallback((result: any) => {
    if (!result.destination) return;
    
    const items = Array.from(bloques);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setBloques(items);
    setIsDirty(true);
  }, [bloques]);

  return (
    <div className="h-[750px] flex flex-col bg-white overflow-hidden rounded-xl shadow-sm border border-slate-200">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-10 gap-4">
        
        {setNombreCampana !== undefined ? (
          <input 
            type="text" 
            placeholder="Nombre interno de la campaña (Ej: Evento Plaza)"
            value={nombreCampana}
            onChange={(e) => setNombreCampana(e.target.value)}
            className="flex-1 max-w-sm border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        ) : (
          <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <Paintbrush className="w-5 h-5 text-indigo-600" /> Constructor Visual
          </h1>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => {
              if(confirm("¿Limpiar todo el lienzo?")) {
                setBloques([]);
                setSelectedBlockId(null);
                setIsDirty(false);
              }
            }}
            className="flex items-center gap-2 bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 rounded-lg font-medium hover:bg-slate-100 transition-colors text-sm"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setShowSaveTemplate(true)}
            className="flex items-center gap-2 bg-white border border-indigo-200 text-indigo-600 px-4 py-2 rounded-lg font-medium hover:bg-indigo-50 shadow-sm transition-colors text-sm"
          >
            <Save className="w-4 h-4" /> Plantilla
          </button>
          
          {onContinue && (
            <button 
              onClick={() => onContinue(bloques)}
              disabled={bloques.length === 0}
              className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-indigo-700 shadow-sm transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed ml-2"
            >
              Continuar <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Palette */}
        <BlocksPalette onAgregarBloque={agregarBloque} />
        
        {/* Center: Canvas */}
        <Canvas
          bloques={bloques}
          selectedBlockId={selectedBlockId}
          onSelectBlock={handleSelectBlock}
          onDeleteBlock={eliminarBloque}
          onMoveBlock={moverBloque}
          onDragEnd={onDragEnd}
        />
        
        {/* Right Sidebar: Tabs for Preview & Properties Editor */}
        <div className="w-[360px] bg-white border-l border-slate-200 flex flex-col overflow-hidden shrink-0">
          {/* Tab Selector Header */}
          <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 gap-1 shrink-0">
            <button
              onClick={() => setActiveTab("preview")}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === "preview"
                  ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Vista Previa
            </button>
            <button
              onClick={() => setActiveTab("editar")}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === "editar"
                  ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Settings className="w-3.5 h-3.5" /> Propiedades
            </button>
          </div>

          {/* Tab Content Container */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === "preview" ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <Preview bloques={bloques} />
              </div>
            ) : selectedBlockId ? (
              <BlockEditorPanel
                bloque={bloques.find((b) => b.id === selectedBlockId)!}
                onActualizar={(config) => actualizarBloque(selectedBlockId, config)}
              />
            ) : (
              <div className="flex-1 p-6 bg-slate-50 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-3">
                  <Settings className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-700 mb-1">Sin bloque seleccionado</h4>
                <p className="text-[11px] text-slate-400 max-w-[200px] mb-4 leading-normal">
                  Selecciona cualquier bloque de texto, imagen o encuesta en el lienzo de la izquierda para editar sus propiedades aquí.
                </p>
                <button
                  onClick={() => setActiveTab("preview")}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                >
                  Ver Vista Previa
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showSaveTemplate && (
        <SaveTemplate bloques={bloques} onClose={() => setShowSaveTemplate(false)} />
      )}
    </div>
  );
}
