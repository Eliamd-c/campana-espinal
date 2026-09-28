"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, User, Users, AlertTriangle, CalendarClock, Sun } from "lucide-react";

/**
 * Lo que sigue, en grande.
 *
 * Es la pantalla del carro. El candidato pregunta «¿qué tengo ahora?» y hay
 * que contestar en dos segundos, mirando un teléfono a contraluz: por eso lo
 * siguiente ocupa media pantalla y lo demás va en una lista corta debajo.
 *
 * Solo aparece lo apartado y lo confirmado. Un borrador todavía no es un plan
 * y no tiene nada que hacer aquí: quien lee esto está a punto de subirse a un
 * carro, no de decidir.
 */

interface Recurso {
  item: string;
  estado: string;
  cantidad_solicitada: number | null;
  cantidad_conseguida: number | null;
  responsable: string | null;
}

interface Evento {
  id: string;
  titulo: string;
  fecha_inicio: string;
  barrio: string | null;
  direccion: string | null;
  responsable: string | null;
  asistentes_esperados: number | null;
  notas: string | null;
  estado: string;
  plantilla: { nombre: string; icono: string | null };
  campos_por_confirmar: { campo: string }[];
  recursos_pendientes: Recurso[];
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });

const esHoy = (iso: string) => {
  const d = new Date(iso);
  const h = new Date();
  return (
    d.getDate() === h.getDate() && d.getMonth() === h.getMonth() && d.getFullYear() === h.getFullYear()
  );
};

/** Un enlace de mapa ahorra copiar la dirección a mano en la calle. */
function mapa(e: Evento): string | null {
  const donde = [e.direccion, e.barrio, "El Espinal, Tolima"].filter(Boolean).join(", ");
  return e.direccion || e.barrio ? `https://maps.google.com/?q=${encodeURIComponent(donde)}` : null;
}

function Pendientes({ evento }: { evento: Evento }) {
  const falta = evento.campos_por_confirmar.map((c) => c.campo);
  const porConseguir = evento.recursos_pendientes.map((r) =>
    r.cantidad_solicitada ? `${r.cantidad_solicitada} ${r.item}` : r.item
  );

  if (falta.length === 0 && porConseguir.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
      <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" />
        Pendiente
      </p>
      {porConseguir.length > 0 && (
        <p className="text-sm text-amber-900 mt-1">Por conseguir: {porConseguir.join(", ")}</p>
      )}
      {falta.length > 0 && (
        <p className="text-sm text-amber-900 mt-0.5">Sin confirmar: {falta.join(", ")}</p>
      )}
    </div>
  );
}

export function Hoy() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/agenda/hoy");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo leer la agenda");
      setEventos(json.data);
      setError(null);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    /**
     * Se refresca cada minuto porque el acto «siguiente» cambia solo con el
     * paso del tiempo: a las 6:31 lo de las 6:30 ya no es lo que viene.
     */
    const reloj = setInterval(cargar, 60_000);
    return () => clearInterval(reloj);
  }, [cargar]);

  const ahora = Date.now();
  const proximos = eventos.filter((e) => new Date(e.fecha_inicio).getTime() >= ahora - 60 * 60 * 1000);
  const siguiente = proximos[0];
  const despues = proximos.slice(1);

  if (cargando) return <p className="text-sm text-slate-500">Cargando…</p>;

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  if (!siguiente) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
        <Sun className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <p className="font-medium text-slate-700">No queda nada para hoy ni mañana</p>
        <p className="text-sm text-slate-500 mt-1">
          Aquí aparece lo apartado y lo confirmado de las próximas horas, con la dirección y lo
          que falte por conseguir.
        </p>
      </div>
    );
  }

  const enlace = mapa(siguiente);

  return (
    <div className="space-y-4">
      {/* Lo siguiente, en grande: es lo único que se mira de pie. */}
      <div className="bg-white rounded-2xl shadow-sm border-2 border-indigo-200 p-5 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          {esHoy(siguiente.fecha_inicio) ? "Ahora sigue" : "Mañana"}
        </p>

        <div className="flex items-baseline gap-3 mt-1 flex-wrap">
          <span className="text-4xl md:text-5xl font-bold text-slate-900 tabular-nums">
            {hora(siguiente.fecha_inicio)}
          </span>
          {siguiente.estado === "cupo" && (
            <span className="px-2 py-1 rounded-md text-xs font-semibold bg-amber-100 text-amber-800">
              Sin confirmar
            </span>
          )}
        </div>

        <h2 className="text-xl md:text-2xl font-bold text-slate-900 mt-2">
          {siguiente.plantilla.icono ? `${siguiente.plantilla.icono} ` : ""}
          {siguiente.titulo}
        </h2>

        <div className="mt-3 space-y-1.5 text-slate-700">
          {(siguiente.direccion || siguiente.barrio) && (
            <p className="flex items-start gap-2 text-base">
              <MapPin className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              <span>
                {[siguiente.direccion, siguiente.barrio].filter(Boolean).join(" · ")}
                {enlace && (
                  <a
                    href={enlace}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-indigo-600 underline text-sm"
                  >
                    abrir mapa
                  </a>
                )}
              </span>
            </p>
          )}
          {siguiente.responsable && (
            <p className="flex items-center gap-2 text-base">
              <User className="w-5 h-5 text-slate-400 shrink-0" />
              Lo recibe {siguiente.responsable}
            </p>
          )}
          {siguiente.asistentes_esperados ? (
            <p className="flex items-center gap-2 text-base">
              <Users className="w-5 h-5 text-slate-400 shrink-0" />
              {siguiente.asistentes_esperados} personas esperadas
            </p>
          ) : null}
        </div>

        {siguiente.notas && (
          <p className="mt-3 text-sm text-slate-600 border-l-2 border-slate-200 pl-3">
            {siguiente.notas}
          </p>
        )}

        <Pendientes evento={siguiente} />
      </div>

      {despues.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <p className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100 flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" />
            Después
          </p>
          <ul className="divide-y divide-slate-100">
            {despues.map((e) => (
              <li key={e.id} className="px-4 py-3 flex items-start gap-3">
                <span className="text-sm font-bold text-slate-900 tabular-nums w-20 shrink-0">
                  {esHoy(e.fecha_inicio) ? "" : "mañana "}
                  {hora(e.fecha_inicio)}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800 truncate">{e.titulo}</span>
                  {(e.barrio || e.direccion) && (
                    <span className="block text-xs text-slate-500 truncate">
                      {[e.direccion, e.barrio].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {(e.recursos_pendientes.length > 0 || e.campos_por_confirmar.length > 0) && (
                    <span className="block text-xs text-amber-700 mt-0.5">
                      {e.recursos_pendientes.length > 0 &&
                        `Falta conseguir ${e.recursos_pendientes.length}`}
                      {e.recursos_pendientes.length > 0 && e.campos_por_confirmar.length > 0 && " · "}
                      {e.campos_por_confirmar.length > 0 &&
                        `${e.campos_por_confirmar.length} sin confirmar`}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
