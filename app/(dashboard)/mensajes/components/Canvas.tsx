"use client";

import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import TextBlock from "./Blocks/TextBlock";
import ImageBlock from "./Blocks/ImageBlock";
import PollBlock from "./Blocks/PollBlock";
import { ButtonBlock, DividerBlock, SpacerBlock, VideoBlock } from "./Blocks/MiscBlocks";
import { GripVertical, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import type { Bloque } from "@/lib/message-builder/types";

const BLOCK_COMPONENTS: Record<string, any> = {
  texto: TextBlock,
  imagen: ImageBlock,
  video: VideoBlock,
  encuesta: PollBlock,
  boton: ButtonBlock,
  divisor: DividerBlock,
  espaciador: SpacerBlock,
};

interface CanvasProps {
  bloques: Bloque[];
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onDeleteBlock: (id: string) => void;
  onMoveBlock: (id: string, dir: "up" | "down") => void;
  onDragEnd: (result: DropResult) => void;
}

export default function Canvas({
  bloques,
  selectedBlockId,
  onSelectBlock,
  onDeleteBlock,
  onMoveBlock,
  onDragEnd
}: CanvasProps) {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="canvas-droppable">
        {(provided) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            className="flex-1 overflow-y-auto bg-slate-100 p-8 flex flex-col items-center custom-scrollbar"
          >
            <div className="w-full max-w-2xl min-h-[500px] bg-white rounded-xl shadow-sm border border-slate-200 p-8">
              {bloques.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
                  <div className="w-16 h-16 mb-4 rounded-full bg-slate-50 flex items-center justify-center border border-slate-200">
                    <GripVertical className="w-6 h-6 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-700 mb-1">Tu mensaje está vacío</h3>
                  <p className="text-sm">Arrastra bloques desde el panel izquierdo para empezar a construir.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {bloques.map((bloque, index) => {
                    const BlockComponent = BLOCK_COMPONENTS[bloque.tipo];
                    if (!BlockComponent) return null;
                    const isSelected = selectedBlockId === bloque.id;

                    return (
                      <Draggable key={bloque.id} draggableId={bloque.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            onClick={() => onSelectBlock(bloque.id)}
                            className={`
                              relative group rounded-xl transition-all duration-200 border-2 bg-white
                              ${isSelected ? "border-indigo-500 shadow-md ring-4 ring-indigo-50" : "border-transparent hover:border-slate-200 shadow-sm"}
                              ${snapshot.isDragging ? "shadow-xl border-indigo-300 scale-[1.02]" : ""}
                            `}
                          >
                            {/* Toolbar flotante de opciones (solo visible si está seleccionado o hover) */}
                            <div className={`absolute -right-3 top-1/2 -translate-y-1/2 bg-white border border-slate-200 shadow-lg rounded-lg flex-col overflow-hidden transition-opacity z-10 ${isSelected ? "flex" : "hidden group-hover:flex"}`}>
                                <div
                                  {...provided.dragHandleProps}
                                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-grab active:cursor-grabbing border-b border-slate-100"
                                  title="Arrastrar"
                                >
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                {index > 0 && (
                                  <button onClick={(e) => { e.stopPropagation(); onMoveBlock(bloque.id, "up"); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 border-b border-slate-100" title="Subir">
                                    <ArrowUp className="w-4 h-4" />
                                  </button>
                                )}
                                {index < bloques.length - 1 && (
                                  <button onClick={(e) => { e.stopPropagation(); onMoveBlock(bloque.id, "down"); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 border-b border-slate-100" title="Bajar">
                                    <ArrowDown className="w-4 h-4" />
                                  </button>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); onDeleteBlock(bloque.id); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-slate-50" title="Eliminar">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            <div className={`px-6 py-5 ${isSelected ? "bg-indigo-50/30 rounded-xl" : ""}`}>
                              <BlockComponent config={bloque.config} />
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </div>
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
