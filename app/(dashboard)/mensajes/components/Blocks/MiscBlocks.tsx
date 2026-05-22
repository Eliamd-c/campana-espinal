"use client";
import type { BlockConfig } from "@/lib/message-builder/types";
import { Video, MousePointerClick } from "lucide-react";

export function ButtonBlock({ config }: { config: BlockConfig }) {
  return (
    <div className="flex justify-center">
      <div
        className="px-6 py-2.5 rounded-lg text-white font-medium text-sm flex items-center justify-center cursor-pointer shadow-sm"
        style={{ backgroundColor: config.color || "#4F46E5" }}
      >
        <MousePointerClick className="w-4 h-4 mr-2 opacity-80" />
        {config.texto || "Botón"}
      </div>
    </div>
  );
}

export function DividerBlock({ config }: { config: BlockConfig }) {
  return (
    <div className="py-4 w-full flex items-center justify-center">
      <div
        className="w-full"
        style={{
          borderBottomWidth: config.espesor || "1px",
          borderBottomColor: config.color || "#E2E8F0",
          borderBottomStyle: "solid",
        }}
      />
    </div>
  );
}

export function SpacerBlock({ config }: { config: BlockConfig }) {
  return (
    <div
      style={{
        height: config.altura === "pequeno" ? "16px" : config.altura === "grande" ? "64px" : "32px",
      }}
      className="w-full bg-slate-50/50 rounded flex items-center justify-center border border-dashed border-slate-200"
    >
      <span className="text-[10px] text-slate-400 uppercase tracking-widest">Espaciador</span>
    </div>
  );
}

export function VideoBlock({ config }: { config: BlockConfig }) {
  return (
    <div className="w-full h-40 bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400">
      <Video className="w-8 h-8 mb-2" />
      <span className="text-sm font-medium">{config.url ? "Video Configurado" : "Bloque de Video"}</span>
    </div>
  );
}
