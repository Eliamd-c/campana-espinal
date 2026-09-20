"use client";

import { RegistroEscaneado } from "@/lib/ocr";
import { useState, useEffect } from "react";

interface TablaRevisionProps {
  registros: RegistroEscaneado[];
  onChange: (registros: RegistroEscaneado[]) => void;
}

const UMBRAL_CONFIANZA = 85;

const CEDULA_VALIDA = /^\d{7,12}$/;

interface Resumen {
  guardados: number;
  fallidos: number;
  invalidos: number;
}

export function TablaRevision({ registros, onChange }: TablaRevisionProps) {
  const [guardando, setGuardando] = useState<Set<number>>(new Set());
  const [guardados, setGuardados] = useState<Set<number>>(new Set());
  const [errores, setErrores] = useState<Record<number, string>>({});
  const [duplicados, setDuplicados] = useState<Record<number, any>>({});
  const [guardandoTodos, setGuardandoTodos] = useState(false);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  /**
   * Comprueba en una sola petición cuáles de las cédulas leídas ya están en
   * el padrón. Antes se pedía la ficha completa de cada fila por separado, y
   * se relanzaba la tanda entera con cada tecla que el usuario tocara.
   */
  useEffect(() => {
    let cancelado = false;

    const comprobar = async () => {
      const cedulas = registros
        .map((r) => r.cedula.valor)
        .filter((c) => /^\d{7,12}$/.test(c));

      if (cedulas.length === 0) {
        if (!cancelado) setDuplicados({});
        return;
      }

      try {
        const res = await fetch("/api/contactos/comprobar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cedulas }),
        });
        if (!res.ok) return;

        const { data } = await res.json();
        if (cancelado || !data) return;

        const nuevos: Record<number, any> = {};
        registros.forEach((r, i) => {
          const encontrado = data[r.cedula.valor];
          if (encontrado) nuevos[i] = encontrado;
        });
        setDuplicados(nuevos);
      } catch {
        // Ignorar errores de red en la pre-verificación
      }
    };

    const timer = setTimeout(comprobar, 1000); // Debounce
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
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
    if (!CEDULA_VALIDA.test(r.cedula.valor)) {
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

  // Filas que todavía no se han guardado: son las que toca el botón de lote.
  const pendientes = registros
    .map((_, idx) => idx)
    .filter((idx) => !guardados.has(idx));

  /**
   * Campos que el OCR leyó con poca confianza y nadie ha tocado todavía. Se
   * cuentan solo los de filas pendientes: avisar de lo ya guardado no sirve
   * de nada.
   */
  const dudosos = pendientes.reduce((total, idx) => {
    const r = registros[idx];
    return (
      total +
      (["cedula", "nombre", "telefono", "barrio"] as const).filter(
        (campo) => r[campo].confianza < UMBRAL_CONFIANZA
      ).length
    );
  }, 0);

  /**
   * Guarda de una vez todas las filas pendientes.
   *
   * Con veinte registros por planilla, guardar fila a fila son veinte clics y
   * veinte peticiones; en una jornada de campo eso es el cuello de botella
   * real del módulo. Se manda un solo lote a la ruta de importación, que hace
   * upsert igual que el alta individual (una cédula ya existente se actualiza,
   * no se duplica).
   *
   * Las cédulas mal leídas no se envían: se marcan en su fila para que la
   * persona las corrija y vuelva a darle. Mandarlas sería peor que no
   * guardarlas, porque entrarían al padrón con un número inventado.
   */
  const guardarTodos = async () => {
    setResumen(null);

    const invalidos: number[] = [];
    const validos: number[] = [];

    for (const idx of pendientes) {
      if (CEDULA_VALIDA.test(registros[idx].cedula.valor)) {
        validos.push(idx);
      } else {
        invalidos.push(idx);
      }
    }

    setErrores((prev) => {
      const e = { ...prev };
      for (const idx of validos) delete e[idx];
      for (const idx of invalidos) e[idx] = "Cédula inválida (7-12 dígitos)";
      return e;
    });

    if (validos.length === 0) {
      setResumen({ guardados: 0, fallidos: 0, invalidos: invalidos.length });
      return;
    }

    setGuardandoTodos(true);

    try {
      const res = await fetch("/api/contactos/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactos: validos.map((idx) => ({
            cedula: registros[idx].cedula.valor,
            nombre: registros[idx].nombre.valor,
            telefono: registros[idx].telefono.valor,
            barrio: registros[idx].barrio.valor,
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al guardar el lote");

      /**
       * La ruta devuelve totales y la lista de cédulas que fallaron. Se marca
       * como guardada cada fila cuya cédula no aparezca entre los errores, en
       * vez de dar por buena la tanda entera: si media planilla falló, la
       * persona tiene que verlo en la fila concreta.
       */
      const fallidas = new Map<string, string>(
        (json.data?.errores ?? []).map((e: { cedula: string; error: string }) => [e.cedula, e.error])
      );

      const reciénGuardados: number[] = [];
      const nuevosErrores: Record<number, string> = {};

      for (const idx of validos) {
        const fallo = fallidas.get(registros[idx].cedula.valor);
        if (fallo) nuevosErrores[idx] = fallo;
        else reciénGuardados.push(idx);
      }

      setGuardados((prev) => {
        const s = new Set(prev);
        for (const idx of reciénGuardados) s.add(idx);
        return s;
      });
      setErrores((prev) => ({ ...prev, ...nuevosErrores }));
      setResumen({
        guardados: reciénGuardados.length,
        fallidos: Object.keys(nuevosErrores).length,
        invalidos: invalidos.length,
      });
    } catch (err: any) {
      // El lote no llegó: ninguna fila cambia de estado, se puede reintentar.
      setResumen({ guardados: 0, fallidos: validos.length, invalidos: invalidos.length });
      setErrores((prev) => {
        const e = { ...prev };
        for (const idx of validos) e[idx] = err.message || "Error al guardar";
        return e;
      });
    } finally {
      setGuardandoTodos(false);
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

      {/* Guardado en bloque */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="text-sm text-gray-600">
          {pendientes.length > 0 ? (
            <>
              <strong>{pendientes.length}</strong> {pendientes.length === 1 ? "registro pendiente" : "registros pendientes"}
              {dudosos > 0 && (
                <span className="ml-2 text-yellow-700">
                  · {dudosos} {dudosos === 1 ? "campo sin revisar" : "campos sin revisar"} (en amarillo)
                </span>
              )}
            </>
          ) : (
            <span className="text-emerald-700 font-medium">Todos los registros están guardados.</span>
          )}
        </div>

        {pendientes.length > 0 && (
          <button
            onClick={guardarTodos}
            disabled={guardandoTodos}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-lg transition-all"
          >
            {guardandoTodos ? "Guardando..." : `Guardar todos (${pendientes.length})`}
          </button>
        )}
      </div>

      {resumen && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            resumen.fallidos + resumen.invalidos === 0
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-yellow-300 bg-yellow-50 text-yellow-900"
          }`}
        >
          <strong>{resumen.guardados}</strong> {resumen.guardados === 1 ? "registro guardado" : "registros guardados"}
          {resumen.fallidos > 0 && <> · {resumen.fallidos} con error</>}
          {resumen.invalidos > 0 && <> · {resumen.invalidos} con cédula inválida</>}
          {resumen.fallidos + resumen.invalidos > 0 && (
            <span className="block text-xs mt-1">
              Las filas con problema siguen editables abajo: corrígelas y vuelve a guardar.
            </span>
          )}
        </div>
      )}

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
                      disabled={guardando.has(idx) || guardandoTodos}
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
