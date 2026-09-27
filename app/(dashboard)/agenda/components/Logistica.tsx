"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X, RotateCcw, User, MapPin, Package, Loader2 } from "lucide-react";
import { ETIQUETA_RECURSO, urgencia, type EstadoRecurso } from "@/lib/agenda/recursos";

/**
 * Qué hay que conseguir, de todas las reuniones a la vez.
 *
 * Es la pantalla de la mañana. La ficha de una reunión contesta «qué necesita
 * esta»; quien organiza necesita lo contrario, cruzando todos los actos: las
 * 200 sillas del jueves, el sonido del sábado, confirmar al animador. Hasta
 * ahora eso había que armarlo a mano abriendo las reuniones una por una.
 *
 * Se agrupa por reunión porque las gestiones se hacen así —se llama a una
 * persona y se le resuelven tres cosas del mismo acto—, y se ordena por lo
 * que falta para el día, que es lo único que manda.
 */

interface Recurso {
  id: string;
  item: string;
  cantidad_solicitada: number | null;
  cantidad_conseguida: number | null;
  estado: string;
  responsable: string | null;
  notas: string | null;
  dias_restantes: number;
  agendamiento: {
    id: string;
    titulo: string;
    fecha_inicio: string;
    barrio: string | null;
    direccion: string | null;
    estado: string;
    responsable: string | null;
  };
}

const ASPECTO_RECURSO: Record<string, string> = {
  solicitado: "bg-amber-50 border-amber-200",
  conseguido: "bg-sky-50 border-sky-200",
  entregado: "bg-emerald-50 border-emerald-200",
  no_disponible: "bg-red-50 border-red-200",
};

const ASPECTO_URGENCIA: Record<string, string> = {
  vencido: "bg-red-100 text-red-800",
  hoy: "bg-red-600 text-white",
  urgente: "bg-amber-500 text-white",
  proximo: "bg-slate-200 text-slate-700",
  lejano: "bg-slate-100 text-slate-500",
};

function cuandoTexto(dias: number): string {
  if (dias < 0) return `hace ${Math.abs(dias)} d`;
  if (dias === 0) return "HOY";
  if (dias === 1) return "mañana";
  return `en ${dias} d`;
}

export function Logistica() {
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [dias, setDias] = useState(7);
  const [todos, setTodos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/agenda/recursos?dias=${dias}&todos=${todos}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo leer la lista");
      setRecursos(json.data);
      setError(null);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setCargando(false);
    }
  }, [dias, todos]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiar(id: string, cambio: Record<string, unknown>) {
    setGuardando(id);
    try {
      const res = await fetch(`/api/agenda/recursos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambio),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo guardar");
      await cargar();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setGuardando(null);
    }
  }

  /** Se agrupa por reunión, conservando el orden que trae el servidor. */
  const porReunion = recursos.reduce<{ reunion: Recurso["agendamiento"]; dias: number; items: Recurso[] }[]>(
    (grupos, r) => {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.reunion.id === r.agendamiento.id) ultimo.items.push(r);
      else grupos.push({ reunion: r.agendamiento, dias: r.dias_restantes, items: [r] });
      return grupos;
    },
    []
  );

  const pendientes = recursos.filter((r) => r.estado === "solicitado" || r.estado === "no_disponible").length;

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" />
              Qué hay que conseguir
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {cargando
                ? "Cargando…"
                : pendientes === 0
                  ? "No queda nada pendiente en este plazo."
                  : `${pendientes} cosa${pendientes === 1 ? "" : "s"} por resolver.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { valor: 2, texto: "2 días" },
              { valor: 7, texto: "Semana" },
              { valor: 30, texto: "Mes" },
            ].map((o) => (
              <button
                key={o.valor}
                onClick={() => setDias(o.valor)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  dias === o.valor
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {o.texto}
              </button>
            ))}
            <button
              onClick={() => setTodos(!todos)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                todos
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {todos ? "Viendo todo" : "Solo pendiente"}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>

      {!cargando && porReunion.length === 0 && (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
          <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-700">Nada por conseguir</p>
          <p className="text-sm text-slate-500 mt-1">
            Aquí aparece lo que piden las reuniones —sillas, sonido, refrigerios— para que
            puedas ir tachándolo. Se llena solo cuando agendes algo con recursos.
          </p>
        </div>
      )}

      {porReunion.map(({ reunion, dias: faltan, items }) => (
        <div key={reunion.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{reunion.titulo}</p>
              <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                <span>
                  {new Date(reunion.fecha_inicio).toLocaleString("es-CO", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                {(reunion.barrio || reunion.direccion) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {reunion.barrio || reunion.direccion}
                  </span>
                )}
              </p>
            </div>
            <span
              className={`shrink-0 px-2 py-1 rounded-md text-xs font-bold ${
                ASPECTO_URGENCIA[urgencia(faltan)]
              }`}
            >
              {cuandoTexto(faltan)}
            </span>
          </div>

          <ul className="divide-y divide-slate-100">
            {items.map((r) => (
              <li
                key={r.id}
                className={`px-4 py-3 border-l-4 ${ASPECTO_RECURSO[r.estado] ?? "border-slate-200"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      {r.item}
                      {r.cantidad_solicitada ? (
                        <span className="text-slate-500 font-normal">
                          {" "}
                          · {r.cantidad_conseguida ?? 0}/{r.cantidad_solicitada}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {ETIQUETA_RECURSO[r.estado as EstadoRecurso] ?? r.estado}
                      {r.responsable ? ` · ${r.responsable}` : " · sin responsable"}
                    </p>
                  </div>

                  <div className="flex gap-1.5 shrink-0">
                    {guardando === r.id ? (
                      <Loader2 className="w-5 h-5 animate-spin text-slate-400 mt-1" />
                    ) : (
                      <>
                        {r.estado !== "conseguido" && r.estado !== "entregado" && (
                          <button
                            onClick={() =>
                              cambiar(r.id, {
                                estado: "conseguido",
                                cantidad_conseguida: r.cantidad_solicitada ?? null,
                              })
                            }
                            title="Marcar conseguido"
                            className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        {r.estado === "conseguido" && (
                          <button
                            onClick={() => cambiar(r.id, { estado: "entregado" })}
                            title="Ya está en el sitio"
                            className="px-2.5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800"
                          >
                            En el sitio
                          </button>
                        )}
                        {r.estado !== "no_disponible" && r.estado !== "entregado" && (
                          <button
                            onClick={() => cambiar(r.id, { estado: "no_disponible" })}
                            title="No se consiguió"
                            className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        {(r.estado === "entregado" || r.estado === "no_disponible") && (
                          <button
                            onClick={() =>
                              cambiar(r.id, {
                                estado: r.estado === "entregado" ? "conseguido" : "solicitado",
                              })
                            }
                            title="Volver atrás"
                            className="p-2 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    defaultValue={r.responsable ?? ""}
                    placeholder="¿Quién lo consigue?"
                    onBlur={(e) => {
                      const valor = e.target.value.trim();
                      if (valor !== (r.responsable ?? "")) {
                        cambiar(r.id, { responsable: valor || null });
                      }
                    }}
                    className="flex-1 text-sm border-b border-dashed border-slate-300 focus:border-indigo-500 focus:outline-none py-1 bg-transparent"
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
