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

/**
 * Acento del icono de cada métrica. Color semántico donde el dato lo tiene
 * (habilitados = positivo, no habilitados = negativo, pendientes = indeciso);
 * color de marca en el resto. Menos colores y con significado: un número rojo
 * quiere decir algo, no es decoración.
 */
const acentoMetrica: Record<string, string> = {
  habilitados: "text-pos",
  voto_positivo: "text-pos",
  no_habilitados: "text-neg",
  pendientes: "text-ind",
  voto_indeciso: "text-ind",
  externos: "text-unk",
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
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight text-ink text-balance">
            Panel Central
          </h1>
          <p className="text-sm text-ink-muted font-medium mt-1">Monitoreo en tiempo real · Campaña El Espinal</p>
        </div>
        <button onClick={() => setMostrarCatalogo(!mostrarCatalogo)}
          className="flex items-center gap-2 px-4 py-2 bg-surface border border-line hover:border-brand text-ink-muted hover:text-brand rounded-xl text-sm font-semibold transition shadow-soft flex-shrink-0">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Personalizar métricas</span>
        </button>
      </div>

      {/* Catálogo de métricas personalizables (MODAL) */}
      {mostrarCatalogo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMostrarCatalogo(false)} />
          <div className="relative bg-surface rounded-brand shadow-soft-lg border border-line p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-display font-bold text-ink">Panel de Control de Métricas</h3>
                <p className="text-sm text-ink-muted">Selecciona las métricas que deseas ver en tu panel principal.</p>
              </div>
              <button onClick={() => setMostrarCatalogo(false)} className="p-2 hover:bg-surface-2 rounded-full transition" aria-label="Cerrar">
                <X className="w-6 h-6 text-ink-faint" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CATALOGO_METRICAS.map(m => {
                const activa = metricasActivas.includes(m.id);
                return (
                  <button key={m.id} onClick={() => toggleMetrica(m.id)}
                    className={`text-left p-4 rounded-2xl border-2 transition-all duration-200 ${activa ? "border-brand bg-brand-50 shadow-soft" : "border-line hover:border-ink-faint bg-surface-2"}`}>
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-ink">{m.label}</span>
                      {activa && <CheckCircle2 className="w-5 h-5 text-brand flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-ink-muted mt-2 leading-relaxed">{m.descripcion}</p>
                  </button>
                );
              })}
            </div>
            <div className="mt-8 flex justify-end">
              <button onClick={() => setMostrarCatalogo(false)} className="px-6 py-2.5 bg-brand text-white font-bold rounded-xl hover:bg-brand-700 transition shadow-soft">
                Guardar Configuración
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tarjetas de métricas activas */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {metricasVisibles.map(m => (
          <div key={m.id} className="bg-surface rounded-brand shadow-soft border border-line p-5 flex items-center justify-between hover:-translate-y-0.5 hover:shadow-soft-lg transition-all duration-300">
            <div>
              <p className="text-xs font-semibold text-ink-faint uppercase tracking-wider">{m.label}</p>
              <p className="text-4xl font-display font-extrabold text-ink mt-2 tabular-nums">
                {cargandoDatos ? <span className="text-2xl text-ink-faint animate-pulse">…</span> : (datos[m.id] ?? 0).toLocaleString()}
              </p>
            </div>
            <div className={`h-12 w-12 bg-surface-2 rounded-2xl flex items-center justify-center ${acentoMetrica[m.id] || "text-brand"}`}>
              {getIcono(m.icon)}
            </div>
          </div>
        ))}

        {/* Botón añadir si hay espacio */}
        {metricasDisponibles.length > 0 && (
          <button onClick={() => setMostrarCatalogo(true)}
            className="border-2 border-dashed border-line hover:border-brand rounded-brand p-5 flex flex-col items-center justify-center gap-2 text-ink-faint hover:text-brand transition group">
            <div className="h-10 w-10 rounded-xl border-2 border-dashed border-line group-hover:border-brand flex items-center justify-center transition">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold">Añadir métrica</span>
          </button>
        )}
      </div>

      {/* Grid principal: Chat + Top Líderes */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Chat Analista (columna principal) ── */}
        <div className="lg:col-span-3 bg-surface rounded-brand shadow-soft border border-line flex flex-col overflow-hidden" style={{ height: "480px" }}>
          {/* Header del chat */}
          <div className="flex items-center justify-between px-4 py-3 bg-brand text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-bold">Analista IA</span>
              <div className="w-2 h-2 bg-spark rounded-full animate-pulse" />
            </div>
            <div className="flex items-center gap-3">
              <Link href="/ia" className="text-xs text-white/70 hover:text-white transition">Abrir completo →</Link>
              <button onClick={limpiarChat} className="text-white/70 hover:text-white transition" aria-label="Limpiar chat"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-bg">
            {mensajes.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
                <Bot className="w-10 h-10 text-brand" />
                <p className="text-sm text-ink-muted">Pregúntame sobre tus datos de campaña</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {["¿Cuántos habilitados hay?", "¿Estado del censo?", "¿Top barrios?"].map(s => (
                    <button key={s} onClick={() => setInputChat(s)}
                      className="text-xs bg-surface border border-line text-brand px-3 py-1.5 rounded-full hover:bg-brand-50 transition">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mensajes.map((msg, i) => (
              <div key={i} className={`flex items-start gap-2 ${msg.rol === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${msg.rol === "user" ? "bg-brand" : "bg-surface border border-line shadow-soft"}`}>
                  {msg.rol === "user" ? <User className="w-3.5 h-3.5 text-white" /> : <Sparkles className="w-3.5 h-3.5 text-brand" />}
                </div>
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${msg.rol === "user" ? "bg-brand text-white" : "bg-surface text-ink border border-line"}`}>
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {msg.contenido || (cargandoChat && i === mensajes.length - 1 ? "..." : "")}
                  </p>
                  {msg.timestamp && <p className={`text-[10px] mt-1 ${msg.rol === "user" ? "text-white/70" : "text-ink-faint"}`}>{msg.timestamp}</p>}
                </div>
              </div>
            ))}
            {cargandoChat && (!mensajes.length || mensajes[mensajes.length - 1]?.rol !== "assistant" || !mensajes[mensajes.length - 1]?.contenido) && (
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-surface border border-line shadow-soft flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-brand" />
                </div>
                <div className="bg-surface border border-line rounded-2xl rounded-tl-sm px-4 py-3 shadow-soft">
                  <div className="flex gap-1 items-center h-4">
                    {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 bg-surface border-t border-line">
            <div className="flex items-center gap-2 bg-surface-2 border border-line rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-brand transition">
              <input type="text" className="flex-1 bg-transparent text-sm outline-none text-ink placeholder-ink-faint"
                placeholder="Pregunta sobre tus datos..." value={inputChat}
                onChange={e => setInputChat(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !cargandoChat && enviarMensaje()}
                disabled={cargandoChat} />
              <button onClick={enviarMensaje} disabled={!inputChat.trim() || cargandoChat}
                className="w-8 h-8 bg-brand hover:bg-brand-700 rounded-lg flex items-center justify-center transition disabled:opacity-40"
                aria-label="Enviar">
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Panel lateral: Alertas + Acceso rápido ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Accesos rápidos */}
          <div className="bg-surface rounded-brand border border-line shadow-soft p-4">
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-3">Accesos Rápidos</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/contactos", label: "Contactos", icon: <Users className="w-4 h-4" /> },
                { href: "/lideres",   label: "Líderes",   icon: <Star className="w-4 h-4" /> },
                { href: "/mensajes",  label: "Mensajes",  icon: <TrendingUp className="w-4 h-4" /> },
                { href: "/ia/documentos", label: "Base IA", icon: <Sparkles className="w-4 h-4" /> },
              ].map(a => (
                <Link key={a.href} href={a.href}
                  className="flex items-center gap-2 px-3 py-2.5 bg-surface-2 hover:bg-brand-50 hover:text-brand rounded-xl text-sm font-semibold text-ink-muted transition group">
                  <span className="text-ink-faint group-hover:text-brand transition">{a.icon}</span>
                  {a.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Progreso del censo electoral */}
          <div className="bg-surface rounded-brand border border-line shadow-soft p-4">
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-4">Avance Censo Electoral</h3>
            {cargandoDatos ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-8 bg-surface-2 rounded-lg animate-pulse" />)}
              </div>
            ) : (() => {
              const total = datos.total_contactos || 1;
              const hab   = datos.habilitados || 0;
              const noHab = datos.no_habilitados || 0;
              const pend  = datos.pendientes || 0;
              return (
                <div className="space-y-3">
                  {[
                    { label: "Habilitados",   val: hab,   total, color: "bg-pos" },
                    { label: "No Habilitados",val: noHab, total, color: "bg-neg" },
                    { label: "Pendientes",    val: pend,  total, color: "bg-ind" },
                  ].map(b => (
                    <div key={b.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-ink-muted">{b.label}</span>
                        <span className="font-bold text-ink tabular-nums">{b.val.toLocaleString()} <span className="font-normal text-ink-faint">({((b.val / b.total) * 100).toFixed(1)}%)</span></span>
                      </div>
                      <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
                        <div className={`h-full ${b.color} rounded-full transition-all duration-700`} style={{ width: `${(b.val / b.total) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          {/* Puestos con Baja Cobertura */}
          <div className="bg-surface rounded-brand border border-line shadow-soft p-4">
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-neg" /> Puestos Críticos
            </h3>
            <div className="space-y-3">
              {(datos as any).puestos_criticos?.map((p: any) => (
                <div key={p.nombre} className="flex justify-between items-center p-2 rounded-xl bg-surface-2 border-l-4 border-neg">
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-ink truncate">{p.nombre}</p>
                    <p className="text-[10px] text-neg font-medium">Urgente: Solo {p.contactos} contactos</p>
                  </div>
                  <Link href="/mesas" className="bg-surface p-1.5 rounded-lg shadow-soft hover:shadow-soft-lg transition" aria-label="Ver mesas">
                    <TrendingUp className="w-3.5 h-3.5 text-neg" />
                  </Link>
                </div>
              ))}
              {!(datos as any).puestos_criticos?.length && (
                 <p className="text-xs text-ink-faint italic">No hay datos de puestos aún.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
