"use client";

import type { BlockConfig } from "@/lib/message-builder/types";
import { Image as ImageIcon } from "lucide-react";

export default function ImageBlock({ config }: { config: BlockConfig }) {
  return (
    <div className="flex flex-col items-center justify-center">
      {config.url ? (
        <img
          src={config.url}
          alt={config.caption || "Imagen"}
          className="rounded-lg object-cover"
          style={{ width: config.ancho || "100%" }}
        />
      ) : (
        <div className="w-full h-32 bg-slate-100 rounded-lg flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-300">
          <ImageIcon className="w-8 h-8 mb-2" />
          <span className="text-sm font-medium">Bloque de Imagen</span>
        </div>
      )}
      {config.caption && (
        <p className="mt-2 text-sm text-slate-500 text-center">{config.caption}</p>
      )}
    </div>
  );
}
