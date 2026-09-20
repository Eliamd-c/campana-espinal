"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Camara } from "@/components/escanear/Camara";
import { TablaRevision } from "@/components/escanear/TablaRevision";
import {
  procesarPlanilla,
  fusionarRegistros,
  ArchivoPlanilla,
  RegistroEscaneado,
  ErrorOcr,
} from "@/lib/ocr";

type Estado = "inicio" | "procesando" | "revision" | "completado";

export default function EscanearPage() {
  const [estado, setEstado] = useState<Estado>("inicio");
  const [archivos, setArchivos] = useState<ArchivoPlanilla[]>([]);
  const [indiceActual, setIndiceActual] = useState(0);
  const [progreso, setProgreso] = useState(0);
  const [registros, setRegistros] = useState<RegistroEscaneado[]>([]);
  const [errorOcr, setErrorOcr] = useState("");
  const [fallidos, setFallidos] = useState<string[]>([]);

  /**
   * Procesa la tanda archivo por archivo.
   *
   * Secuencial y no en paralelo a propósito: la ruta de OCR limita a diez
   * peticiones por minuto y cada una puede tardar lo suyo. Lanzarlas todas a
   * la vez solo conseguiría que la mitad volviera con un 429.
   *
   * Si un archivo falla, los demás siguen: en una tanda de ocho hojas, que la
   * tercera salga borrosa no puede tirar abajo las otras siete.
   */
  const manejarCaptura = useCallback(async (tanda: ArchivoPlanilla[]) => {
    setArchivos(tanda);
    setEstado("procesando");
    setErrorOcr("");
    setFallidos([]);
    setProgreso(0);
    setIndiceActual(0);

    const paginas: RegistroEscaneado[][] = [];
    const conError: string[] = [];
    let cortadoPorLimite = false;

    for (let i = 0; i < tanda.length; i++) {
      setIndiceActual(i);
      setProgreso(0);

      try {
        const resultado = await procesarPlanilla(tanda[i].url, (p) => setProgreso(p));
        paginas.push(resultado);
      } catch (err: unknown) {
        conError.push(tanda[i].nombre);

        // Si es el limitador, seguir pidiendo solo suma rechazos.
        if (err instanceof ErrorOcr && err.status === 429) {
          cortadoPorLimite = true;
          break;
        }
      }
    }

    const fusionados = fusionarRegistros(paginas);
    setFallidos(conError);

    if (fusionados.length === 0) {
      setErrorOcr(
        cortadoPorLimite
          ? "Has escaneado demasiadas planillas seguidas. Espera un minuto y vuelve a intentarlo."
          : "No se detectaron registros. Intenta con mayor claridad o luz."
      );
      setEstado("inicio");
      return;
    }

    if (cortadoPorLimite) {
      setErrorOcr(
        "Se alcanzó el límite de escaneos por minuto. Abajo están los registros que sí se leyeron; " +
          "espera un minuto para procesar el resto."
      );
    } else if (conError.length > 0) {
      setErrorOcr(`No se pudieron leer: ${conError.join(", ")}. Los demás archivos sí.`);
    }

    setRegistros(fusionados);
    setEstado("revision");
  }, []);

  const reiniciar = () => {
    setEstado("inicio");
    setArchivos([]);
    setRegistros([]);
    setProgreso(0);
    setIndiceActual(0);
    setErrorOcr("");
    setFallidos([]);
  };

  const vistaPrevia = archivos.find((a) => !a.esPdf);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Escanear Planilla</h1>
          <p className="text-sm text-gray-500 mt-1">
            Fotografía o sube las planillas físicas para registrar los asistentes
          </p>
        </div>
        <div className="flex items-center gap-4">
          {estado === "inicio" && (
            <Link
              href="/escanear/planilla"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
            >
              🖨 Imprimir planilla en blanco
            </Link>
          )}
          {estado !== "inicio" && (
            <button
              onClick={reiniciar}
              className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
            >
              ↩ Nueva captura
            </button>
          )}
        </div>
      </div>

      {/* Aviso de OCR (error total o incidencias parciales) */}
      {errorOcr && (
        <div
          className={`px-4 py-3 rounded-xl text-sm border ${
            estado === "revision"
              ? "bg-yellow-50 border-yellow-300 text-yellow-900"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {errorOcr}
        </div>
      )}

      {/* Estado: Inicio — Cámara */}
      {estado === "inicio" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-700">1. Captura las planillas</h2>
          <Camara onCaptura={manejarCaptura} />
        </div>
      )}

      {/* Estado: Procesando */}
      {estado === "procesando" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-6">
          {archivos[indiceActual] && !archivos[indiceActual].esPdf && (
            <img
              src={archivos[indiceActual].url}
              alt="Planilla en proceso"
              className="max-h-48 rounded-lg object-contain opacity-60"
            />
          )}
          <div className="w-full max-w-sm space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>
                {archivos.length > 1
                  ? `Procesando ${indiceActual + 1} de ${archivos.length}...`
                  : "Procesando con OCR..."}
              </span>
              <span className="font-mono">{progreso}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progreso}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 text-center truncate">
              {archivos[indiceActual]?.nombre ?? "Este proceso puede tardar unos segundos..."}
            </p>
            {archivos[indiceActual]?.esPdf && (
              <p className="text-xs text-gray-400 text-center">
                Un PDF con varias páginas tarda más: se leen todas.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Estado: Revisión */}
      {estado === "revision" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-700">2. Revisa y confirma los datos</h2>
              <p className="text-sm text-gray-500">
                Se detectaron <strong>{registros.length}</strong> registros
                {archivos.length > 1 && (
                  <> de {archivos.length - fallidos.length} de {archivos.length} archivos</>
                )}
                . Revisa los campos marcados en amarillo.
              </p>
            </div>
            {vistaPrevia && (
              <img
                src={vistaPrevia.url}
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
