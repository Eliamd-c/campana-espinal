"use client";

import { RegistroEscaneado } from "@/lib/ocr";
import { useState, useEffect } from "react";

interface TablaRevisionProps {
  registros: RegistroEscaneado[];
  onChange: (registros: RegistroEscaneado[]) => void;
}

const UMBRAL_CONFIANZA = 85;

export function TablaRevision({ registros, onChange }: TablaRevisionProps) {
  const [guardando, setGuardando] = useState<Set<number>>(new Set());
  const [guardados, setGuardados] = useState<Set<number>>(new Set());
  const [errores, setErrores] = useState<Record<number, string>>({});
  const [duplicados, setDuplicados] = useState<Record<number, any>>({});

  // Verificar duplicados cuando cambian los registros
  useEffect(() => {
    const checkAll = async () => {
      const newDuplicados: Record<number, any> = {};
      for (let i = 0; i < registros.length; i++) {
        const cedula = registros[i].cedula.valor;
        if (cedula && cedula.length >= 7) {
          try {
            const res = await fetch(`/api/contactos/${cedula}`);
            if (res.ok) {
              const { data } = await res.ok ? await res.json() : { data: null };
              if (data) newDuplicados[i] = data;
            }
          } catch (e) {
            // Ignorar errores de red en la pre-verificación
          }
        }
      }
      setDuplicados(newDuplicados);
    };

    const timer = setTimeout(checkAll, 1000); // Debounce
    return () => clearTimeout(timer);
  }, [registros]);

  const actualizar = (idx: number, campo: keyof RegistroEscaneado, valor: string) => {
    const nuevos = [...registros];
    nuevos[idx] = {
      ...nuevos[idx],
      [campo]: { valor, confianza: 100 }, // editado manualmente → confianza 100
    };
    onChange(nuevos);
  };

  const guardarFila = async (idx: number) => {
    const r = registros[idx];
    
    // Validación básica
    if (!/^\d{7,12}$/.test(r.cedula.valor)) {
      setErrores(prev => ({ ...prev, [idx]: "Cédula inválida (7-12 dígitos)" }));
      return;
    }

    setGuardando((prev) => new Set(prev).add(idx));
    setErrores((prev) => { const e = { ...prev }; delete e[idx]; return e; });

    try {
      const res = await fetch("/api/contactos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedula: r.cedula.valor,
          nombre: r.nombre.valor,
          telefono: r.telefono.valor,
          barrio: r.barrio.valor,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Error al guardar");
      }

      setGuardados((prev) => new Set(prev).add(idx));
    } catch (err: any) {
      setErrores((prev) => ({ ...prev, [idx]: err.message }));
    } finally {
      setGuardando((prev) => { const s = new Set(prev); s.delete(idx); return s; });
    }
  };

  const claseInput = (idx: number, campo: keyof RegistroEscaneado) => {
    const r = registros[idx];
    const confianza = r[campo].confianza;
    const editado = confianza === 100;
    
    if (editado) return "border-green-300 bg-green-50";
    if (confianza < UMBRAL_CONFIANZA) return "border-yellow-400 bg-yellow-50 text-yellow-900";
    if (campo === 'cedula' && duplicados[idx]) return "border-blue-300 bg-blue-50";
    return "border-gray-200 bg-white";
  };

  if (registros.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-400 inline-block" />
          Revisión necesaria
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300 inline-block" />
          Ya registrado
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-400">
          Tip: El sistema actualizará el registro si la cédula ya existe.
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">#</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Cédula</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Nombre</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Teléfono</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Barrio</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {registros.map((r, idx) => (
              <tr
                key={idx}
                className={`${guardados.has(idx) ? "opacity-40" : ""} transition-opacity`}
              >
                <td className="px-3 py-2 text-gray-400 font-mono text-xs">{idx + 1}</td>
                {(["cedula", "nombre", "telefono", "barrio"] as const).map((campo) => (
                  <td key={campo} className="px-2 py-1">
                    <input
                      value={r[campo].valor}
                      onChange={(e) => actualizar(idx, campo, e.target.value)}
                      disabled={guardados.has(idx)}
                      className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${claseInput(idx, campo)}`}
                      title={campo === 'cedula' && duplicados[idx] ? `Existente: ${duplicados[idx].nombre}` : `Confianza: ${r[campo].confianza}%`}
                    />
                    {campo === 'cedula' && duplicados[idx] && (
                      <p className="text-[10px] text-blue-600 mt-0.5 font-medium">✨ Actualizará a: {duplicados[idx].nombre}</p>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2">
                  {guardados.has(idx) ? (
                    <span className="text-emerald-600 font-bold text-xs flex items-center gap-1">
                      <span>✅</span> Guardado
                    </span>
                  ) : (
                    <button
                      onClick={() => guardarFila(idx)}
                      disabled={guardando.has(idx)}
                      className={`w-full text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                        duplicados[idx] 
                          ? "bg-blue-600 hover:bg-blue-700" 
                          : "bg-emerald-600 hover:bg-emerald-700"
                      } disabled:opacity-50`}
                    >
                      {guardando.has(idx) ? "..." : duplicados[idx] ? "Actualizar" : "Guardar"}
                    </button>
                  )}
                  {errores[idx] && (
                    <p className="text-red-500 text-[10px] mt-1 font-medium leading-tight">{errores[idx]}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
