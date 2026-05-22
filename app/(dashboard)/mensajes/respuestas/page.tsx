"use client";

import { useEffect, useState } from "react";
import { 
  MessageSquare, User, AlertCircle, CheckCircle2, ThumbsUp, 
  ThumbsDown, Minus, Search, Calendar, Filter
} from "lucide-react";

interface Respuesta {
  id: number;
  texto: string;
  fecha: string;
  sentimiento: "positivo" | "negativo" | "indeciso" | null;
  requiere_accion: boolean;
  contacto: {
    nombre: string;
    telefono: string;
    cedula: string;
  };
  campana: {
    nombre: string;
  };
}

interface Estadisticas {
  total: number;
  positivas: number;
  requierenAccion: number;
}

export default function RespuestasDashboard() {
  const [respuestas, setRespuestas] = useState<Respuesta[]>([]);
  const [estadisticas, setEstadisticas] = useState<Estadisticas | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resResp, resEst] = await Promise.all([
        fetch("/api/mensajes/respuestas"),
        fetch("/api/mensajes/respuestas/estadisticas")
      ]);
      
      const dataResp = await resResp.json();
      const dataEst = await resEst.json();
      
      if (dataResp.data) setRespuestas(dataResp.data);
      if (dataEst) setEstadisticas(dataEst);
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  };

  const SentimentIcon = ({ type }: { type: string | null }) => {
    if (type === "positivo") return <ThumbsUp className="w-4 h-4 text-green-500" />;
    if (type === "negativo") return <ThumbsDown className="w-4 h-4 text-red-500" />;
    if (type === "indeciso") return <Minus className="w-4 h-4 text-yellow-500" />;
    return <MessageSquare className="w-4 h-4 text-gray-400" />;
  };

  if (cargando) {
    return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Bandeja de Respuestas</h1>
          <p className="text-slate-500">Analiza lo que los ciudadanos dicen de tus campañas</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Respuestas</p>
            <p className="text-2xl font-bold text-slate-800">{estadisticas?.total || 0}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <ThumbsUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Sentimiento Positivo</p>
            <p className="text-2xl font-bold text-slate-800">{estadisticas?.positivas || 0}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex items-center space-x-4">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-lg">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Requieren Acción</p>
            <p className="text-2xl font-bold text-slate-800">{estadisticas?.requierenAccion || 0}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex relative w-full md:w-96">
          <Search className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por mensaje, nombre o teléfono..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100">
            <Filter className="w-4 h-4" /> Filtros
          </button>
        </div>
      </div>

      {/* Lista de Respuestas */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {respuestas.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No hay respuestas registradas aún.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {respuestas.map((resp) => (
              <div key={resp.id} className="p-6 hover:bg-slate-50 transition-colors">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* Info Contacto */}
                  <div className="md:w-64 flex-shrink-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                        {resp.contacto?.nombre?.charAt(0) || <User className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{resp.contacto?.nombre || "Desconocido"}</p>
                        <p className="text-xs text-slate-500">{resp.contacto?.telefono}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                        Campaña: {resp.campana?.nombre || "Directo"}
                      </span>
                    </div>
                  </div>

                  {/* Mensaje */}
                  <div className="flex-1 bg-slate-50 border border-slate-100 rounded-lg p-4 relative">
                    <div className="absolute -left-2 top-4 w-4 h-4 bg-slate-50 border-t border-l border-slate-100 transform -rotate-45"></div>
                    <p className="text-slate-700 whitespace-pre-wrap">{resp.texto}</p>
                    <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(resp.fecha).toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <SentimentIcon type={resp.sentimiento} />
                        {resp.sentimiento ? resp.sentimiento.charAt(0).toUpperCase() + resp.sentimiento.slice(1) : "Sin clasificar"}
                      </span>
                      {resp.requiere_accion && (
                        <span className="flex items-center gap-1 text-rose-600 font-medium">
                          <AlertCircle className="w-3.5 h-3.5" /> Requiere acción
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex md:flex-col gap-2">
                    <button className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors">
                      Responder
                    </button>
                    {resp.requiere_accion && (
                      <button className="px-3 py-1.5 text-sm font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors">
                        Marcar Resuelto
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
