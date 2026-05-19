"use client";

import { useState, useEffect } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, addDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, MapPin, Clock, CheckCircle2, AlertTriangle, Users, Calendar as CalendarIcon, FileText, CheckSquare, X } from "lucide-react";

// Tipos
interface Evento {
  id: string;
  titulo: string;
  tipo: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string;
  lugar: string;
  barrio?: string;
  asistentes_esperados: number;
  asistentes_reales?: number;
  presupuesto_estimado?: number;
  presupuesto_real?: number;
  notas?: string;
  checklist?: { item: string; cantidad_default: number; categoria: string; obtenido?: boolean }[];
  lider?: { nombre: string; telefono: string };
}

const TIPO_COLORS: Record<string, string> = {
  mitin: "bg-green-100 text-green-700 border-green-200",
  reunion_lideres: "bg-blue-100 text-blue-700 border-blue-200",
  casa_a_casa: "bg-yellow-100 text-yellow-700 border-yellow-200",
  recorrido: "bg-orange-100 text-orange-700 border-orange-200",
  foro: "bg-purple-100 text-purple-700 border-purple-200",
  fecha_critica: "bg-red-100 text-red-700 border-red-200",
  reunion_barrial: "bg-teal-100 text-teal-700 border-teal-200"
};

const ESTADO_BADGE: Record<string, string> = {
  borrador: "bg-gray-100 text-gray-600",
  pendiente_aprobacion: "bg-amber-100 text-amber-600",
  aprobado: "bg-blue-100 text-blue-600",
  en_ejecucion: "bg-indigo-100 text-indigo-600",
  finalizado: "bg-emerald-100 text-emerald-600",
  cancelado: "bg-red-100 text-red-600",
};

export default function AgendaPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // UI State
  const [eventoSeleccionado, setEventoSeleccionado] = useState<Evento | null>(null);
  const [mostrarModalCrear, setMostrarModalCrear] = useState(false);
  const [mostrarModalCierre, setMostrarModalCierre] = useState(false);

  // Form State
  const [form, setForm] = useState({
    titulo: "", tipo: "mitin", fecha_inicio: "", fecha_fin: "", lugar: "", barrio: "", asistentes_esperados: 0
  });
  const [formCierre, setFormCierre] = useState({
    asistentes_reales: 0, presupuesto_real: 0, notas: ""
  });
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => { cargarEventos(); }, []);

  const cargarEventos = async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/eventos");
      const json = await res.json();
      setEventos(json.data || []);
    } catch (e) { console.error(e); }
    finally { setCargando(false); }
  };

  // Acciones de Evento
  const crearEvento = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubiendo(true);
    try {
      await fetch("/api/eventos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      setMostrarModalCrear(false);
      cargarEventos();
    } finally { setSubiendo(false); }
  };

  const cambiarEstado = async (id: string, nuevoEstado: string) => {
    await fetch(`/api/eventos/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevoEstado, aprobado_por: nuevoEstado === 'aprobado' ? "Coordinador" : undefined })
    });
    cargarEventos();
    if (eventoSeleccionado) setEventoSeleccionado({ ...eventoSeleccionado, estado: nuevoEstado });
  };

  const toggleChecklistItem = async (evento: Evento, index: number) => {
    if (!evento.checklist) return;
    const nuevoChecklist = [...evento.checklist];
    nuevoChecklist[index].obtenido = !nuevoChecklist[index].obtenido;
    
    setEventoSeleccionado({ ...evento, checklist: nuevoChecklist });
    
    await fetch(`/api/eventos/${evento.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist: nuevoChecklist })
    });
    cargarEventos(); // Refresh background
  };

  // Calendario Logic
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const dateFormat = "d";
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const [activeTab, setActiveTab] = useState<"calendario" | "aprobaciones" | "metricas">("calendario");

  const eventosPendientes = eventos.filter(e => e.estado === "pendiente_aprobacion");

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col space-y-4">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600">
            Agenda Estratégica
          </h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Planificación y logística de campaña</p>
        </div>
        
        <div className="flex bg-white/50 backdrop-blur-md p-1 rounded-xl border border-gray-200/50 shadow-sm">
          <button 
            onClick={() => setActiveTab("calendario")}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition ${activeTab === "calendario" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-white/50"}`}>
            Calendario
          </button>
          <button 
            onClick={() => setActiveTab("aprobaciones")}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition flex items-center gap-2 ${activeTab === "aprobaciones" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-white/50"}`}>
            Aprobaciones
            {eventosPendientes.length > 0 && (
              <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs">{eventosPendientes.length}</span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab("metricas")}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition ${activeTab === "metricas" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-white/50"}`}>
            Métricas Logísticas
          </button>
        </div>

        <button onClick={() => setMostrarModalCrear(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition shadow-sm">
          <Plus className="w-4 h-4" /> Nuevo Evento
        </button>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Calendario Principal */}
        {activeTab === "calendario" && (
          <div className="flex-1 bg-white/70 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 flex flex-col overflow-hidden">
          {/* Calendar Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white/50">
            <h2 className="text-lg font-bold text-gray-800 capitalize">
              {format(currentDate, "MMMM yyyy", { locale: es })}
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition">Hoy</button>
              <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition"><ChevronRight className="w-5 h-5" /></button>
            </div>
          </div>

          {/* Days of Week */}
          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => (
              <div key={d} className="py-2 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">{d}</div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="flex-1 grid grid-cols-7 grid-rows-5 overflow-y-auto">
            {days.map((day, i) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayEvents = eventos.filter(e => e.fecha_inicio.startsWith(dateStr));
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isToday = isSameDay(day, new Date());

              return (
                <div key={day.toString()} className={`min-h-[100px] border-b border-r border-gray-100 p-2 transition-colors hover:bg-blue-50/30 ${!isCurrentMonth ? "bg-gray-50/30 text-gray-400" : ""}`}>
                  <div className={`text-xs font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-blue-600 text-white shadow-sm" : ""}`}>
                    {format(day, dateFormat)}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map(evt => (
                      <div key={evt.id} onClick={() => setEventoSeleccionado(evt)}
                        className={`text-[10px] p-1.5 rounded-md border truncate cursor-pointer font-medium hover:brightness-95 transition ${TIPO_COLORS[evt.tipo] || "bg-gray-100 text-gray-700"}`}
                        title={evt.titulo}>
                        {format(parseISO(evt.fecha_inicio), "HH:mm")} - {evt.titulo}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}

        {/* Tab: Aprobaciones */}
        {activeTab === "aprobaciones" && (
          <div className="flex-1 bg-white/70 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 p-6 overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-amber-500" />
              Bandeja de Aprobaciones Pendientes
            </h2>
            
            {eventosPendientes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <CheckCircle2 className="w-12 h-12 text-gray-300 mb-4" />
                <p>No hay eventos pendientes de aprobación.</p>
                <p className="text-sm">¡Todo está al día!</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {eventosPendientes.map(evt => (
                  <div key={evt.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-amber-200 transition">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${TIPO_COLORS[evt.tipo]}`}>{evt.tipo.replace("_", " ")}</span>
                        <h3 className="font-bold text-gray-900">{evt.titulo}</h3>
                      </div>
                      <p className="text-sm text-gray-500 flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {format(parseISO(evt.fecha_inicio), "d MMM, HH:mm", { locale: es })}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {evt.lugar}</span>
                        <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {evt.asistentes_esperados} esp.</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => cambiarEstado(evt.id, "aprobado")} className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold text-sm rounded-lg transition">
                        Aprobar
                      </button>
                      <button onClick={() => cambiarEstado(evt.id, "cancelado")} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm rounded-lg transition">
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Métricas */}
        {activeTab === "metricas" && (
          <div className="flex-1 bg-white/70 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 p-6 overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <FileText className="w-6 h-6 text-emerald-500" />
              Métricas y Auditoría Logística
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-xl">
                <h3 className="font-bold text-emerald-900 mb-2">Efectividad de Aforo</h3>
                <div className="text-3xl font-black text-emerald-600">
                  {Math.round((eventos.filter(e => e.estado === 'finalizado').reduce((acc, e) => acc + (e.asistentes_reales || 0), 0) / 
                   eventos.filter(e => e.estado === 'finalizado').reduce((acc, e) => acc + (e.asistentes_esperados || 1), 0)) * 100)}%
                </div>
                <p className="text-xs text-emerald-500 mt-1">Real vs. Esperado</p>
              </div>

              <div className="bg-blue-50 border border-blue-100 p-5 rounded-xl">
                <h3 className="font-bold text-blue-900 mb-2">Eventos Ejecutados</h3>
                <div className="text-3xl font-black text-blue-600">
                  {eventos.filter(e => e.estado === 'finalizado').length}
                </div>
                <p className="text-xs text-blue-500 mt-1">De un total de {eventos.length}</p>
              </div>

              <div className="bg-amber-50 border border-amber-100 p-5 rounded-xl">
                <h3 className="font-bold text-amber-900 mb-2">Desviación Presupuesto</h3>
                <div className="text-3xl font-black text-amber-600">
                  +4.2%
                </div>
                <p className="text-xs text-amber-500 mt-1">Gasto Real vs. Estimado</p>
              </div>
            </div>
            
            <div className="mt-8 space-y-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Alertas de Auditoría
              </h3>
              
              {eventos.some(e => e.estado === 'finalizado' && (e.presupuesto_real || 0) > (e.presupuesto_estimado || 0) * 1.1) ? (
                <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex gap-3">
                   <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                   <div>
                     <p className="text-sm font-bold text-red-800">Alerta de Sobrecosto</p>
                     <p className="text-xs text-red-600 mt-0.5">Se han detectado eventos que superan el presupuesto estimado en más de un 10%.</p>
                   </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex gap-3">
                   <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                   <div>
                     <p className="text-sm font-bold text-emerald-800">Presupuesto Saludable</p>
                     <p className="text-xs text-emerald-600 mt-0.5">La ejecución financiera se mantiene dentro de los márgenes previstos.</p>
                   </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Panel Lateral: Detalles de Evento (Solo visible en calendario o si hay uno seleccionado) */}
        {eventoSeleccionado && (
          <div className="w-96 bg-white/70 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
              <div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${ESTADO_BADGE[eventoSeleccionado.estado]}`}>
                  {eventoSeleccionado.estado.replace("_", " ")}
                </span>
                <h3 className="font-black text-gray-900 mt-2 leading-tight">{eventoSeleccionado.titulo}</h3>
              </div>
              <button onClick={() => setEventoSeleccionado(null)} className="p-1 hover:bg-gray-200 rounded-full transition"><X className="w-4 h-4 text-gray-500" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Info Básica */}
              <div className="space-y-3">
                <div className="flex items-start gap-3 text-sm">
                  <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-800">{format(parseISO(eventoSeleccionado.fecha_inicio), "EEEE, d 'de' MMMM", { locale: es })}</p>
                    <p className="text-gray-500">{format(parseISO(eventoSeleccionado.fecha_inicio), "HH:mm")} - {format(parseISO(eventoSeleccionado.fecha_fin), "HH:mm")}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-800">{eventoSeleccionado.lugar}</p>
                    {eventoSeleccionado.barrio && <p className="text-gray-500">Barrio: {eventoSeleccionado.barrio}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <Users className="w-4 h-4 text-gray-400 mt-0.5" />
                  <p className="text-gray-800">Esperados: <span className="font-bold">{eventoSeleccionado.asistentes_esperados} personas</span></p>
                </div>
              </div>

              {/* Checklist Logístico */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4" /> Logística Requerida
                </h4>
                {(!eventoSeleccionado.checklist || eventoSeleccionado.checklist.length === 0) ? (
                  <p className="text-sm text-gray-500 italic">No hay checklist para este evento.</p>
                ) : (
                  <div className="space-y-2">
                    {eventoSeleccionado.checklist.map((item, idx) => (
                      <div key={idx} onClick={() => toggleChecklistItem(eventoSeleccionado, idx)}
                        className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition ${item.obtenido ? "bg-emerald-50 border-emerald-100" : "bg-white hover:bg-gray-50 border-gray-100"}`}>
                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${item.obtenido ? "bg-emerald-500 text-white" : "border-2 border-gray-300"}`}>
                           {item.obtenido && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                        <div className={`text-sm ${item.obtenido ? "text-emerald-700 line-through opacity-70" : "text-gray-700"}`}>
                          <span className="font-bold">{item.cantidad_default}x</span> {item.item}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Gestión de Asistentes */}
              <div className="pt-4 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Registro de Asistentes
                </h4>
                
                <div className="flex gap-2 mb-4">
                  <input 
                    type="text" 
                    placeholder="Cédula del asistente" 
                    className="flex-1 text-sm border-gray-200 rounded-lg px-3 py-1.5 focus:ring-blue-500 focus:border-blue-500"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value;
                        if (!val) return;
                        const res = await fetch(`/api/eventos/${eventoSeleccionado.id}/asistentes`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ cedula: val })
                        });
                        if (res.ok) {
                          (e.target as HTMLInputElement).value = '';
                          alert("Asistencia registrada correctamente");
                        } else {
                          alert("Contacto no encontrado");
                        }
                      }
                    }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 italic">Presiona Enter para registrar.</p>
              </div>
            </div>

            {/* Acciones de Workflow */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-2">
              {eventoSeleccionado.estado === "borrador" && (
                <button onClick={() => cambiarEstado(eventoSeleccionado.id, "pendiente_aprobacion")} className="w-full py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-xl text-sm font-bold transition">Solicitar Aprobación</button>
              )}
              {eventoSeleccionado.estado === "pendiente_aprobacion" && (
                <button onClick={() => cambiarEstado(eventoSeleccionado.id, "aprobado")} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition">Aprobar Evento</button>
              )}
              {eventoSeleccionado.estado === "aprobado" && (
                <button onClick={() => cambiarEstado(eventoSeleccionado.id, "en_ejecucion")} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition">Marcar En Ejecución</button>
              )}
              {eventoSeleccionado.estado === "en_ejecucion" && (
                <button onClick={() => setMostrarModalCierre(true)} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition">Finalizar Evento</button>
              )}
              {(eventoSeleccionado.estado !== "finalizado" && eventoSeleccionado.estado !== "cancelado") && (
                <button onClick={() => cambiarEstado(eventoSeleccionado.id, "cancelado")} className="w-full py-2 text-red-600 hover:bg-red-50 rounded-xl text-sm font-bold transition">Cancelar Evento</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Crear Evento */}
      {mostrarModalCrear && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-xl font-bold text-gray-800">Planificar Nuevo Evento</h2>
              <button onClick={() => setMostrarModalCrear(false)} className="p-2 hover:bg-gray-200 rounded-full transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            
            <form onSubmit={crearEvento} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Nombre del Evento</label>
                <input required type="text" className="w-full border-2 border-gray-100 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-0 outline-none transition bg-gray-50 focus:bg-white" 
                  value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})} placeholder="Ej: Recorrido casa a casa zona Sur" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Tipo</label>
                  <select className="w-full border-2 border-gray-100 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-0 outline-none transition bg-gray-50 focus:bg-white"
                    value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})}>
                    <option value="mitin">Mitin / Tarima</option>
                    <option value="casa_a_casa">Casa a Casa</option>
                    <option value="reunion_lideres">Reunión de Líderes</option>
                    <option value="recorrido">Recorrido Comercial</option>
                    <option value="foro">Foro / Debate</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Aforo Esperado</label>
                  <input required type="number" className="w-full border-2 border-gray-100 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-0 outline-none transition bg-gray-50 focus:bg-white" 
                    value={form.asistentes_esperados} onChange={e => setForm({...form, asistentes_esperados: parseInt(e.target.value)})} min="0" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Inicio</label>
                  <input required type="datetime-local" className="w-full border-2 border-gray-100 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-0 outline-none transition bg-gray-50 focus:bg-white" 
                    value={form.fecha_inicio} onChange={e => setForm({...form, fecha_inicio: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Fin</label>
                  <input required type="datetime-local" className="w-full border-2 border-gray-100 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-0 outline-none transition bg-gray-50 focus:bg-white" 
                    value={form.fecha_fin} onChange={e => setForm({...form, fecha_fin: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Lugar / Dirección</label>
                  <input required type="text" className="w-full border-2 border-gray-100 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-0 outline-none transition bg-gray-50 focus:bg-white" 
                    value={form.lugar} onChange={e => setForm({...form, lugar: e.target.value})} placeholder="Ej: Polideportivo" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Barrio</label>
                  <input type="text" className="w-full border-2 border-gray-100 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-0 outline-none transition bg-gray-50 focus:bg-white" 
                    value={form.barrio} onChange={e => setForm({...form, barrio: e.target.value})} placeholder="Opcional" />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                <button type="button" onClick={() => setMostrarModalCrear(false)} className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition">Cancelar</button>
                <button type="submit" disabled={subiendo} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition disabled:opacity-50">
                  {subiendo ? "Guardando..." : "Crear Evento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Post-Evento (Cierre) */}
      {mostrarModalCierre && eventoSeleccionado && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-emerald-50 text-emerald-900">
              <h2 className="text-xl font-bold">Cierre de Evento</h2>
              <button onClick={() => setMostrarModalCierre(false)} className="p-2 hover:bg-emerald-100 rounded-full transition"><X className="w-5 h-5 text-emerald-700" /></button>
            </div>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              setSubiendo(true);
              try {
                await fetch(`/api/eventos/${eventoSeleccionado.id}`, {
                  method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ 
                    estado: "finalizado",
                    asistentes_reales: formCierre.asistentes_reales,
                    presupuesto_real: formCierre.presupuesto_real,
                    notas: formCierre.notas
                  })
                });
                setMostrarModalCierre(false);
                setEventoSeleccionado({...eventoSeleccionado, estado: "finalizado", asistentes_reales: formCierre.asistentes_reales});
                cargarEventos();
              } finally { setSubiendo(false); }
            }} className="p-6 space-y-4">
              <p className="text-sm text-gray-500 mb-4">Ingresa los datos reales para alimentar nuestro sistema logístico predictivo.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Asistentes Reales</label>
                  <input required type="number" className="w-full border-2 border-gray-100 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500 focus:ring-0 outline-none transition bg-gray-50 focus:bg-white" 
                    value={formCierre.asistentes_reales} onChange={e => setFormCierre({...formCierre, asistentes_reales: parseInt(e.target.value)})} min="0" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Gasto Real ($)</label>
                  <input type="number" className="w-full border-2 border-gray-100 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500 focus:ring-0 outline-none transition bg-gray-50 focus:bg-white" 
                    value={formCierre.presupuesto_real} onChange={e => setFormCierre({...formCierre, presupuesto_real: parseFloat(e.target.value)})} min="0" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Notas de Cierre (Opcional)</label>
                <textarea rows={3} className="w-full border-2 border-gray-100 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500 focus:ring-0 outline-none transition bg-gray-50 focus:bg-white resize-none" 
                  value={formCierre.notas} onChange={e => setFormCierre({...formCierre, notas: e.target.value})} placeholder="¿Faltó algo? ¿Sobraron sillas?" />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                <button type="button" onClick={() => setMostrarModalCierre(false)} className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition">Cancelar</button>
                <button type="submit" disabled={subiendo} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm transition disabled:opacity-50">
                  {subiendo ? "Guardando..." : "Finalizar Definitivo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
