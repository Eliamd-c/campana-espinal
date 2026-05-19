"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Users, CheckCircle2, XCircle, Trash2, Tag, 
  ChevronRight, Filter, Download, MoreHorizontal,
  Square, CheckSquare, MapPin, AlertCircle
} from "lucide-react";

interface Contacto {
  cedula: string;
  nombre: string | null;
  telefono: string | null;
  barrio: string | null;
  municipio: string | null;
  categoria_problematica: string | null;
  es_nuevo: boolean | null;
  intencion_voto: string | null;
  fecha_registro: string | null;
  lider: { id: number; nombre: string | null } | null;
}

interface Meta {
  total: number;
  locales: number;
  externos: number;
  page: number;
  limit: number;
  pages: number;
}

const CATEGORIAS = [
  "infraestructura",
  "salud",
  "seguridad",
  "educacion",
  "empleo",
  "vivienda",
  "otro",
];

export default function ContactosPage() {
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [barrio, setBarrio] = useState("");
  const [categoria, setCategoria] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [intencion, setIntencion] = useState("");
  const [page, setPage] = useState(1);
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [ejecutandoAccion, setEjecutandoAccion] = useState(false);

  // TanStack Query Cache management
  const { data: queryData, isLoading: cargando } = useQuery({
    queryKey: ["contactos", page, q, barrio, categoria, municipio, intencion],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        ...(q && { q }),
        ...(barrio && { barrio }),
        ...(categoria && { categoria }),
        ...(municipio && { municipio }),
        ...(intencion && { intencion_voto: intencion }),
      });
      const res = await fetch(`/api/contactos?${params}`);
      if (!res.ok) throw new Error("Error fetching contacts");
      return res.json();
    },
  });

  const contactos: Contacto[] = queryData?.data || [];
  const meta = queryData?.meta || { total: 0, locales: 0, externos: 0, page: 1, limit: 50, pages: 1 };

  // Debounce de búsqueda
  const [inputQ, setInputQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(inputQ);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [inputQ]);

  // Handlers de selección
  const toggleSeleccion = (cedula: string) => {
    setSeleccionados(prev => 
      prev.includes(cedula) ? prev.filter(id => id !== cedula) : [...prev, cedula]
    );
  };

  const seleccionarTodos = () => {
    if (seleccionados.length === contactos.length) setSeleccionados([]);
    else setSeleccionados(contactos.map((c: Contacto) => c.cedula));
  };

  const eliminarSeleccionados = async () => {
    if (!window.confirm(`¿Seguro que deseas eliminar ${seleccionados.length} contactos? Esta acción es irreversible.`)) return;
    setEjecutandoAccion(true);
    try {
      const r = await fetch("/api/contactos/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: seleccionados })
      });
      if (r.ok) {
        setSeleccionados([]);
        // Invalida la cache de react-query para refrescar todos los contactos
        queryClient.invalidateQueries({ queryKey: ["contactos"] });
      }
    } catch (error) { console.error(error); }
    finally { setEjecutandoAccion(false); }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado e Indicadores */}
      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestión de Contactos</h1>
            <p className="text-gray-500 font-medium">Administra y segmenta tu base electoral</p>
          </div>
          <div className="flex gap-2">
             <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition shadow-sm">
               <Download className="w-4 h-4" /> Exportar
             </button>
             <Link href="/escanear" className="flex items-center gap-2 px-4 py-2 bg-emerald-600 rounded-xl text-sm font-bold text-white hover:bg-emerald-700 transition shadow-lg shadow-emerald-200">
               <Users className="w-4 h-4" /> Nuevo Contacto
             </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-black text-gray-900">{meta.total.toLocaleString()}</p>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Base Datos</p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-black text-gray-900">
                {meta.locales.toLocaleString()}
              </p>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Votan en El Espinal</p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center">
              <XCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-black text-gray-900">
                {meta.externos.toLocaleString()}
              </p>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Fuera del Municipio</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative">
            <input
              type="text"
              placeholder="Buscar por nombre o cédula..."
              value={inputQ}
              onChange={(e) => setInputQ(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all outline-none"
            />
            <Filter className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          </div>
          
          <select
            value={municipio}
            onChange={(e) => { setMunicipio(e.target.value); setPage(1); }}
            className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:bg-white transition"
          >
            <option value="">Cualquier Ciudad</option>
            <option value="El Espinal">El Espinal</option>
            <option value="OTRO">Otros Municipios</option>
          </select>

          <select
            value={intencion}
            onChange={(e) => { setIntencion(e.target.value); setPage(1); }}
            className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:bg-white transition"
          >
            <option value="">Todas las Intenciones</option>
            <option value="positivo">🟢 Positivo</option>
            <option value="indeciso">🟡 Indeciso</option>
            <option value="negativo">🔴 Negativo</option>
          </select>

          <select
            value={categoria}
            onChange={(e) => { setCategoria(e.target.value); setPage(1); }}
            className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:bg-white transition"
          >
            <option value="">Todas las Categorías</option>
            {CATEGORIAS.map((c: string) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : contactos.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-4xl mb-3">👥</p>
            <p className="font-medium">No se encontraron contactos</p>
            <p className="text-sm mt-1">Ajusta los filtros o escanea una planilla</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <button onClick={seleccionarTodos} className="text-gray-400 hover:text-blue-600 transition">
                      {seleccionados.length === contactos.length && contactos.length > 0 
                        ? <CheckSquare className="w-5 h-5 text-blue-600" /> 
                        : <Square className="w-5 h-5" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-bold text-gray-400 uppercase text-[10px] tracking-widest">Identificación</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-400 uppercase text-[10px] tracking-widest">Nombre Completo</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-400 uppercase text-[10px] tracking-widest">Ubicación</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-400 uppercase text-[10px] tracking-widest">Categoría</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-400 uppercase text-[10px] tracking-widest text-center">Intención</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-400 uppercase text-[10px] tracking-widest">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contactos.map((c) => {
                  const isSelected = seleccionados.includes(c.cedula);
                  return (
                    <tr key={c.cedula} className={`group border-b border-gray-50 transition-colors ${isSelected ? "bg-blue-50/50" : "hover:bg-gray-50/80"}`}>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSeleccion(c.cedula)} className="transition">
                          {isSelected ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-200 group-hover:text-gray-300" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold text-gray-900">{c.cedula}</p>
                        <p className="text-[10px] text-gray-400 font-medium">{new Date(c.fecha_registro!).toLocaleDateString()}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/contactos/${c.cedula}`} className="font-bold text-gray-800 hover:text-blue-600 block truncate max-w-[200px]">
                          {c.nombre || "—"}
                        </Link>
                        <p className="text-xs text-gray-500">{c.telefono || "Sin teléfono"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs font-medium">{c.barrio || "—"}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 uppercase font-bold ml-5">{c.municipio}</p>
                      </td>
                      <td className="px-4 py-3">
                        {c.categoria_problematica ? (
                          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-purple-100 uppercase tracking-tighter">
                            <Tag className="w-3 h-3" /> {c.categoria_problematica}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          {c.intencion_voto === "positivo" && <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200" />}
                          {c.intencion_voto === "negativo" && <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm shadow-red-200" />}
                          {c.intencion_voto === "indeciso" && <div className="w-3 h-3 rounded-full bg-amber-500 shadow-sm shadow-amber-200" />}
                          {(!c.intencion_voto || c.intencion_voto === "desconocido") && <div className="w-3 h-3 rounded-full bg-gray-200" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                         <Link href={`/contactos/${c.cedula}`} className="p-2 hover:bg-white rounded-lg transition inline-block text-gray-400 hover:text-blue-600 border border-transparent hover:border-gray-100">
                           <ChevronRight className="w-5 h-5" />
                         </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {meta.pages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-600">
            <span>Página {meta.page} de {meta.pages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50 transition"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                disabled={page === meta.pages}
                className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50 transition"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Barra de Acciones Masivas */}
      {seleccionados.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-8 z-50 animate-in slide-in-from-bottom-10 duration-300">
          <div className="flex items-center gap-3 pr-8 border-r border-gray-700">
            <div className="bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
              {seleccionados.length}
            </div>
            <span className="text-sm font-bold">Seleccionados</span>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              disabled={ejecutandoAccion}
              className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-white transition"
            >
              <Tag className="w-4 h-4" /> Categoría
            </button>
            <button 
              onClick={eliminarSeleccionados}
              disabled={ejecutandoAccion}
              className="flex items-center gap-2 text-sm font-bold text-red-400 hover:text-red-300 transition"
            >
              <Trash2 className="w-4 h-4" /> {ejecutandoAccion ? "Eliminando..." : "Eliminar"}
            </button>
            <button 
              onClick={() => setSeleccionados([])}
              className="ml-4 px-4 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-xs font-bold transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
