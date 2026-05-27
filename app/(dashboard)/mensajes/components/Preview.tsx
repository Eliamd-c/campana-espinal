"use client";

import type { Bloque } from "@/lib/message-builder/types";

export default function Preview({ bloques }: { bloques: Bloque[] }) {
  return (
    <div className="h-full flex flex-col p-4 bg-slate-50 select-none">
      <div className="flex justify-between items-center shrink-0 mb-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Simulador</span>
        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full font-bold">WhatsApp</span>
      </div>
      
      {/* Container de celular centrado */}
      <div className="flex-1 flex items-center justify-center py-2">
        <div className="w-full max-w-[280px] bg-slate-800 rounded-[2.5rem] p-3 shadow-xl ring-4 ring-slate-900/5 flex flex-col">
          {/* Notch */}
          <div className="bg-black rounded-b-xl h-4 mx-auto w-20 mb-2 shrink-0"></div>
          
          {/* Pantalla */}
          <div className="bg-[#EFEAE2] rounded-2xl p-4 h-[440px] overflow-y-auto custom-scrollbar relative flex flex-col" style={{ backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')", backgroundSize: 'cover' }}>
            
            {/* Contact Header */}
            <div className="absolute top-0 left-0 right-0 bg-[#00A884] text-white px-4 py-2.5 flex items-center gap-3 z-10 shadow-sm shrink-0">
              <div className="w-7 h-7 bg-slate-200 rounded-full overflow-hidden flex-shrink-0">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="avatar" />
              </div>
              <div>
                <p className="text-[12px] font-bold leading-tight">Ciudadano</p>
                <p className="text-[9px] opacity-90 leading-tight">en línea</p>
              </div>
            </div>

            <div className="mt-10 space-y-1 flex-1">
              {bloques.length === 0 ? (
                <div className="bg-white/90 p-3 rounded-lg text-center mt-12 shadow-sm border border-slate-200/50">
                  <p className="text-xs text-slate-500">El mensaje está vacío. Añade bloques para previsualizar.</p>
                </div>
              ) : (
                <div className="bg-white p-2 rounded-xl rounded-tl-none shadow-sm ml-2 max-w-[92%] relative mt-2">
                  <div className="absolute -left-2 top-0 w-3 h-3 bg-white" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}></div>
                  {bloques.map((bloque) => (
                    <PreviewBloque key={bloque.id} bloque={bloque} />
                  ))}
                  <div className="text-[8px] text-slate-400 text-right mt-1">10:42 AM</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewBloque({ bloque }: { bloque: Bloque }) {
  const { tipo, config } = bloque;

  if (tipo === "texto") {
    const tamano = {
      pequeno: "text-[11px]",
      normal: "text-[13px]",
      grande: "text-[15px]",
    }[config.tamaño || "normal"];

    const peso = config.peso === "bold" ? "font-bold" : "font-normal";

    return (
      <div
        className={`${tamano} ${peso} text-slate-800 break-words mb-1 whitespace-pre-wrap leading-snug`}
        style={{ color: config.color || "#111B21" }}
      >
        {config.contenido || "..."}
      </div>
    );
  }

  if (tipo === "imagen") {
    return (
      <div className="mb-2">
        {config.url ? (
          <img src={config.url} alt="preview" className="rounded-lg w-full object-cover max-h-40" />
        ) : (
          <div className="bg-slate-200 rounded-lg h-24 flex items-center justify-center">
            <span className="text-slate-400 text-xs">📷 Imagen</span>
          </div>
        )}
        {config.caption && <div className="text-[11px] text-slate-500 mt-1">{config.caption}</div>}
      </div>
    );
  }

  if (tipo === "encuesta") {
    return (
      <div className="bg-[#00A884]/10 p-2 rounded-lg mb-2 border border-[#00A884]/20">
        <p className="text-[13px] font-bold text-slate-800 mb-2 leading-snug">{config.pregunta || "¿Pregunta?"}</p>
        <div className="space-y-1">
          {config.opciones?.map((opt) => (
            <div key={opt.id} className="flex items-center gap-2 text-[12px] bg-white p-1.5 rounded text-slate-700 shadow-sm">
              <span>{opt.emoji || "●"}</span>
              <span>{opt.texto}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tipo === "boton") {
    return (
      <div className="mt-2 mb-1 flex justify-center">
        <div className="w-full text-center py-2 border-t border-slate-100 text-[#00A884] text-[13px] font-bold cursor-pointer hover:bg-slate-50 rounded-b-lg">
          {config.texto || "Botón"}
        </div>
      </div>
    );
  }

  if (tipo === "divisor") {
    return <div className="my-2 border-b border-slate-200" style={{ borderBottomWidth: config.espesor || "1px", borderColor: config.color || "#e2e8f0" }} />;
  }

  if (tipo === "espaciador") {
    return <div style={{ height: config.altura === "pequeno" ? "8px" : config.altura === "grande" ? "32px" : "16px" }} />;
  }

  if (tipo === "video") {
    return (
      <div className="mb-2 bg-slate-200 rounded-lg h-24 flex items-center justify-center relative overflow-hidden">
         <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <div className="w-8 h-8 bg-white/80 rounded-full flex items-center justify-center pl-1">
              ▶
            </div>
         </div>
         <span className="text-slate-500 text-xs z-10 font-medium">🎥 Video</span>
      </div>
    );
  }

  return null;
}
