"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Users, Star, Calendar, TrendingUp, CheckCircle2, XCircle,
  Clock, Sparkles, Send, Trash2, Bot, User, Plus, X,
  BarChart3, MapPin, ThumbsUp, UserCheck, Hash
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
interface Mensaje { rol: "user" | "assistant"; contenido: string; timestamp: string; }
interface Metrica { id: string; label: string; color: string; icon: string; descripcion: string; }

function getSesionId() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("ia_sesion_id");
  if (!id) { id = `sesion_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; localStorage.setItem("ia_sesion_id", id); }
  return id;
}

// ─────────────────────────────────────────────────────────────
// Catálogo completo de métricas disponibles
// ─────────────────────────────────────────────────────────────
const CATALOGO_METRICAS: Metrica[] = [
  { id: "total_contactos",    label: "Total Contactos",         color: "blue",    icon: "users",    descripcion: "Total de personas registradas en la BD" },
  { id: "habilitados",        label: "Habilitados Espinal",     color: "emerald", icon: "check",    descripcion: "Confirmados por la Registraduría con mesa" },
  { id: "no_habilitados",     label: "No Habilitados",          color: "red",     icon: "x",        descripcion: "No votan en El Espinal o cédula cancelada" },
  { id: "pendientes",         label: "Pendientes Consulta",     color: "amber",   icon: "clock",    descripcion: "Sin consultar aún en la Registraduría" },
  { id: "externos",           label: "Votan Fuera",             color: "purple",  icon: "map-pin",  descripcion: "Registrados en otros municipios fuera de El Espinal" },
  { id: "total_lideres",      label: "Líderes Registrados",     color: "purple",  icon: "star",     descripcion: "Total de líderes en la campaña" },
  { id: "total_reuniones",    label: "Total Reuniones",         color: "indigo",  icon: "calendar", descripcion: "Reuniones realizadas" },
  { id: "voto_positivo",      label: "Voto Positivo",           color: "teal",    icon: "thumbs",   descripcion: "Contactos con intención positiva" },
  { id: "voto_indeciso",      label: "Indecisos",               color: "orange",  icon: "barras",   descripcion: "Contactos con intención indecisa" },
  { id: "nuevos_hoy",         label: "Nuevos Hoy",              color: "cyan",    icon: "plus",     descripcion: "Contactos registrados hoy" },
];

const DEFAULT_METRICAS = ["total_contactos", "habilitados", "no_habilitados", "pendientes", "externos"];

const gradients: Record<string, string> = {
  blue:    "from-blue-500 to-blue-600",   emerald: "from-emerald-500 to-emerald-600",
  red:     "from-red-500 to-red-600",     amber:   "from-amber-400 to-amber-500",
  purple:  "from-purple-500 to-purple-600", indigo: "from-indigo-500 to-indigo-600",
  teal:    "from-teal-500 to-teal-600",   orange:  "from-orange-500 to-orange-600",
  cyan:    "from-cyan-500 to-cyan-600",
};

export default function DashboardPage() {
  // ── Métricas ────────────────────────────────────────────────
  const [datos, setDatos] = useState<Record<string, number>>({});
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [metricasActivas, setMetricasActivas] = useState<string[]>(DEFAULT_METRICAS);
  const [mostrarCatalogo, setMostrarCatalogo] = useState(false);

  // ── Chat ────────────────────────────────────────────────────
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [inputChat, setInputChat] = useState("");
  const [cargandoChat, setCargandoChat] = useState(false);
  const [sesionId, setSesionId] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Inicializar
  useEffect(() => {
    const id = getSesionId();
    setSesionId(id);

    // Conectar a la API de métricas en tiempo real con Server-Sent Events (SSE)
    setCargandoDatos(true);
    const eventSource = new EventSource("/api/dashboard/metrics-stream");

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.metricas) {
          setDatos(parsed.metricas);
        }
        setCargandoDatos(false);
      } catch (e) {
        console.error("Error al procesar datos del stream SSE:", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE Connection Error, haciendo fallback a fetch tradicional:", err);
      // Fallback a fetch tradicional si falla SSE
      cargarDatos();
      eventSource.close();
    };

    // Cargar historial del chat
    fetch(`/api/ia/analisis?sesionId=${id}`)
      .then(r => r.json())
      .then(j => {
        if (j.data?.length > 0) {
          setMensajes(j.data.map((m: any) => ({
            rol: m.rol, contenido: m.contenido,
            timestamp: new Date(m.timestamp).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
          })));
        }
      }).catch(() => {});

    // Cargar métricas guardadas
    const guardadas = localStorage.getItem("metricas_activas");
    if (guardadas) setMetricasActivas(JSON.parse(guardadas));

    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes, cargandoChat]);

  const cargarDatos = async () => {
    setCargandoDatos(true);
    try {
      const r = await fetch("/api/dashboard/metricas");
      const j = await r.json();
      if (j.data) setDatos(j.data);
    } catch { } finally { setCargandoDatos(false); }
  };

  // ── Gestión de métricas ──────────────────────────────────────
  const toggleMetrica = (id: string) => {
    const nueva = metricasActivas.includes(id)
      ? metricasActivas.filter(m => m !== id)
      : [...metricasActivas, id];
    setMetricasActivas(nueva);
    localStorage.setItem("metricas_activas", JSON.stringify(nueva));
  };

  // ── Chat ─────────────────────────────────────────────────────
  const enviarMensaje = async () => {
    if (!inputChat.trim() || cargandoChat) return;
    const pregunta = inputChat.trim();
    setInputChat("");
    const hora = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
    
    // Añadir pregunta y mensaje vacío temporal para la IA
    setMensajes(prev => [
      ...prev, 
      { rol: "user", contenido: pregunta, timestamp: hora },
      { rol: "assistant", contenido: "", timestamp: new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) }
    ]);
    setCargandoChat(true);

    try {
      const r = await fetch("/api/ia/analisis", {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "analista", preguntaAnalista: pregunta, sesionId, stream: true })
      });

      if (!r.ok) throw new Error("Error en la respuesta de red");

      if (!r.body) {
        const j = await r.json();
        setMensajes(prev => {
          const actualizados = [...prev];
          if (actualizados.length > 0) {
            actualizados[actualizados.length - 1].contenido = j.data || j.error;
          }
          return actualizados;
        });
        return;
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let acumulado = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        acumulado += chunk;

        setMensajes(prev => {
          const actualizados = [...prev];
          if (actualizados.length > 0) {
            actualizados[actualizados.length - 1].contenido = acumulado;
          }
          return actualizados;
        });
      }
    } catch { 
      setMensajes(prev => {
        const actualizados = [...prev];
        if (actualizados.length > 0) {
          actualizados[actualizados.length - 1].contenido = "Ocurrió un error al contactar el servidor.";
        }
        return actualizados;
      });
    } finally { 
      setCargandoChat(false); 
    }
  };

  const limpiarChat = () => {
    const nuevoId = `sesion_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem("ia_sesion_id", nuevoId);
    setSesionId(nuevoId);
    setMensajes([]);
  };

  const getIcono = (icon: string) => {
    const cls = "w-7 h-7";
    switch (icon) {
      case "users":    return <Users className={cls} />;
      case "check":   return <CheckCircle2 className={cls} />;
      case "x":       return <XCircle className={cls} />;
      case "clock":   return <Clock className={cls} />;
      case "star":    return <Star className={cls} />;
      case "calendar":return <Calendar className={cls} />;
      case "thumbs":  return <ThumbsUp className={cls} />;
      case "barras":  return <BarChart3 className={cls} />;
      case "plus":    return <Plus className={cls} />;
      case "map-pin": return <MapPin className={cls} />;
      default:        return <Hash className={cls} />;
    }
  };

  const metricasVisibles = CATALOGO_METRICAS.filter(m => metricasActivas.includes(m.id));
  const metricasDisponibles = CATALOGO_METRICAS.filter(m => !metricasActivas.includes(m.id));

  return (
    <div className="space-y-8 p-1">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600">
            Panel Central
          </h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Monitoreo en tiempo real · Campaña El Espinal</p>
        </div>
        <button onClick={() => setMostrarCatalogo(!mostrarCatalogo)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-blue-400 text-gray-600 hover:text-blue-600 rounded-xl text-sm font-semibold transition shadow-sm">
          <Plus className="w-4 h-4" /> Personalizar métricas
        </button>
      </div>

      {/* Catálogo de métricas personalizables (MODAL) */}
      {mostrarCatalogo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMostrarCatalogo(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-800">Panel de Control de Métricas</h3>
                <p className="text-sm text-gray-500">Selecciona las métricas que deseas ver en tu panel principal.</p>
              </div>
              <button onClick={() => setMostrarCatalogo(false)} className="p-2 hover:bg-gray-100 rounded-full transition">
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CATALOGO_METRICAS.map(m => {
                const activa = metricasActivas.includes(m.id);
                return (
                  <button key={m.id} onClick={() => toggleMetrica(m.id)}
                    className={`text-left p-4 rounded-2xl border-2 transition-all duration-200 ${activa ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-gray-100 hover:border-gray-300 bg-gray-50"}`}>
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-gray-800">{m.label}</span>
                      {activa && <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">{m.descripcion}</p>
                  </button>
                );
              })}
            </div>
            <div className="mt-8 flex justify-end">
              <button onClick={() => setMostrarCatalogo(false)} className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition shadow-lg shadow-emerald-200">
                Guardar Configuración
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tarjetas de métricas activas */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {metricasVisibles.map(m => (
          <div key={m.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center justify-between hover:scale-[1.02] hover:shadow-md transition-all duration-300 group">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{m.label}</p>
              <p className="text-4xl font-black text-gray-900 mt-2">
                {cargandoDatos ? <span className="text-2xl text-gray-300 animate-pulse">...</span> : (datos[m.id] ?? 0).toLocaleString()}
              </p>
            </div>
            <div className={`h-12 w-12 bg-gradient-to-br ${gradients[m.color]} rounded-2xl flex items-center justify-center text-white shadow-lg transform -rotate-6 group-hover:rotate-0 transition-transform duration-300`}>
              {getIcono(m.icon)}
            </div>
          </div>
        ))}

        {/* Botón añadir si hay espacio */}
        {metricasDisponibles.length > 0 && (
          <button onClick={() => setMostrarCatalogo(true)}
            className="border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-blue-500 transition group">
            <div className="h-10 w-10 rounded-xl border-2 border-dashed border-gray-200 group-hover:border-blue-300 flex items-center justify-center transition">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold">Añadir métrica</span>
          </button>
        )}
      </div>

      {/* Grid principal: Chat + Top Líderes */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Chat Analista (columna principal) ── */}
        <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden" style={{ height: "480px" }}>
          {/* Header del chat */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-bold">Analista IA</span>
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            </div>
            <div className="flex items-center gap-3">
              <Link href="/ia" className="text-xs text-blue-200 hover:text-white transition">Abrir completo →</Link>
              <button onClick={limpiarChat} className="text-blue-200 hover:text-white transition"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
            {mensajes.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
                <Bot className="w-10 h-10 text-blue-200" />
                <p className="text-sm text-gray-400">Pregúntame sobre tus datos de campaña</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {["¿Cuántos habilitados hay?", "¿Estado del censo?", "¿Top barrios?"].map(s => (
                    <button key={s} onClick={() => setInputChat(s)}
                      className="text-xs bg-white border border-blue-100 text-blue-600 px-3 py-1.5 rounded-full hover:bg-blue-50 transition">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mensajes.map((msg, i) => (
              <div key={i} className={`flex items-start gap-2 ${msg.rol === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${msg.rol === "user" ? "bg-blue-600" : "bg-white border border-gray-200 shadow-sm"}`}>
                  {msg.rol === "user" ? <User className="w-3.5 h-3.5 text-white" /> : <Sparkles className="w-3.5 h-3.5 text-blue-500" />}
                </div>
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${msg.rol === "user" ? "bg-blue-600 text-white" : "bg-white text-gray-800 border border-gray-100"}`}>
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {msg.contenido || (cargandoChat && i === mensajes.length - 1 ? "..." : "")}
                  </p>
                  {msg.timestamp && <p className={`text-[10px] mt-1 ${msg.rol === "user" ? "text-blue-200" : "text-gray-400"}`}>{msg.timestamp}</p>}
                </div>
              </div>
            ))}
            {cargandoChat && (!mensajes.length || mensajes[mensajes.length - 1]?.rol !== "assistant" || !mensajes[mensajes.length - 1]?.contenido) && (
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center h-4">
                    {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 bg-white border-t border-gray-100">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 transition">
              <input type="text" className="flex-1 bg-transparent text-sm outline-none text-gray-800 placeholder-gray-400"
                placeholder="Pregunta sobre tus datos..." value={inputChat}
                onChange={e => setInputChat(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !cargandoChat && enviarMensaje()}
                disabled={cargandoChat} />
              <button onClick={enviarMensaje} disabled={!inputChat.trim() || cargandoChat}
                className="w-8 h-8 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center transition disabled:opacity-40">
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Panel lateral: Alertas + Acceso rápido ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Accesos rápidos */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Accesos Rápidos</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/contactos", label: "Contactos", color: "blue", icon: <Users className="w-4 h-4" /> },
                { href: "/lideres",   label: "Líderes",   color: "amber",   icon: <Star className="w-4 h-4" /> },
                { href: "/mensajes",  label: "Mensajes",  color: "purple", icon: <TrendingUp className="w-4 h-4" /> },
                { href: "/ia/documentos", label: "Base IA", color: "indigo", icon: <Sparkles className="w-4 h-4" /> },
              ].map(a => (
                <Link key={a.href} href={a.href}
                  className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 rounded-xl text-sm font-semibold text-gray-600 transition group">
                  <span className="text-gray-400 group-hover:text-blue-500 transition">{a.icon}</span>
                  {a.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Progreso del censo electoral */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Avance Censo Electoral</h3>
            {cargandoDatos ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : (() => {
              const total = datos.total_contactos || 1;
              const hab   = datos.habilitados || 0;
              const noHab = datos.no_habilitados || 0;
              const pend  = datos.pendientes || 0;
              return (
                <div className="space-y-3">
                  {[
                    { label: "Habilitados",   val: hab,   total, color: "bg-emerald-500" },
                    { label: "No Habilitados",val: noHab, total, color: "bg-red-400" },
                    { label: "Pendientes",    val: pend,  total, color: "bg-amber-400" },
                  ].map(b => (
                    <div key={b.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-gray-600">{b.label}</span>
                        <span className="font-bold text-gray-800">{b.val.toLocaleString()} <span className="font-normal text-gray-400">({((b.val / b.total) * 100).toFixed(1)}%)</span></span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${b.color} rounded-full transition-all duration-700`} style={{ width: `${(b.val / b.total) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          {/* Puestos con Baja Cobertura */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-500" /> Puestos Críticos
            </h3>
            <div className="space-y-3">
              {(datos as any).puestos_criticos?.map((p: any) => (
                <div key={p.nombre} className="flex justify-between items-center p-2 rounded-xl bg-red-50/50 border border-red-100/50">
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-gray-800 truncate">{p.nombre}</p>
                    <p className="text-[10px] text-red-600 font-medium">Urgente: Solo {p.contactos} contactos</p>
                  </div>
                  <Link href="/mesas" className="bg-white p-1.5 rounded-lg shadow-sm hover:shadow-md transition">
                    <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                  </Link>
                </div>
              ))}
              {!(datos as any).puestos_criticos?.length && (
                 <p className="text-xs text-gray-400 italic">No hay datos de puestos aún.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
