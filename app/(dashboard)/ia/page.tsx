"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare, BarChart3, UserCheck, Sparkles, Send, Trash2, Bot, User } from "lucide-react";

interface LiderOption { id: number; nombre: string; }
interface Mensaje { rol: "user" | "assistant"; contenido: string; timestamp?: string; }

// Genera o recupera un ID de sesión persistente en el navegador
function getSesionId(): string {
  let id = localStorage.getItem("ia_sesion_id");
  if (!id) {
    id = `sesion_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem("ia_sesion_id", id);
  }
  return id;
}

export default function IAPage() {
  const [modo, setModo] = useState<"asesor" | "analista" | "evaluar">("analista");
  const [contexto, setContexto] = useState("");
  const [inputMensaje, setInputMensaje] = useState("");
  const [liderId, setLiderId] = useState("");
  const [lideres, setLideres] = useState<LiderOption[]>([]);
  const [cargando, setCargando] = useState(false);
  const [respuestaAsesor, setRespuestaAsesor] = useState("");

  // Estado del Chat con Memoria
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [sesionId, setSesionId] = useState<string>("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Inicializar sesión y cargar historial al montar
  useEffect(() => {
    const id = getSesionId();
    setSesionId(id);

    // Cargar historial previo de la sesión
    fetch(`/api/ia/analisis?sesionId=${id}`)
      .then(r => r.json())
      .then(json => {
        if (json.data && json.data.length > 0) {
          setMensajes(json.data.map((m: any) => ({
            rol: m.rol,
            contenido: m.contenido,
            timestamp: new Date(m.timestamp).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
          })));
        }
      })
      .catch(console.error);
  }, []);

  // Auto-scroll al último mensaje
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, cargando]);

  // Cargar líderes para el modo evaluar
  useEffect(() => {
    if (modo === "evaluar" && lideres.length === 0) {
      fetch("/api/lideres").then(r => r.json()).then(json => {
        if (json.data) setLideres(json.data.map((l: any) => ({ id: l.id, nombre: l.nombre || "Sin Nombre" })));
      }).catch(console.error);
    }
  }, [modo, lideres.length]);

  const enviarMensajeAnalista = async () => {
    if (!inputMensaje.trim() || cargando) return;

    const pregunta = inputMensaje.trim();
    setInputMensaje("");

    // Añadir mensaje del usuario al chat inmediatamente
    const nuevoMensajeUser: Mensaje = { rol: "user", contenido: pregunta, timestamp: new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) };
    
    // Crear un mensaje temporal para la IA que se irá actualizando en tiempo real
    const nuevoMensajeIA: Mensaje = { 
      rol: "assistant", 
      contenido: "", 
      timestamp: new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) 
    };

    setMensajes(prev => [...prev, nuevoMensajeUser, nuevoMensajeIA]);
    setCargando(true);

    try {
      const res = await fetch("/api/ia/analisis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "analista", preguntaAnalista: pregunta, sesionId, stream: true })
      });

      if (!res.ok) {
        throw new Error("Error en la respuesta del servidor");
      }

      // Si no es un stream o falla el body, leer como JSON (compatibilidad)
      if (!res.body) {
        const json = await res.json();
        const respuesta = json.error ? `Error: ${json.error}` : json.data;
        setMensajes(prev => {
          const actualizados = [...prev];
          if (actualizados.length > 0) {
            actualizados[actualizados.length - 1].contenido = respuesta;
          }
          return actualizados;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acumulado = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        acumulado += chunk;

        // Actualizar progresivamente el contenido del último mensaje
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
          actualizados[actualizados.length - 1].contenido = "Ocurrió un error al contactar el servidor de IA.";
        }
        return actualizados;
      });
    } finally {
      setCargando(false);
    }
  };

  const limpiarMemoria = () => {
    const nuevoId = `sesion_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem("ia_sesion_id", nuevoId);
    setSesionId(nuevoId);
    setMensajes([]);
  };

  const solicitarIASimple = async () => {
    setCargando(true);
    setRespuestaAsesor("");
    try {
      const bodyData = modo === "asesor"
        ? { tipo: "redactar_mensaje", contextoMensaje: contexto }
        : { tipo: "evaluar_lider", liderId };
      const res = await fetch("/api/ia/analisis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyData) });
      const json = await res.json();
      setRespuestaAsesor(json.error ? `Error: ${json.error}` : json.data);
    } catch {
      setRespuestaAsesor("Error al contactar el servidor de IA.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-purple-600" />
          Inteligencia Artificial Dual
        </h1>
        <p className="text-gray-500 mt-1">Análisis generativo con memoria de conversación.</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-2 p-4 border-b border-gray-100">
          {[
            { id: "analista", label: "Modo Analista (Datos)", icon: <BarChart3 className="w-4 h-4" />, color: "blue" },
            { id: "asesor", label: "Modo Asesor (Redacción)", icon: <MessageSquare className="w-4 h-4" />, color: "purple" },
            { id: "evaluar", label: "Evaluar Líder", icon: <UserCheck className="w-4 h-4" />, color: "emerald" },
          ].map(tab => (
            <button key={tab.id} onClick={() => setModo(tab.id as any)}
              className={`px-4 py-2 text-sm font-medium rounded-xl transition flex items-center gap-2 ${
                modo === tab.id ? `bg-${tab.color}-100 text-${tab.color}-700 shadow-sm` : "text-gray-500 hover:bg-gray-50"
              }`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* ── MODO ANALISTA: Chat con Memoria ──────────────────────── */}
        {modo === "analista" && (
          <div className="flex flex-col" style={{ height: "520px" }}>
            {/* Header del chat */}
            <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b border-blue-100">
              <div className="flex items-center gap-2 text-xs text-blue-600 font-medium">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Sesión activa con memoria persistente
              </div>
              <button onClick={limpiarMemoria} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition">
                <Trash2 className="w-3 h-3" /> Nueva sesión
              </button>
            </div>

            {/* Área de mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {mensajes.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 space-y-3">
                  <Bot className="w-12 h-12 text-blue-200" />
                  <p className="text-sm font-medium">¡Hola! Soy tu Analista de Datos.</p>
                  <p className="text-xs max-w-xs">Pregúntame cualquier cosa sobre tus contactos, puestos de votación, líderes o intención de voto.</p>
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {["¿Cuántos habilitados tenemos?", "¿Cuál es el barrio con más registros?", "¿Cómo va la intención de voto?"].map(sug => (
                      <button key={sug} onClick={() => setInputMensaje(sug)}
                        className="text-xs bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-full hover:bg-blue-50 transition">
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mensajes.map((msg, i) => (
                <div key={i} className={`flex items-start gap-3 ${msg.rol === "user" ? "flex-row-reverse" : ""}`}>
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.rol === "user" ? "bg-blue-600" : "bg-white border border-gray-200 shadow-sm"
                  }`}>
                    {msg.rol === "user" ? <User className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4 text-blue-500" />}
                  </div>
                  {/* Burbuja */}
                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
                    msg.rol === "user"
                      ? "bg-blue-600 text-white rounded-tr-sm"
                      : "bg-white text-gray-800 rounded-tl-sm border border-gray-100"
                  }`}>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {msg.contenido || (cargando && i === mensajes.length - 1 ? "..." : "")}
                    </p>
                    {msg.timestamp && (
                      <p className={`text-[10px] mt-1 ${msg.rol === "user" ? "text-blue-200" : "text-gray-400"}`}>{msg.timestamp}</p>
                    )}
                  </div>
                </div>
              ))}

              {/* Indicador de escritura */}
              {cargando && (!mensajes.length || mensajes[mensajes.length - 1]?.rol !== "assistant" || !mensajes[mensajes.length - 1]?.contenido) && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                    <div className="flex gap-1 items-center h-5">
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input del chat */}
            <div className="p-3 bg-white border-t border-gray-100">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition">
                <input
                  type="text"
                  className="flex-1 bg-transparent text-sm outline-none text-gray-800 placeholder-gray-400"
                  placeholder="Pregunta sobre tus datos... (Enter para enviar)"
                  value={inputMensaje}
                  onChange={e => setInputMensaje(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !cargando && enviarMensajeAnalista()}
                  disabled={cargando}
                />
                <button
                  onClick={enviarMensajeAnalista}
                  disabled={!inputMensaje.trim() || cargando}
                  className="w-8 h-8 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODO ASESOR ──────────────────────────────────────────── */}
        {modo === "asesor" && (
          <div className="p-6 space-y-4">
            <label className="block text-sm font-medium text-gray-700">Contexto o motivo del mensaje</label>
            <textarea
              className="w-full border border-gray-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition"
              rows={4}
              placeholder="Ej: Invitar a los simpatizantes a la reunión de cierre de campaña..."
              value={contexto}
              onChange={e => setContexto(e.target.value)}
            />
            <button onClick={solicitarIASimple} disabled={!contexto || cargando}
              className="px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition">
              {cargando ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Pensando...</> : <><Sparkles className="w-4 h-4" />Generar Mensaje</>}
            </button>
            {respuestaAsesor && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-50">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Respuesta</h3>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{respuestaAsesor}</p>
              </div>
            )}
          </div>
        )}

        {/* ── MODO EVALUAR ─────────────────────────────────────────── */}
        {modo === "evaluar" && (
          <div className="p-6 space-y-4">
            <label className="block text-sm font-medium text-gray-700">Selecciona al líder a evaluar</label>
            <select className="w-full border border-gray-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
              value={liderId} onChange={e => setLiderId(e.target.value)}>
              <option value="">Seleccione un líder...</option>
              {lideres.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
            <button onClick={solicitarIASimple} disabled={!liderId || cargando}
              className="px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition">
              {cargando ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Analizando...</> : <><Sparkles className="w-4 h-4" />Evaluar Líder</>}
            </button>
            {respuestaAsesor && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-50">
                  <Sparkles className="w-5 h-5 text-emerald-500" />
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Análisis del Líder</h3>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{respuestaAsesor}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
