"use client";

export default function TextBlockEditor({ config, onActualizar }: any) {
  return (
    <div className="space-y-4 p-4">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-2">Contenido</label>
        <textarea
          value={config.contenido || ""}
          onChange={(e) => onActualizar({ ...config, contenido: e.target.value })}
          placeholder="Escribe tu texto. Usa {{nombre}} para variables"
          className="w-full border border-slate-200 rounded-lg p-3 text-sm h-32 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />
        <p className="text-[11px] text-slate-500 mt-1">
          Variables disponibles: <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600">{"{{nombre}}"}</code>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Tamaño</label>
          <select
            value={config.tamaño || "normal"}
            onChange={(e) => onActualizar({ ...config, tamaño: e.target.value })}
            className="w-full border border-slate-200 rounded px-2 py-2 text-sm bg-white"
          >
            <option value="pequeno">Pequeño</option>
            <option value="normal">Normal</option>
            <option value="grande">Grande</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Peso</label>
          <select
            value={config.peso || "normal"}
            onChange={(e) => onActualizar({ ...config, peso: e.target.value })}
            className="w-full border border-slate-200 rounded px-2 py-2 text-sm bg-white"
          >
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Alineación</label>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {["left", "center", "right"].map((align) => (
            <button
              key={align}
              onClick={() => onActualizar({ ...config, alineacion: align })}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${
                config.alineacion === align
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {align === "left" ? "Izquierda" : align === "center" ? "Centro" : "Derecha"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
