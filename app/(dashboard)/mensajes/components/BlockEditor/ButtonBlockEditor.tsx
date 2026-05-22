"use client";

export default function ButtonBlockEditor({ config, onActualizar }: any) {
  return (
    <div className="space-y-4 p-4">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-2">Texto del Botón</label>
        <input
          type="text"
          value={config.texto || ""}
          onChange={(e) => onActualizar({ ...config, texto: e.target.value })}
          placeholder="Ej: Visitar sitio web"
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          maxLength={20}
        />
        <p className="text-[10px] text-slate-400 mt-1 text-right">{config.texto?.length || 0}/20</p>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-2">Tipo de Acción</label>
        <select
          value={config.accion || "url"}
          onChange={(e) => onActualizar({ ...config, accion: e.target.value, valor: "" })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          <option value="url">Visitar Sitio Web (URL)</option>
          <option value="llamar">Llamar a un Teléfono</option>
          <option value="reply">Respuesta Rápida (Mensaje)</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-2">
          {config.accion === "url" ? "URL de Destino" : 
           config.accion === "llamar" ? "Número de Teléfono" : 
           "Texto de Respuesta"}
        </label>
        <input
          type={config.accion === "url" ? "url" : config.accion === "llamar" ? "tel" : "text"}
          value={config.valor || ""}
          onChange={(e) => onActualizar({ ...config, valor: e.target.value })}
          placeholder={
            config.accion === "url" ? "https://..." : 
            config.accion === "llamar" ? "+57 300 000 0000" : 
            "Sí, quiero más info"
          }
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>
    </div>
  );
}
