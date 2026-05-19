"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, Upload, X, Focus } from "lucide-react";

interface CamaraProps {
  onCaptura: (imagenUrl: string) => void;
}

export function Camara({ onCaptura }: CamaraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activa, setActiva] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    if (activa) {
      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        .then((stream) => {
          currentStream = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.error(e));
          }
        })
        .catch(() => {
          setError("No se pudo acceder a la cámara. Verifica los permisos de tu navegador.");
          setActiva(false);
        });
    }

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [activa]);

  const iniciarCamara = useCallback(() => {
    setActiva(true);
    setError("");
  }, []);

  const detenerCamara = useCallback(() => {
    setActiva(false);
  }, []);

  const capturar = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(video, 0, 0);
    const imagenUrl = canvas.toDataURL("image/jpeg", 0.95);
    detenerCamara();
    onCaptura(imagenUrl);
  }, [detenerCamara, onCaptura]);

  const manejarArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) onCaptura(ev.target.result as string);
    };
    reader.readAsDataURL(archivo);
  };

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes scan {
          0%, 100% { top: 5%; opacity: 0; }
          10%, 90% { opacity: 1; }
          50% { top: 95%; }
        }
        .animate-scan {
          animation: scan 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {activa ? (
        <div className="relative rounded-2xl overflow-hidden bg-black shadow-xl h-[65vh] w-full max-w-2xl mx-auto flex items-center justify-center">
          {/* Video Feed */}
          <video 
            ref={videoRef} 
            className="absolute inset-0 w-full h-full object-cover" 
            playsInline
          />
          
          {/* Dark Overlay with Clear Center for Framing */}
          <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
            <div className="flex-1 bg-black/60 backdrop-blur-[2px]" /> {/* Top */}
            <div className="h-[75%] sm:h-[80%] flex">
              <div className="w-8 sm:w-16 bg-black/60 backdrop-blur-[2px]" /> {/* Left */}
              
              <div className="flex-1 relative border border-white/10 flex items-center justify-center"> {/* Center Clear Area */}
                {/* Corner Brackets */}
                <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                
                {/* Laser line animation */}
                <div className="absolute w-full h-[2px] bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.9)] animate-scan" />
                
                {/* Center Reticle */}
                <Focus className="text-white/20 w-12 h-12" />

                {/* Helper text */}
                <div className="absolute bottom-6 left-0 right-0 text-center">
                  <p className="text-white/90 font-medium text-sm bg-black/50 inline-block px-4 py-1.5 rounded-full backdrop-blur-md shadow-lg border border-white/10">
                    Encuadra la planilla completa aquí
                  </p>
                </div>
              </div>
              
              <div className="w-8 sm:w-16 bg-black/60 backdrop-blur-[2px]" /> {/* Right */}
            </div>
            <div className="flex-1 bg-black/60 backdrop-blur-[2px]" /> {/* Bottom */}
          </div>

          {/* Controls Overlay */}
          <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center gap-4 px-4">
            <button
              onClick={capturar}
              className="bg-white text-gray-900 font-bold px-8 py-4 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:bg-gray-100 hover:scale-105 transition-all flex items-center gap-2"
            >
              <Camera className="w-5 h-5" /> Capturar Planilla
            </button>
            <button
              onClick={detenerCamara}
              className="bg-gray-900/80 backdrop-blur-md text-white px-6 py-4 rounded-full shadow-lg border border-white/10 hover:bg-gray-800 hover:scale-105 transition-all"
              title="Cancelar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-4 max-w-2xl mx-auto">
          <button
            onClick={iniciarCamara}
            className="flex-1 flex flex-col items-center justify-center gap-3 bg-blue-600 text-white p-8 rounded-2xl font-bold hover:bg-blue-700 hover:shadow-lg hover:-translate-y-1 transition-all group"
          >
            <div className="bg-white/20 p-4 rounded-full group-hover:scale-110 transition-transform">
              <Camera className="w-8 h-8" />
            </div>
            <span>Usar Cámara del Dispositivo</span>
          </button>

          <label className="flex-1 flex flex-col items-center justify-center gap-3 bg-white text-gray-700 p-8 rounded-2xl font-bold border-2 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 hover:-translate-y-1 transition-all cursor-pointer group">
            <div className="bg-gray-100 p-4 rounded-full group-hover:bg-blue-100 group-hover:scale-110 transition-all">
              <Upload className="w-8 h-8" />
            </div>
            <span>Subir desde la Galería</span>
            <input type="file" accept="image/*" className="hidden" onChange={manejarArchivo} />
          </label>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
