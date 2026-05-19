"use client";

import { useState, useCallback } from "react";
import { Camara } from "@/components/escanear/Camara";
import { TablaRevision } from "@/components/escanear/TablaRevision";
import { procesarPlanilla, RegistroEscaneado } from "@/lib/ocr";

type Estado = "inicio" | "procesando" | "revision" | "completado";

export default function EscanearPage() {
  const [estado, setEstado] = useState<Estado>("inicio");
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [progreso, setProgreso] = useState(0);
  const [registros, setRegistros] = useState<RegistroEscaneado[]>([]);
  const [errorOcr, setErrorOcr] = useState("");

  const manejarCaptura = useCallback(async (url: string) => {
    setImagenUrl(url);
    setEstado("procesando");
    setErrorOcr("");
    setProgreso(0);

    try {
      const resultado = await procesarPlanilla(url, (p) => setProgreso(p));
      if (resultado.length === 0) {
        setErrorOcr("No se detectaron registros en la imagen. Intenta con mayor claridad o luz.");
        setEstado("inicio");
        return;
      }
      setRegistros(resultado);
      setEstado("revision");
    } catch (err) {
      console.error(err);
      setErrorOcr("Error al procesar la imagen. Intenta de nuevo.");
      setEstado("inicio");
    }
  }, []);

  const reiniciar = () => {
    setEstado("inicio");
    setImagenUrl(null);
    setRegistros([]);
    setProgreso(0);
    setErrorOcr("");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Escanear Planilla</h1>
          <p className="text-sm text-gray-500 mt-1">
            Fotografía la planilla física para registrar los asistentes
          </p>
        </div>
        {estado !== "inicio" && (
          <button
            onClick={reiniciar}
            className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
          >
            ↩ Nueva captura
          </button>
        )}
      </div>

      {/* Error OCR */}
      {errorOcr && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {errorOcr}
        </div>
      )}

      {/* Estado: Inicio — Cámara */}
      {estado === "inicio" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-700">1. Captura la planilla</h2>
          <Camara onCaptura={manejarCaptura} />
        </div>
      )}

      {/* Estado: Procesando */}
      {estado === "procesando" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-6">
          {imagenUrl && (
            <img
              src={imagenUrl}
              alt="Planilla capturada"
              className="max-h-48 rounded-lg object-contain opacity-60"
            />
          )}
          <div className="w-full max-w-sm space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Procesando con OCR...</span>
              <span className="font-mono">{progreso}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progreso}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 text-center">
              Este proceso puede tardar unos segundos...
            </p>
          </div>
        </div>
      )}

      {/* Estado: Revisión */}
      {estado === "revision" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-700">2. Revisa y confirma los datos</h2>
              <p className="text-sm text-gray-500">
                Se detectaron <strong>{registros.length}</strong> registros. Revisa los campos marcados en amarillo.
              </p>
            </div>
            {imagenUrl && (
              <img
                src={imagenUrl}
                alt="Planilla"
                className="h-16 rounded-lg object-contain border border-gray-200 cursor-pointer hover:scale-150 transition-transform"
              />
            )}
          </div>
          <TablaRevision registros={registros} onChange={setRegistros} />
        </div>
      )}
    </div>
  );
}
