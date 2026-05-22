"use client";

import type { BlockConfig } from "@/lib/message-builder/types";

export default function TextBlock({ config }: { config: BlockConfig }) {
  const alignMap = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  };

  const sizeMap = {
    pequeno: "text-sm",
    normal: "text-base",
    grande: "text-lg",
  };

  return (
    <div
      className={`
        ${alignMap[config.alineacion || "left"]}
        ${sizeMap[config.tamaño || "normal"]}
        ${config.peso === "bold" ? "font-bold" : "font-normal"}
      `}
      style={{ color: config.color || "#000000" }}
    >
      {config.contenido || "Escribe tu texto aquí..."}
    </div>
  );
}
