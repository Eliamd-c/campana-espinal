"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, Upload, X, Focus, FileText, Trash2 } from "lucide-react";
import { ArchivoPlanilla } from "@/lib/ocr";
import { MAX_BYTES_IMAGEN_OCR, MAX_BYTES_PDF_OCR } from "@/lib/validation";

interface CamaraProps {
  onCaptura: (archivos: ArchivoPlanilla[]) => void;
}

/**
 * Ancho máximo al que se reduce la imagen antes de mandarla al OCR.
 *
 * Un móvil actual saca fotos de 8–12 MP: como data URL son varios MB que
 * tardan en subir por red móvil, agotan el tiempo de la ruta y gastan cuota
 * de más, sin leerse mejor. A 1600 px de ancho una planilla escrita a mano
 * sigue siendo legible de sobra para el modelo.
 */
const ANCHO_MAXIMO = 1600;
const CALIDAD_JPEG = 0.85;

/** Tope de páginas por tanda, para no encadenar veinte llamadas sin querer. */
const MAX_ARCHIVOS = 10;

/**
 * Los topes del servidor están en longitud de data URL; un archivo en base64
 * ocupa aproximadamente 4/3 de su tamaño real. Se comprueba antes de leerlo
 * para no cargar en memoria un PDF que se va a rechazar igual.
 */
const bytesCrudosMaximos = (limiteDataUrl: number) => Math.floor(limiteDataUrl * 0.72);

const TIPOS_IMAGEN = /^image\/(png|jpe?g|webp)$/;

/**
 * Reduce un data URL de imagen si excede ANCHO_MAXIMO. Si algo falla
 * (formato raro, imagen que el navegador no decodifica) se devuelve el
 * original: peor es quedarse sin captura.
 */
function reducirImagen(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      if (img.width <= ANCHO_MAXIMO) {
        resolve(dataUrl);
        return;
      }

      const escala = ANCHO_MAXIMO / img.width;
      const lienzo = document.createElement("canvas");
      lienzo.width = ANCHO_MAXIMO;
      lienzo.height = Math.round(img.height * escala);

      const ctx = lienzo.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      resolve(lienzo.toDataURL("image/jpeg", CALIDAD_JPEG));
    };

    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function leerComoDataUrl(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(String(ev.target?.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(archivo);
  });
}

export function Camara({ onCaptura }: CamaraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activa, setActiva] = useState(false);
  const [error, setError] = useState("");
  const [archivos, setArchivos] = useState<ArchivoPlanilla[]>([]);

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

  /**
   * Captura una página y deja la cámara encendida: una planilla de varias
   * hojas se fotografía de un tirón, sin volver a la pantalla de inicio entre
   * hoja y hoja.
   */
  const capturar = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(video, 0, 0);

    const reducida = await reducirImagen(canvas.toDataURL("image/jpeg", CALIDAD_JPEG));

    setArchivos((prev) => {
      if (prev.length >= MAX_ARCHIVOS) {
        setError(`Máximo ${MAX_ARCHIVOS} páginas por tanda. Procesa estas y sigue con el resto.`);
        return prev;
      }
      return [...prev, { url: reducida, nombre: `Página ${prev.length + 1}`, esPdf: false }];
    });
  }, []);

  const manejarArchivos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const seleccionados = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (seleccionados.length === 0) return;

    const nuevos: ArchivoPlanilla[] = [];
    const rechazados: string[] = [];

    for (const archivo of seleccionados) {
      if (archivos.length + nuevos.length >= MAX_ARCHIVOS) {
        rechazados.push(`${archivo.name} (máximo ${MAX_ARCHIVOS} archivos por tanda)`);
        continue;
      }

      const esPdf = archivo.type === "application/pdf";

      if (!esPdf && !TIPOS_IMAGEN.test(archivo.type)) {
        rechazados.push(`${archivo.name} (formato no admitido)`);
        continue;
      }

      // El tamaño se mira antes de leer: un PDF de 40 MB no tiene por qué
      // pasar por la memoria del navegador para acabar rechazado.
      const limite = bytesCrudosMaximos(esPdf ? MAX_BYTES_PDF_OCR : MAX_BYTES_IMAGEN_OCR);
      if (esPdf && archivo.size > limite) {
        rechazados.push(`${archivo.name} (PDF demasiado grande; divídelo en partes)`);
        continue;
      }

      try {
        const dataUrl = await leerComoDataUrl(archivo);
        // Las imágenes se reducen; el PDF va tal cual porque Gemini lo lee
        // nativo y aquí no hay con qué rasterizarlo.
        nuevos.push({
          url: esPdf ? dataUrl : await reducirImagen(dataUrl),
          nombre: archivo.name,
          esPdf,
        });
      } catch {
        rechazados.push(`${archivo.name} (no se pudo leer)`);
      }
    }

    setArchivos((prev) => [...prev, ...nuevos]);
    setError(rechazados.length > 0 ? `No se añadieron: ${rechazados.join(", ")}.` : "");
  };

  const quitar = (idx: number) => {
    setArchivos((prev) => prev.filter((_, i) => i !== idx));
  };

  const procesar = () => {
    if (archivos.length === 0) return;
    detenerCamara();
    const tanda = archivos;
    setArchivos([]);
    onCaptura(tanda);
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

          {/* Contador de páginas ya capturadas en esta tanda */}
          {archivos.length > 0 && (
            <div className="absolute top-4 left-0 right-0 z-20 flex justify-center">
              <span className="bg-emerald-500 text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-lg">
                {archivos.length} {archivos.length === 1 ? "página capturada" : "páginas capturadas"}
              </span>
            </div>
          )}

          {/* Controls Overlay */}
          <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center gap-4 px-4">
            <button
              onClick={capturar}
              className="bg-white text-gray-900 font-bold px-8 py-4 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:bg-gray-100 hover:scale-105 transition-all flex items-center gap-2"
            >
              <Camera className="w-5 h-5" />
              {archivos.length > 0 ? "Capturar otra" : "Capturar Planilla"}
            </button>
            {archivos.length > 0 && (
              <button
                onClick={procesar}
                className="bg-emerald-600 text-white font-bold px-6 py-4 rounded-full shadow-lg hover:bg-emerald-700 hover:scale-105 transition-all"
              >
                Procesar ({archivos.length})
              </button>
            )}
            <button
              onClick={detenerCamara}
              className="bg-gray-900/80 backdrop-blur-md text-white px-6 py-4 rounded-full shadow-lg border border-white/10 hover:bg-gray-800 hover:scale-105 transition-all"
              title="Cerrar cámara"
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
            <span>Subir Fotos o PDF</span>
            <span className="text-xs font-normal text-gray-400 text-center">
              Varios archivos a la vez · JPG, PNG, WEBP o PDF escaneado
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              multiple
              className="hidden"
              onChange={manejarArchivos}
            />
          </label>
        </div>
      )}

      {/* Tanda pendiente de procesar */}
      {archivos.length > 0 && !activa && (
        <div className="max-w-2xl mx-auto rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">
            {archivos.length} {archivos.length === 1 ? "archivo listo" : "archivos listos"} para procesar
          </p>

          <div className="flex flex-wrap gap-3">
            {archivos.map((a, idx) => (
              <div
                key={idx}
                className="relative w-24 h-24 rounded-lg border border-gray-200 bg-white overflow-hidden flex items-center justify-center"
                title={a.nombre}
              >
                {a.esPdf ? (
                  <div className="flex flex-col items-center gap-1 text-gray-500 px-1">
                    <FileText className="w-7 h-7" />
                    <span className="text-[10px] leading-tight text-center line-clamp-2">{a.nombre}</span>
                  </div>
                ) : (
                  <img src={a.url} alt={a.nombre} className="w-full h-full object-cover" />
                )}

                <button
                  onClick={() => quitar(idx)}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                  title="Quitar"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={procesar}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-5 py-2 rounded-lg transition-all"
            >
              Procesar {archivos.length} {archivos.length === 1 ? "archivo" : "archivos"}
            </button>
            <button
              onClick={iniciarCamara}
              className="bg-white border border-gray-300 hover:border-blue-500 hover:text-blue-700 text-gray-700 text-sm font-bold px-5 py-2 rounded-lg transition-all"
            >
              Añadir con la cámara
            </button>
            <button
              onClick={() => setArchivos([])}
              className="text-gray-500 hover:text-red-600 text-sm font-medium px-2 py-2 transition-colors"
            >
              Vaciar
            </button>
          </div>

          <p className="text-xs text-gray-400">
            Un PDF escaneado puede traer varias planillas dentro: se leen todas sus páginas.
          </p>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
