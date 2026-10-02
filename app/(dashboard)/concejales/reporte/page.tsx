"use client";

/**
 * Reporte "trabajo por concejal".
 *
 * Es donde por fin se contrastan datos: cuántos líderes, reuniones, barrios y
 * personas ÚNICAS trae cada candidato al concejo, y cómo viene la intención de
 * voto de esa gente. Una persona cuenta una sola vez, por su reunión de origen.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Landmark, Loader2 } from "lucide-react";

type Intencion = "positivo" | "negativo" | "indeciso" | "desconocido";

interface Fila {
  id?: number;
  nombre: string | null;
  partido?: string | null;
  numero_tarjeton?: string | null;
  lideres: number;
  reuniones: number;
  barrios: number;
  personas: number;
  intencion: Record<Intencion, number>;
}

const COLOR_INTENCION: Record<Intencion, string> = {
  positivo: "#059669",
  indeciso: "#d97706",
  negativo: "#dc2626",
  desconocido: "#9ca3af",
};

function BarraIntencion({ intencion, total }: { intencion: Record<Intencion, number>; total: number }) {
  if (total === 0) return <span className="text-xs text-gray-400">Sin datos</span>;
  const orden: Intencion[] = ["positivo", "indeciso", "negativo", "desconocido"];
  return (
    <div className="space-y-1">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        {orden.map((k) =>
          intencion[k] > 0 ? (
            <div
              key={k}
              style={{ width: `${(intencion[k] / total) * 100}%`, backgroundColor: COLOR_INTENCION[k] }}
              title={`${k}: ${intencion[k]}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
        <span style={{ color: COLOR_INTENCION.positivo }}>● {intencion.positivo} a favor</span>
        <span style={{ color: COLOR_INTENCION.indeciso }}>● {intencion.indeciso} indeciso</span>
        <span style={{ color: COLOR_INTENCION.negativo }}>● {intencion.negativo} en contra</span>
        <span style={{ color: COLOR_INTENCION.desconocido }}>● {intencion.desconocido} sin dato</span>
      </div>
    </div>
  );
}

export default function ReporteConcejalesPage() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [sinConcejal, setSinConcejal] = useState<Fila | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/concejales/reporte")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setFilas(d.data || []);
        setSinConcejal(d.sin_concejal ? { nombre: "Del alcalde (sin concejal)", ...d.sin_concejal } : null);
      })
      .catch(() => setError("No se pudo cargar el reporte."))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando reporte…
      </div>
    );
  }

  const todas = [...filas, ...(sinConcejal ? [sinConcejal] : [])];
  const totales = todas.reduce(
    (acc, f) => {
      acc.lideres += f.lideres;
      acc.reuniones += f.reuniones;
      acc.personas += f.personas;
      return acc;
    },
    { lideres: 0, reuniones: 0, personas: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Landmark className="w-6 h-6 text-emerald-600" /> Trabajo por concejal
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Personas únicas, reuniones y barrios que trae cada candidato al concejo, con la
            intención de voto de esa gente. Una persona cuenta una sola vez.
          </p>
        </div>
        <Link
          href="/concejales"
          className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a concejales
        </Link>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-md p-3">{error}</div>}

      {/* Totales */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { etiqueta: "Líderes activos", valor: totales.lideres },
          { etiqueta: "Reuniones", valor: totales.reuniones },
          { etiqueta: "Personas únicas", valor: totales.personas },
        ].map((t) => (
          <div key={t.etiqueta} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500">{t.etiqueta}</p>
            <p className="text-2xl font-bold text-gray-800">{t.valor.toLocaleString("es-CO")}</p>
          </div>
        ))}
      </div>

      {todas.length === 0 ? (
        <p className="text-sm text-gray-500">
          Aún no hay datos. Agrega concejales y digitaliza planillas para ver el reporte.
        </p>
      ) : (
        <div className="space-y-3">
          {todas.map((f, i) => (
            <div
              key={f.id ?? `sin-${i}`}
              className={`rounded-2xl border p-5 ${
                f.id ? "bg-white border-gray-100 shadow-sm" : "bg-gray-50 border-dashed border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h3 className="font-bold text-gray-800">{f.nombre || "Sin nombre"}</h3>
                  {(f.partido || f.numero_tarjeton) && (
                    <p className="text-xs text-gray-500">
                      {[f.partido, f.numero_tarjeton].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-5 text-center">
                  <div>
                    <p className="text-lg font-bold text-emerald-700">{f.personas.toLocaleString("es-CO")}</p>
                    <p className="text-[11px] text-gray-500">personas</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-700">{f.reuniones}</p>
                    <p className="text-[11px] text-gray-500">reuniones</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-700">{f.lideres}</p>
                    <p className="text-[11px] text-gray-500">líderes</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-700">{f.barrios}</p>
                    <p className="text-[11px] text-gray-500">barrios</p>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <BarraIntencion intencion={f.intencion} total={f.personas} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
