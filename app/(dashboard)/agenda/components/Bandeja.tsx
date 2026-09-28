"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Clock,
  X,
  Copy,
  Inbox,
  Loader2,
  MapPin,
  User,
  CalendarPlus,
  GitBranch,
} from "lucide-react";

/**
 * La bandeja: lo que alguien pidió y falta decidir.
 *
 * Aquí caen los borradores que crea el agente de WhatsApp cuando un líder pide
 * una reunión por chat, y lo que se captura dictando. Son peticiones, no
 * compromisos.
 *
 * Cuatro decisiones, y las cuatro dejan rastro. Ninguna borra nada, porque la
 * pregunta «¿qué pasó con lo que pedí?» llega siempre, y llega a los tres días.
 */

interface Solicitud {
  id: string;
  titulo: string;
  fecha_inicio: string;
  barrio: string | null;
  direccion: string | null;
  responsable: string | null;
  estado: string;
  pospuesto_hasta: string | null;
  grupo_opciones: string | null;
  asistentes_esperados: number | null;
  texto_original: string | null;
  fecha_creado: string;
  plantilla: { nombre: string; icono: string | null };
  campos_por_confirmar: { campo: string }[];
  recursos_solicitados: { item: string; cantidad_solicitada: number | null }[];
}

interface EnPie {
  id: string;
  titulo: string;
  fecha_inicio: string;
  barrio: string | null;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });

export function Bandeja({ alDecidir }: { alDecidir?: () => void }) {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [enPie, setEnPie] = useState<EnPie[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /** Qué formulario está abierto: posponer o duplicar, y sobre cuál. */
  const [abierto, setAbierto] = useState<{
    id: string;
    que: "posponer" | "duplicar" | "alternativa";
  } | null>(null);
  const [hasta, setHasta] = useState("");
  const [originalId, setOriginalId] = useState("");
  const [otraFecha, setOtraFecha] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/agenda/bandeja");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo leer la bandeja");
      setSolicitudes(json.data.solicitudes);
      setEnPie(json.data.enPie);
      setError(null);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function decidir(id: string, cuerpo: Record<string, unknown>, mensaje: string) {
    setOcupado(id);
    setError(null);
    try {
      const res = await fetch(`/api/agenda/${id}/decidir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo completar");

      setAbierto(null);
      setAviso(mensaje);
      await cargar();
      alDecidir?.();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setOcupado(null);
    }
  }

  function rechazarCon(id: string) {
    /**
     * Se pide el motivo porque un rechazo sin explicación es lo mismo que un
     * borrado: quien lo pidió pregunta y nadie sabe qué contestarle.
     */
    const motivo = window.prompt("¿Por qué no va? Lo verá quien pregunte después.");
    if (!motivo || motivo.trim().length < 3) return;
    decidir(id, { accion: "rechazar", motivo: motivo.trim() }, "Solicitud rechazada.");
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
          <Inbox className="w-5 h-5 text-indigo-600" />
          Solicitudes por decidir
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {cargando
            ? "Cargando…"
            : solicitudes.length === 0
              ? "Nada esperando decisión."
              : `${solicitudes.length} esperando${solicitudes.length === 1 ? "" : " decisión"}.`}
        </p>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        {aviso && <p className="text-sm text-emerald-700 mt-2">{aviso}</p>}
      </div>

      {!cargando && solicitudes.length === 0 && (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
          <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-700">Bandeja vacía</p>
          <p className="text-sm text-slate-500 mt-1">
            Aquí llega lo que piden por WhatsApp y lo que dictas, antes de entrar en la agenda.
            Cada una se acepta, se aparca para más adelante, se marca como repetida o se
            rechaza diciendo por qué.
          </p>
        </div>
      )}

      {solicitudes.map((s) => (
        <div key={s.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {s.plantilla.icono ? `${s.plantilla.icono} ` : ""}
                  {s.titulo}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{fecha(s.fecha_inicio)}</span>
                  {(s.barrio || s.direccion) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {[s.barrio, s.direccion].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {s.responsable && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {s.responsable}
                    </span>
                  )}
                </p>
              </div>

              {s.grupo_opciones && (
                <span className="shrink-0 px-2 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  Una de varias fechas
                </span>
              )}
              {s.estado === "pospuesto" && s.pospuesto_hasta && (
                <span className="shrink-0 px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                  Vuelve el {new Date(s.pospuesto_hasta).toLocaleDateString("es-CO")}
                </span>
              )}
            </div>

            {s.recursos_solicitados.length > 0 && (
              <p className="text-xs text-slate-600 mt-2">
                Pide:{" "}
                {s.recursos_solicitados
                  .map((r) => (r.cantidad_solicitada ? `${r.cantidad_solicitada} ${r.item}` : r.item))
                  .join(", ")}
              </p>
            )}

            {s.campos_por_confirmar.length > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                Falta: {s.campos_por_confirmar.map((c) => c.campo).join(", ")}
              </p>
            )}

            {s.texto_original && (
              <p className="text-xs text-slate-400 mt-2 italic line-clamp-2">
                «{s.texto_original}»
              </p>
            )}
          </div>

          <div className="px-4 py-3 flex flex-wrap gap-2">
            {ocupado === s.id ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            ) : (
              <>
                <button
                  onClick={() =>
                    decidir(
                      s.id,
                      { accion: "aceptar" },
                      s.grupo_opciones
                        ? "Aceptada. Las otras fechas quedaron libres."
                        : "Aceptada: queda como cupo."
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  <Check className="w-4 h-4" /> Aceptar
                </button>
                <button
                  onClick={() => {
                    setAbierto({ id: s.id, que: "posponer" });
                    setHasta("");
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
                >
                  <Clock className="w-4 h-4" /> Más adelante
                </button>
                <button
                  onClick={() => {
                    setAbierto({ id: s.id, que: "duplicar" });
                    setOriginalId("");
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
                >
                  <Copy className="w-4 h-4" /> Ya está pedida
                </button>
                <button
                  onClick={() => {
                    setAbierto({ id: s.id, que: "alternativa" });
                    setOtraFecha("");
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
                >
                  <CalendarPlus className="w-4 h-4" /> Otra fecha posible
                </button>
                <button
                  onClick={() => rechazarCon(s.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50"
                >
                  <X className="w-4 h-4" /> No va
                </button>
              </>
            )}
          </div>

          {abierto?.id === s.id && abierto.que === "posponer" && (
            <div className="px-4 pb-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
              <label className="text-sm">
                <span className="block text-xs text-slate-500 mb-1">Vuelve a la bandeja el</span>
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <button
                disabled={!hasta}
                onClick={() =>
                  decidir(
                    s.id,
                    { accion: "posponer", hasta: new Date(`${hasta}T08:00:00`).toISOString() },
                    "Aparcada. Vuelve sola ese día."
                  )
                }
                className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium disabled:opacity-40"
              >
                Aparcar
              </button>
            </div>
          )}

          {abierto?.id === s.id && abierto.que === "alternativa" && (
            <div className="px-4 pb-4 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500 mb-2">
                «El jueves o el viernes». Se aparta también ese día, y al escoger uno el otro
                se libera solo.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  <span className="block text-xs text-slate-500 mb-1">Otro día posible</span>
                  <input
                    type="datetime-local"
                    value={otraFecha}
                    onChange={(e) => setOtraFecha(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                <button
                  disabled={!otraFecha}
                  onClick={() =>
                    decidir(
                      s.id,
                      { accion: "alternativa", fecha_inicio: new Date(otraFecha).toISOString() },
                      "Apartada también esa fecha."
                    )
                  }
                  className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium disabled:opacity-40"
                >
                  Apartar también
                </button>
              </div>
            </div>
          )}

          {abierto?.id === s.id && abierto.que === "duplicar" && (
            <div className="px-4 pb-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
              <label className="text-sm flex-1 min-w-[220px]">
                <span className="block text-xs text-slate-500 mb-1">¿Cuál es la que ya está?</span>
                <select
                  value={originalId}
                  onChange={(e) => setOriginalId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Elige la reunión…</option>
                  {enPie.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.titulo} · {new Date(o.fecha_inicio).toLocaleDateString("es-CO")}
                      {o.barrio ? ` · ${o.barrio}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={!originalId}
                onClick={() =>
                  decidir(
                    s.id,
                    { accion: "duplicada", original_id: originalId },
                    "Marcada como repetida y enlazada."
                  )
                }
                className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium disabled:opacity-40"
              >
                Enlazar
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
