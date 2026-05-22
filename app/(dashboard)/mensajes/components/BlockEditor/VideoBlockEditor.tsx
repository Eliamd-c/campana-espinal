"use client";

import { useState, useRef } from "react";
import { UploadCloud, RefreshCw, XCircle, CheckCircle2, Film } from "lucide-react";
import { supabaseClient } from "@/lib/supabaseClient";

export default function VideoBlockEditor({ config, onActualizar }: any) {
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubiendoArchivo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { data, error } = await supabaseClient.storage
        .from('media')
        .upload(filePath, file);

      if (error) {
        throw new Error(error.message + (error.message.includes("Bucket not found") ? " (Por favor crea el bucket 'media' y hazlo público)" : ""));
      }

      const { data: publicUrlData } = supabaseClient.storage
        .from('media')
        .getPublicUrl(filePath);

      onActualizar({ ...config, url: publicUrlData.publicUrl });
    } catch (error: any) {
      alert("Error subiendo archivo: " + error.message);
    } finally {
      setSubiendoArchivo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeVideo = () => {
    onActualizar({ ...config, url: "" });
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-2">Video</label>
        
        <div className="bg-slate-50 p-4 rounded-lg border border-dashed border-slate-300 text-center relative hover:bg-slate-100 transition-colors">
          <input 
            type="file" 
            accept="video/mp4,video/3gpp,video/quicktime"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
            onChange={handleFileUpload}
            ref={fileInputRef}
            disabled={subiendoArchivo}
          />
          
          {subiendoArchivo ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
              <span className="text-sm font-bold text-slate-600">Subiendo video...</span>
            </div>
          ) : config.url ? (
            <div className="flex flex-col items-center gap-2 relative z-10 pointer-events-none">
              <div className="w-full h-24 bg-slate-800 rounded-lg flex items-center justify-center mb-2 overflow-hidden relative">
                <video src={config.url} className="w-full h-full object-cover opacity-50" />
                <div className="absolute inset-0 flex items-center justify-center">
                   <Film className="w-8 h-8 text-white opacity-80" />
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border shadow-sm w-full justify-between">
                <div className="flex items-center gap-2 overflow-hidden">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="text-[10px] text-slate-600 truncate">{config.url.split('/').pop()}</span>
                </div>
                <button 
                  onClick={(e) => { e.preventDefault(); removeVideo(); }} 
                  className="pointer-events-auto text-red-500 hover:bg-red-50 p-1 rounded-full flex-shrink-0"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 pointer-events-none">
              <UploadCloud className="w-8 h-8 text-slate-400" />
              <span className="text-sm font-bold text-slate-600">Subir Video desde el dispositivo</span>
              <span className="text-[10px] text-slate-400">MP4 o 3GP recomendado (Máx 16MB para WhatsApp)</span>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-2">Pie de video (Opcional)</label>
        <textarea
          value={config.caption || ""}
          onChange={(e) => onActualizar({ ...config, caption: e.target.value })}
          placeholder="Escribe un mensaje descriptivo..."
          className="w-full border border-slate-200 rounded-lg p-3 text-sm h-20 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />
      </div>
    </div>
  );
}
