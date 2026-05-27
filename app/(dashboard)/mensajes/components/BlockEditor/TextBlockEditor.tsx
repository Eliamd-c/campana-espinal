"use client";

import { useState, useRef } from "react";

const OPCIONES_VARIABLES = [
  { label: "Nombre de Pila", token: "{{nombre}}", desc: "Primer nombre del ciudadano", icon: "👤" },
  { label: "Barrio o Sector", token: "{{barrio}}", desc: "Barrio registrado del votante", icon: "📍" },
  { label: "Puesto de Votación", token: "{{puesto_votacion}}", desc: "Lugar de votación asignado", icon: "🗳️" },
  { label: "Mesa de Votación", token: "{{mesa_numero}}", desc: "Número de mesa asignada", icon: "🔢" },
  { label: "Líder Coordinador", token: "{{lider}}", desc: "Nombre del líder asignado", icon: "⭐" },
];

export default function TextBlockEditor({ config, onActualizar }: any) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertarToken = (token: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const text = config.contenido || "";
    
    // Encontrar dónde estaba el '/' antes del cursor
    const lastSlashIndex = text.lastIndexOf('/', startPos - 1);
    
    let nuevoTexto = "";
    let nuevaPosicion = 0;
    
    if (lastSlashIndex !== -1) {
      // Reemplazar desde el '/' hasta la posición del cursor con el token
      nuevoTexto = text.substring(0, lastSlashIndex) + token + text.substring(endPos);
      nuevaPosicion = lastSlashIndex + token.length;
    } else {
      // Si no encuentra el '/', lo inserta al final
      nuevoTexto = text.substring(0, startPos) + token + text.substring(endPos);
      nuevaPosicion = startPos + token.length;
    }

    onActualizar({ ...config, contenido: nuevoTexto });
    setShowSlashMenu(false);
    
    // Devolver el foco e insertar cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(nuevaPosicion, nuevaPosicion);
    }, 50);
  };

  const handleTextChange = (e: any) => {
    const value = e.target.value;
    const selectionStart = e.target.selectionStart;
    onActualizar({ ...config, contenido: value });

    // Revisar si el carácter anterior es un '/'
    const textBeforeCursor = value.substring(0, selectionStart);
    const hasSlash = textBeforeCursor.endsWith('/');
    
    if (hasSlash) {
      setShowSlashMenu(true);
      setMenuIndex(0);
    } else if (!value.includes('/')) {
      setShowSlashMenu(false);
    }
  };

  const handleKeyDown = (e: any) => {
    if (!showSlashMenu) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMenuIndex((prev) => (prev + 1) % OPCIONES_VARIABLES.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMenuIndex((prev) => (prev - 1 + OPCIONES_VARIABLES.length) % OPCIONES_VARIABLES.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      insertarToken(OPCIONES_VARIABLES[menuIndex].token);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowSlashMenu(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="relative">
        <label className="block text-xs font-bold text-slate-700 mb-2">Contenido</label>
        <textarea
          ref={textareaRef}
          value={config.contenido || ""}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="Escribe tu texto. Escribe '/' para desplegar las variables dinámicas"
          className="w-full border border-slate-200 rounded-lg p-3 text-sm h-72 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />

        {showSlashMenu && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden max-h-48 overflow-y-auto animate-in slide-in-from-top-2 duration-200">
            <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-100 flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Variables Dinámicas</span>
              <span className="text-[9px] text-slate-400 bg-white px-1 py-0.5 rounded border border-slate-200">↑↓ Mover · Enter</span>
            </div>
            <div className="p-1 space-y-0.5">
              {OPCIONES_VARIABLES.map((opcion, idx) => (
                <button
                  key={opcion.token}
                  onClick={() => insertarToken(opcion.token)}
                  onMouseEnter={() => setMenuIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${
                    idx === menuIndex 
                      ? "bg-indigo-50 text-indigo-700" 
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-base">{opcion.icon}</span>
                  <div className="flex-1">
                    <p className="text-xs font-bold">{opcion.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{opcion.desc}</p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 py-0.5 rounded">
                    {opcion.token}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-500 mt-1">
          Escribe <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600">/</code> en el cuadro para autocompletar variables.
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
