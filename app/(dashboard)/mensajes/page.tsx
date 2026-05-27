"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Send, Users, CheckCircle2, Image as ImageIcon, ListPlus, Smartphone, BarChart3, ChevronRight, ChevronLeft, Search, RefreshCw, XCircle, Clock, UploadCloud, Flame, Zap } from "lucide-react";
import { supabaseClient } from "@/lib/supabaseClient";
import { convertBlocksToWhatsApp } from "@/lib/message-builder/converters";
import MessageBuilder from "./components/MessageBuilder";

export default function MensajesPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [activeCampanaId, setActiveCampanaId] = useState<number | null>(null);

  // Paso 1: Redacción
  const [nombreCampana, setNombreCampana] = useState("");
  const [textoMensaje, setTextoMensaje] = useState("");
  const [variacionesIA, setVariacionesIA] = useState<string[]>([]);
  const [generandoVariaciones, setGenerandoVariaciones] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const [pollOptionsStr, setPollOptionsStr] = useState("");
  
  const [initialBloques, setInitialBloques] = useState<any[]>([]);

  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState("");

  const [lineasWhatsapp, setLineasWhatsapp] = useState<any[]>([]);
  const [lineaSeleccionada, setLineaSeleccionada] = useState<string>("");
  const [delayMin, setDelayMin] = useState<number>(5);
  const [delayMax, setDelayMax] = useState<number>(15);

  const [manuales, setManuales] = useState<any[]>([]);
  const [nuevoManualNombre, setNuevoManualNombre] = useState("");
  const [nuevoManualTelefono, setNuevoManualTelefono] = useState("");
  const [soloManuales, setSoloManuales] = useState(false);
  const [modoCalentamiento, setModoCalentamiento] = useState(true);

  // Fetch inicial de plantillas y líneas
  useEffect(() => {
    fetch("/api/message-builder/plantillas")
      .then(res => res.json())
      .then(json => setPlantillas(json.data || []));

    fetch("/api/lineas")
      .then(res => res.json())
      .then(json => setLineasWhatsapp(json.data || []));
  }, []);

  const handleSelectPlantilla = (templateId: string) => {
    setPlantillaSeleccionada(templateId);
    if (!templateId) {
      setInitialBloques([]);
      setNombreCampana("");
      return;
    }

    const template = plantillas.find(p => p.id === Number(templateId));
    if (template && template.bloques) {
      setInitialBloques(template.bloques);
      setNombreCampana(template.nombre);
    }
  };

  const handleBuilderContinue = (bloques: any[]) => {
    let newText = convertBlocksToWhatsApp(bloques);
    let newMedia = "";
    let newPollOpts = "";
    
    bloques.forEach((b: any) => {
      if(b.tipo === "imagen" && b.config.url) newMedia = b.config.url;
      if(b.tipo === "encuesta" && b.config.opciones) {
         newPollOpts = b.config.opciones.map((o: any) => o.texto).join(", ");
      }
    });

    setTextoMensaje(newText);
    setMediaUrl(newMedia);
    setPollOptionsStr(newPollOpts);
    
    setStep(2);
  };

  // Paso 2: Audiencia
  const [barrios, setBarrios] = useState<string[]>([]);
  const [barrioSeleccionado, setBarrioSeleccionado] = useState<string>("Todos");
  const [intencionVoto, setIntencionVoto] = useState<string>("todos");
  const [audienciaList, setAudienciaList] = useState<any[]>([]);
  const [cargandoAudiencia, setCargandoAudiencia] = useState(false);
  
  // Paso 3: Monitoreo
  const [liveStats, setLiveStats] = useState({ total: 0, enviados: 0, en_cola: 0, pendientes: 0, fallidos: 0 });
  const [liveMensajes, setLiveMensajes] = useState<any[]>([]);
  const [continuando, setContinuando] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "enviados" | "en_cola" | "fallidos">("todos");
  const [confirmContactados, setConfirmContactados] = useState<{
    total: number; ya_contactados: number; sin_contactar: number;
  } | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [campanaEstado, setCampanaEstado] = useState<string>("enviando");
  const [procesandoEstado, setProcesandoEstado] = useState(false);

  const cambiarEstadoCampana = async (accion: string) => {
    if (!activeCampanaId) return;
    setProcesandoEstado(true);
    try {
      const res = await fetch(`/api/campanas/${activeCampanaId}/estado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, razon: "Cancelado manualmente" })
      });
      const json = await res.json();
      if (res.ok) {
        if (accion === "pausar") setCampanaEstado("pausada");
        if (accion === "reanudar") setCampanaEstado("enviando");
        if (accion === "cancelar") setCampanaEstado("cancelada");
      } else {
        alert("Error: " + json.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setProcesandoEstado(false);
    }
  };

  // Inicialización
  useEffect(() => {
    fetch("/api/barrios").then(res => res.json()).then(json => setBarrios(json.data || []));
  }, []);

  // Fetch Audiencia cuando cambian los filtros
  useEffect(() => {
    let active = true;

    if (soloManuales) {
      setAudienciaList([]);
      return;
    }

    setCargandoAudiencia(true);
    let url = `/api/contactos?limit=5000`; // Limite alto para campaña
    if (barrioSeleccionado !== "Todos") url += `&barrio=${encodeURIComponent(barrioSeleccionado)}`;
    if (intencionVoto !== "todos") url += `&intencion_voto=${encodeURIComponent(intencionVoto)}`;
      
    fetch(url)
      .then(res => res.json())
      .then(json => {
        if (active) setAudienciaList(json.data || []);
      })
      .finally(() => {
        if (active) setCargandoAudiencia(false);
      });

    return () => { active = false; };
  }, [step, barrioSeleccionado, intencionVoto, soloManuales]);

  const audienciaEfectiva = soloManuales ? [] : audienciaList;

  // Polling para Monitoreo en Paso 3
  useEffect(() => {
    let interval: any;
    if (step === 3 && activeCampanaId) {
      const fetchLive = async () => {
        const res = await fetch(`/api/campanas/${activeCampanaId}/mensajes?limit=200`);
        const json = await res.json();
        if (json.stats) setLiveStats(json.stats);
        if (json.data) setLiveMensajes(json.data);
      };
      fetchLive();
      interval = setInterval(fetchLive, 3000); // Polling cada 3 seg
    }
    return () => clearInterval(interval);
  }, [step, activeCampanaId]);

  const insertarVariable = (variable: string) => {
    setTextoMensaje(prev => prev + variable);
  };

  const pollOptionsArray = useMemo(() => {
    return pollOptionsStr.split(',').map(s => s.trim()).filter(s => s);
  }, [pollOptionsStr]);

  const agregarManual = () => {
    if (!nuevoManualTelefono) return;
    const nuevo = {
      nombre: nuevoManualNombre || "Amigo",
      telefono: nuevoManualTelefono,
      cedula: `manual-${Date.now()}`,
      barrio: "Manual"
    };
    setManuales([...manuales, nuevo]);
    setNuevoManualNombre("");
    setNuevoManualTelefono("");
  };

  const removerManual = (cedula: string) => {
    setManuales(manuales.filter(m => m.cedula !== cedula));
  };

  const generarVariaciones = async () => {
    if (!textoMensaje) return;
    setGenerandoVariaciones(true);
    try {
      const res = await fetch("/api/mensajes/generar-variaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: textoMensaje })
      });
      const json = await res.json();
      if (json.success && json.variaciones) {
        setVariacionesIA(json.variaciones);
      } else {
        alert("Error al generar variaciones: " + (json.error || "Desconocido"));
      }
    } catch (e: any) {
      alert("Error de red: " + e.message);
    } finally {
      setGenerandoVariaciones(false);
    }
  };

  /** Lanza el envío real (se llama después de que el coordinador confirma) */
  const ejecutarEnvio = async (excluirYaContactados: boolean) => {
    setEnviando(true);
    setConfirmContactados(null);
    try {
      const cedulas = audienciaEfectiva.map(c => c.cedula);
      const res = await fetch("/api/mensajes/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedulas,
          texto: textoMensaje,
          nombre_campana: nombreCampana || `Campaña ${new Date().toLocaleDateString()}`,
          mediaUrl: mediaUrl || undefined,
          pollOptions: pollOptionsArray.length > 0 ? pollOptionsArray : undefined,
          lineaId: lineaSeleccionada ? parseInt(lineaSeleccionada) : undefined,
          manuales: manuales.map(m => ({ nombre: m.nombre, telefono: m.telefono })),
          variaciones: variacionesIA.length > 0 ? variacionesIA : undefined,
          excluirYaContactados,
          modoCalentamiento,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        let errMsg = json.error || "Error al enviar";
        if (json.details) errMsg += ": " + JSON.stringify(json.details);
        throw new Error(errMsg);
      }
      setActiveCampanaId(json.campanaId);
      setCampanaEstado("enviando");
      setLiveStats({ total: 0, enviados: 0, en_cola: json.encolados ?? 0, pendientes: json.pendientes ?? 0, fallidos: 0 });
      setStep(3);
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setEnviando(false);
    }
  };

  /** Primer click en "Lanzar Campaña": verifica contactados y pide confirmación si aplica */
  const enviarCampana = async () => {
    if (!textoMensaje || (audienciaEfectiva.length + manuales.length) === 0) return;

    // Paso 0: verificar cuántos ya fueron contactados antes
    try {
      const cedulas = audienciaEfectiva.map(c => c.cedula);
      const res = await fetch("/api/mensajes/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedulas,
          manuales: manuales.map(m => ({ telefono: m.telefono })),
        }),
      });
      const verif = await res.json();
      if (res.ok && verif.ya_contactados > 0) {
        // Mostrar banner de confirmación y esperar elección del coordinador
        setConfirmContactados(verif);
        return;
      }
    } catch (_) {
      // Si falla la verificación, seguimos normalmente (no bloquea el flujo)
    }

    // Sin duplicados → lanzar directo
    await ejecutarEnvio(false);
  };

  return (
    <div className="max-w-7xl xl:max-w-[1440px] mx-auto space-y-6 p-4 md:p-8">
      {/* HEADER WIZARD */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-2 mb-6">
          <Send className="w-8 h-8 text-purple-600" /> Creador de Campañas
        </h1>
        
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-200 rounded-full z-0"></div>
          <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-purple-600 rounded-full z-0 transition-all duration-500`} style={{ width: step === 1 ? '10%' : step === 2 ? '50%' : '100%' }}></div>
          
          {[
            { id: 1, label: 'Diseño', icon: ImageIcon },
            { id: 2, label: 'Audiencia', icon: Users },
            { id: 3, label: 'Monitoreo en Vivo', icon: BarChart3 }
          ].map((s) => (
            <div key={s.id} className="relative z-10 flex flex-col items-center gap-2">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold shadow-sm transition-colors ${step >= s.id ? 'bg-purple-600 text-white border-4 border-purple-100' : 'bg-white text-gray-400 border-4 border-gray-100'}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <span className={`text-sm font-semibold ${step >= s.id ? 'text-purple-700' : 'text-gray-400'}`}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm min-h-[600px] overflow-hidden">
        
        {/* PASO 1: REDACCIÓN - CONSTRUCTOR VISUAL */}
        {step === 1 && (
          <div className="bg-slate-50 min-h-full flex flex-col p-4">
            <div className="mb-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cargar Plantilla Guardada</label>
                <select 
                  value={plantillaSeleccionada}
                  onChange={(e) => handleSelectPlantilla(e.target.value)}
                  className="w-full min-w-[300px] border border-slate-200 p-2 rounded-lg text-sm outline-none focus:border-indigo-500 bg-slate-50"
                >
                  <option value="">-- Diseñar desde cero --</option>
                  {plantillas.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} {p.esPublica ? "(Pública)" : ""}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1">
              <MessageBuilder 
                initialBloques={initialBloques} 
                onContinue={handleBuilderContinue}
                nombreCampana={nombreCampana}
                setNombreCampana={setNombreCampana}
              />
            </div>
          </div>
        )}

        {/* PASO 2: AUDIENCIA */}
        {step === 2 && (
          <div className="p-8 h-full flex flex-col">
            <div className="flex-1 pb-16 overflow-y-auto">
              <div className="max-w-4xl mx-auto space-y-6">
                
                {/* Cabecera de Paso 2 */}
                <div className="flex items-center gap-3 text-purple-700 mb-2">
                  <button onClick={() => setStep(1)} className="hover:bg-purple-50 p-2 rounded-full transition-colors text-sm font-bold flex items-center gap-1">
                    <ChevronLeft className="w-4 h-4" /> Volver al Diseño
                  </button>
                </div>
                
                <h2 className="text-2xl font-extrabold text-gray-900">Segmentación y Audiencia</h2>
                <p className="text-gray-500 mb-6">Filtra tu base de datos y previsualiza exactamente a quién le llegará el mensaje.</p>

                {/* Mensaje original y botón IA */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                  <div className="bg-indigo-50/50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-indigo-900 text-sm flex items-center gap-2">
                      ✨ Mensaje y Variaciones Anti-Spam
                    </h3>
                    <button 
                      onClick={generarVariaciones} 
                      disabled={generandoVariaciones || !textoMensaje}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      {generandoVariaciones ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generando...
                        </>
                      ) : (
                        <>
                          Generar Variaciones con IA
                        </>
                      )}
                    </button>
                  </div>
                  
                  <div className="p-6 space-y-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Texto Base (Diseñado)</span>
                      <div className="bg-slate-50 border p-3 rounded-lg text-sm text-slate-700 whitespace-pre-wrap font-sans">
                        {textoMensaje}
                      </div>
                    </div>

                    {variacionesIA.length > 0 && (
                      <div className="space-y-3 pt-3 border-t">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
                          Variaciones Alternativas Generadas (Rotación Activa ✔️)
                        </span>
                        <div className="grid grid-cols-1 gap-3">
                          {variacionesIA.map((v, i) => (
                            <div key={i} className="bg-emerald-50/30 border border-emerald-100 p-3 rounded-lg text-xs text-slate-600 relative">
                              <span className="absolute top-2 right-2 bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[9px]">
                                Var {i + 1}
                              </span>
                              <textarea
                                value={v}
                                onChange={(e) => {
                                  const nuevas = [...variacionesIA];
                                  nuevas[i] = e.target.value;
                                  setVariacionesIA(nuevas);
                                }}
                                className="w-full bg-transparent border-0 p-0 text-xs focus:ring-0 resize-none font-sans outline-none"
                                rows={3}
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-400">
                          El sistema rotará automáticamente entre el mensaje base y estas 3 variaciones para que WhatsApp no detecte envíos repetitivos. Puedes editarlas directamente aquí.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4 bg-gray-50 p-6 rounded-xl border">
              <div className={`${soloManuales ? 'opacity-40 pointer-events-none' : ''} transition-opacity`}>
                <label className="block text-sm font-bold text-gray-700 mb-2">Barrio</label>
                <select className="w-full border p-3 rounded-lg text-sm bg-white" value={barrioSeleccionado} onChange={(e) => setBarrioSeleccionado(e.target.value)}>
                  <option value="Todos">Toda la ciudad</option>
                  {barrios.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className={`${soloManuales ? 'opacity-40 pointer-events-none' : ''} transition-opacity`}>
                <label className="block text-sm font-bold text-gray-700 mb-2">Intención de Voto</label>
                <select className="w-full border p-3 rounded-lg text-sm bg-white" value={intencionVoto} onChange={(e) => setIntencionVoto(e.target.value)}>
                  <option value="todos">Todos los registrados</option>
                  <option value="positivo">Positivo (Simpatizantes)</option>
                  <option value="indeciso">Indecisos</option>
                  <option value="negativo">Negativo</option>
                </select>
              </div>
            </div>

            <div className="mb-8">
              <label className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-200 rounded-xl cursor-pointer hover:bg-purple-100 transition-colors">
                <input type="checkbox" checked={soloManuales} onChange={e => setSoloManuales(e.target.checked)} className="w-5 h-5 text-purple-600 rounded border-purple-300 focus:ring-purple-500" />
                <span className="font-bold text-purple-900 text-sm">Ignorar los filtros de la base de datos (Enviar ÚNICAMENTE a contactos manuales)</span>
              </label>
            </div>

                <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm transition-opacity ${soloManuales ? 'opacity-50' : ''}`}>
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                      <Search className="w-5 h-5 text-gray-400"/> Contactos Seleccionados
                    </h3>
                    <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold">
                      {audienciaEfectiva.length + manuales.length} destinatarios
                    </span>
                  </div>
                  
                  <div className="p-6">
                    {cargandoAudiencia ? (
                      <div className="flex justify-center items-center py-12">
                        <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
                      </div>
                    ) : (audienciaEfectiva.length + manuales.length) === 0 ? (
                      <p className="text-center text-gray-500 py-12">Ningún contacto coincide con los filtros ni manuales agregados.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[...manuales, ...audienciaEfectiva].slice(0, 50).map((c, i) => (
                          <div key={c.cedula || i} className={`border p-4 rounded-xl flex items-center justify-between transition-colors ${c.barrio === 'Manual' ? 'border-orange-200 bg-orange-50' : 'border-slate-100 hover:border-purple-200 hover:bg-purple-50/30'}`}>
                            <div>
                              <p className="font-bold text-gray-800 text-sm">{c.nombre}</p>
                              <p className="text-xs text-gray-400 uppercase tracking-wider">{c.barrio}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono text-gray-500 bg-white px-2 py-1 rounded shadow-sm">{c.telefono || 'Sin Tel'}</span>
                              {c.barrio === 'Manual' && (
                                <button onClick={() => removerManual(c.cedula)} className="text-red-400 hover:text-red-600 font-bold p-1">&times;</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Nuevo: Agregar Contactos Manuales */}
                <div className="bg-white rounded-xl border border-orange-200 overflow-hidden shadow-sm mt-8">
                  <div className="bg-orange-50 px-6 py-4 border-b border-orange-200">
                    <h3 className="font-bold text-orange-800 flex items-center gap-2">
                      <Users className="w-5 h-5 text-orange-500"/> Agregar Contactos Manuales (Extra)
                    </h3>
                  </div>
                  <div className="p-6 flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Nombre (Opcional)</label>
                      <input type="text" value={nuevoManualNombre} onChange={e => setNuevoManualNombre(e.target.value)} placeholder="Ej: Juan Pérez" className="w-full border border-slate-200 p-3 rounded-lg text-sm outline-none focus:border-orange-500" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Celular (Requerido)</label>
                      <input type="text" value={nuevoManualTelefono} onChange={e => setNuevoManualTelefono(e.target.value)} placeholder="Ej: 3201234567" className="w-full border border-slate-200 p-3 rounded-lg text-sm outline-none focus:border-orange-500" />
                    </div>
                    <button onClick={agregarManual} disabled={!nuevoManualTelefono} className="bg-orange-500 text-white px-6 py-3 rounded-lg font-bold hover:bg-orange-600 transition-colors disabled:opacity-50">
                      + Agregar
                    </button>
                  </div>
                </div>

                {/* Nuevo: Configuración de Envío */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm mt-8">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                      <Smartphone className="w-5 h-5 text-gray-400"/> Configuración de Envío
                    </h3>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Línea de WhatsApp a usar</label>
                      <select 
                        value={lineaSeleccionada}
                        onChange={(e) => setLineaSeleccionada(e.target.value)}
                        className="w-full border border-slate-200 p-3 rounded-lg text-sm outline-none focus:border-purple-500 bg-white"
                      >
                        <option value="">-- Distribuir Automáticamente (Recomendado) --</option>
                        {lineasWhatsapp.map(l => (
                          <option key={l.id} value={l.id}>
                            {l.nombre} ({l.numero_telefono || 'Sin número'}) - {l.estado} [Cupo: {l.mensajes_enviados_hoy || 0}/{l.limite_diario || 45}]
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-400 mt-2">Si dejas esta opción en blanco, el sistema repartirá la carga entre todas tus líneas conectadas equitativamente.</p>
                    </div>

                    {/* Toggle: Modo Calentamiento vs Normal */}
                    <div className="col-span-full">
                      <p className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                        ⏱ Velocidad de Envío
                      </p>
                      <div className="grid grid-cols-2 gap-3">

                        {/* Modo Calentamiento */}
                        <button
                          type="button"
                          onClick={() => setModoCalentamiento(true)}
                          className={`relative flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all ${
                            modoCalentamiento
                              ? "border-orange-400 bg-orange-50 shadow-sm"
                              : "border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/40"
                          }`}
                        >
                          {modoCalentamiento && (
                            <span className="absolute top-2 right-2 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">ACTIVO</span>
                          )}
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${modoCalentamiento ? "bg-orange-200 text-orange-700" : "bg-slate-100 text-slate-500"}`}>
                              <Flame size={16} />
                            </div>
                            <span className={`font-bold text-sm ${modoCalentamiento ? "text-orange-800" : "text-slate-700"}`}>
                              Modo Calentamiento
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            <strong>1 mensaje cada ~13 min</strong> por línea.<br />
                            45 mensajes distribuidos en <strong>~10 horas</strong>.<br />
                            <span className="text-orange-700 font-medium">✓ Recomendado para primer contacto.</span>
                          </p>
                          <div className="mt-1 text-[10px] text-slate-400">
                            Con 3 líneas: ~135 msg en 10h · Con 10 líneas: ~450 msg en 10h
                          </div>
                        </button>

                        {/* Modo Normal */}
                        <button
                          type="button"
                          onClick={() => setModoCalentamiento(false)}
                          className={`relative flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all ${
                            !modoCalentamiento
                              ? "border-blue-400 bg-blue-50 shadow-sm"
                              : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"
                          }`}
                        >
                          {!modoCalentamiento && (
                            <span className="absolute top-2 right-2 bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">ACTIVO</span>
                          )}
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${!modoCalentamiento ? "bg-blue-200 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                              <Zap size={16} />
                            </div>
                            <span className={`font-bold text-sm ${!modoCalentamiento ? "text-blue-800" : "text-slate-700"}`}>
                              Modo Normal
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            <strong>1 mensaje cada ~3 min</strong> por línea.<br />
                            45 mensajes en <strong>~2.5 horas</strong>.<br />
                            <span className="text-blue-700 font-medium">✓ Para cuentas ya calentadas.</span>
                          </p>
                          <div className="mt-1 text-[10px] text-slate-400">
                            Con 3 líneas: ~135 msg en 2.5h · Con 10 líneas: ~450 msg en 2.5h
                          </div>
                        </button>

                      </div>
                    </div>

                    {/* Panel de estado detallado de líneas */}
                    <div className="col-span-full mt-4 pt-4 border-t border-slate-100">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                        Estado de Rotación de Líneas y Límites Anti-Ban
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {lineasWhatsapp.map(l => {
                          const porcentajeCupo = Math.min(100, ((l.mensajes_enviados_hoy || 0) / (l.limite_diario || 45)) * 100);
                          const cupoAgotado = (l.mensajes_enviados_hoy || 0) >= (l.limite_diario || 45);
                          return (
                            <div key={l.id} className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                    <span className={`w-2.5 h-2.5 rounded-full ${l.estado === 'conectado' ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
                                    {l.nombre}
                                  </p>
                                  <p className="text-[11px] text-slate-500 mt-0.5">{l.numero_telefono || 'Sin número'}</p>
                                </div>
                                {l.proxyUrl ? (
                                  <span className="bg-emerald-50 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full border border-emerald-100 font-medium">
                                    Proxy Activo
                                  </span>
                                ) : (
                                  <span className="bg-amber-50 text-amber-600 text-[10px] px-2 py-0.5 rounded-full border border-amber-100 font-medium">
                                    Sin Proxy (Local)
                                  </span>
                                )}
                              </div>

                              <div className="mt-3">
                                <div className="flex justify-between text-[11px] font-medium text-slate-600 mb-1">
                                  <span>Cupo Diario</span>
                                  <span className={cupoAgotado ? "text-red-600 font-bold" : ""}>
                                    {l.mensajes_enviados_hoy || 0} / {l.limite_diario || 45}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-500 ${cupoAgotado ? 'bg-red-500' : 'bg-green-500'}`}
                                    style={{ width: `${porcentajeCupo}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {lineasWhatsapp.length === 0 && (
                          <div className="col-span-full text-center py-6 text-xs text-slate-400">
                            No hay líneas de WhatsApp configuradas en el sistema.
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            </div>

            {/* Banner de confirmación: contactos ya enviados */}
            {confirmContactados && (
              <div className="mt-6 border border-amber-400 bg-amber-50 rounded-2xl p-6 shadow-md">
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="font-extrabold text-amber-900 text-base">
                      {confirmContactados.ya_contactados} persona{confirmContactados.ya_contactados !== 1 ? "s" : ""} ya recibieron un mensaje en una campaña anterior
                    </p>
                    <p className="text-amber-700 text-sm mt-1">
                      De {confirmContactados.total} seleccionados · {confirmContactados.sin_contactar} nunca han sido contactados
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => ejecutarEnvio(false)}
                    disabled={enviando}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4"/>
                    Enviar a todos ({confirmContactados.total})
                    <span className="text-xs opacity-75 font-normal">— incluir ya contactados</span>
                  </button>
                  <button
                    onClick={() => ejecutarEnvio(true)}
                    disabled={enviando || confirmContactados.sin_contactar === 0}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4"/>
                    Solo nuevos ({confirmContactados.sin_contactar})
                    <span className="text-xs opacity-75 font-normal">— saltar ya contactados</span>
                  </button>
                  <button
                    onClick={() => setConfirmContactados(null)}
                    className="sm:w-auto px-4 py-3 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-100 font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
                {enviando && (
                  <div className="flex items-center gap-2 mt-4 text-amber-700 text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin"/> Iniciando motor de envío...
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 flex justify-end border-t pt-6">
              <button
                onClick={enviarCampana}
                disabled={enviando || (audienciaEfectiva.length + manuales.length) === 0 || !!confirmContactados}
                className="bg-green-600 text-white px-8 py-4 rounded-xl font-bold flex items-center gap-3 hover:bg-green-700 transition-transform hover:scale-105 disabled:opacity-50 shadow-lg text-lg"
              >
                {enviando ? <RefreshCw className="w-6 h-6 animate-spin"/> : <Send className="w-6 h-6"/>}
                {enviando ? 'Iniciando Motor...' : `¡Lanzar Campaña a ${audienciaEfectiva.length + manuales.length}!`}
              </button>
            </div>
          </div>
        )}

        {/* PASO 3: MONITOREO */}
        {step === 3 && (
          <div className="p-8 h-full bg-gray-900 text-white">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black text-green-400 flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full ${campanaEstado === 'enviando' ? 'bg-green-400 animate-pulse' : campanaEstado === 'pausada' ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
                  Transmisión {campanaEstado === 'enviando' ? 'en Vivo' : campanaEstado === 'pausada' ? 'Pausada' : 'Cancelada'}
                </h2>
                <p className="text-gray-400 text-sm mt-1">Monitoreando la distribución de {liveStats.total} mensajes.</p>
              </div>
              <div className="flex gap-3">
                {campanaEstado === 'enviando' && (
                  <button onClick={() => cambiarEstadoCampana('pausar')} disabled={procesandoEstado} className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 hover:bg-yellow-500/30 px-4 py-2 rounded-lg font-bold text-sm transition-colors">
                    Pausar
                  </button>
                )}
                {campanaEstado === 'pausada' && (
                  <button onClick={() => cambiarEstadoCampana('reanudar')} disabled={procesandoEstado} className="bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30 px-4 py-2 rounded-lg font-bold text-sm transition-colors">
                    Reanudar
                  </button>
                )}
                {(campanaEstado === 'enviando' || campanaEstado === 'pausada') && (
                  <button onClick={() => cambiarEstadoCampana('cancelar')} disabled={procesandoEstado} className="bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 px-4 py-2 rounded-lg font-bold text-sm transition-colors">
                    Cancelar
                  </button>
                )}
                <button onClick={() => { setStep(1); setTextoMensaje(""); setActiveCampanaId(null); setLiveMensajes([]); setVariacionesIA([]); setCampanaEstado("enviando"); }} className="text-gray-400 hover:text-white bg-gray-800 px-4 py-2 rounded-lg font-bold text-sm">
                  Nueva Campaña
                </button>
              </div>
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700">
                <p className="text-gray-400 text-xs font-bold mb-1 uppercase tracking-wider">Total</p>
                <p className="text-3xl font-black">{liveStats.total}</p>
              </div>
              <div className="bg-gray-800 border border-green-900 p-5 rounded-2xl">
                <p className="text-green-500 text-xs font-bold mb-1 uppercase tracking-wider">Enviados ✓</p>
                <p className="text-3xl font-black text-green-400">{liveStats.enviados}</p>
              </div>
              <div className="bg-gray-800 border border-blue-900 p-5 rounded-2xl">
                <p className="text-blue-400 text-xs font-bold mb-1 uppercase tracking-wider">En Cola (hoy)</p>
                <p className="text-3xl font-black text-blue-400">{liveStats.en_cola}</p>
              </div>
              <div className="bg-gray-800 border border-yellow-900 p-5 rounded-2xl">
                <p className="text-yellow-500 text-xs font-bold mb-1 uppercase tracking-wider">Próximos días</p>
                <p className="text-3xl font-black text-yellow-400">{liveStats.pendientes}</p>
              </div>
              <div className="bg-gray-800 border border-red-900 p-5 rounded-2xl">
                <p className="text-red-500 text-xs font-bold mb-1 uppercase tracking-wider">Fallidos</p>
                <p className="text-3xl font-black text-red-400">{liveStats.fallidos}</p>
              </div>
            </div>

            {/* Botón Continuar campaña (días siguientes) */}
            {liveStats.pendientes > 0 && (
              <div className="mb-6 p-4 rounded-xl border border-yellow-700/50 bg-yellow-900/20 flex items-center justify-between gap-4">
                <div>
                  <p className="text-yellow-300 font-bold text-sm">
                    {liveStats.pendientes} mensajes esperan días siguientes
                  </p>
                  <p className="text-yellow-500/70 text-xs mt-0.5">
                    Mañana, cuando se reseteen los límites, presiona "Continuar" para encolar el siguiente lote.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (!activeCampanaId) return;
                    setContinuando(true);
                    try {
                      const res = await fetch(`/api/campanas/${activeCampanaId}/continuar`, { method: "POST" });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.error || "Error al continuar");
                      alert(json.message);
                    } catch (e: any) {
                      alert("Error: " + e.message);
                    } finally {
                      setContinuando(false);
                    }
                  }}
                  disabled={continuando}
                  className="shrink-0 bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-5 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {continuando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {continuando ? "Encolando..." : "Continuar campaña"}
                </button>
              </div>
            )}

            {/* Barra de Progreso */}
            <div className="bg-gray-800 rounded-full h-4 mb-8 overflow-hidden flex">
              {liveStats.total > 0 && (
                <>
                  <div style={{width: `${(liveStats.enviados/liveStats.total)*100}%`}} className="bg-green-500 h-full transition-all duration-500"></div>
                  <div style={{width: `${(liveStats.fallidos/liveStats.total)*100}%`}} className="bg-red-500 h-full transition-all duration-500"></div>
                </>
              )}
            </div>

            {/* Pestañas de filtro */}
            {(() => {
              const tabs = [
                { key: "todos",    label: "Todos",      count: liveStats.total,     color: "gray"  },
                { key: "fallidos", label: "✗ Fallidos", count: liveStats.fallidos,  color: "red"   },
                { key: "en_cola",  label: "⏳ En Cola",  count: liveStats.en_cola,   color: "blue"  },
                { key: "enviados", label: "✓ Enviados", count: liveStats.enviados,  color: "green" },
              ] as const;

              const mensajesFiltrados = liveMensajes.filter(m => {
                if (filtroEstado === "enviados") return ["enviado","entregado","leido"].includes(m.estado);
                if (filtroEstado === "en_cola")  return m.estado === "en_cola";
                if (filtroEstado === "fallidos") return m.estado === "fallido" || m.estado === "error";
                return true;
              });

              const colorTab: Record<string, string> = {
                gray:  "bg-gray-700 text-white",
                red:   "bg-red-600/80 text-white",
                blue:  "bg-blue-600/80 text-white",
                green: "bg-green-600/80 text-white",
              };
              const colorTabInactive: Record<string, string> = {
                gray:  "text-gray-400 hover:bg-gray-700",
                red:   "text-red-400   hover:bg-red-900/30",
                blue:  "text-blue-400  hover:bg-blue-900/30",
                green: "text-green-400 hover:bg-green-900/30",
              };

              return (
                <>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {tabs.map(t => (
                      <button
                        key={t.key}
                        onClick={() => setFiltroEstado(t.key)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors border ${
                          filtroEstado === t.key
                            ? `${colorTab[t.color]} border-transparent`
                            : `bg-gray-800 border-gray-700 ${colorTabInactive[t.color]}`
                        }`}
                      >
                        {t.label} <span className="ml-1 opacity-80">({t.count})</span>
                      </button>
                    ))}
                  </div>

                  {/* Tabla en vivo */}
                  <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden flex flex-col max-h-[420px]">
                    <div className="grid grid-cols-4 px-6 py-3 bg-gray-900/50 text-xs font-bold text-gray-400 uppercase tracking-wider">
                      <div>Destinatario</div>
                      <div>Número</div>
                      <div>Línea Emisora</div>
                      <div>Estado</div>
                    </div>
                    <div className="overflow-y-auto p-2 space-y-1">
                      {mensajesFiltrados.length === 0 && (
                        <div className="text-center py-10 text-gray-500 text-sm">
                          {filtroEstado === "fallidos" ? "🎉 Sin mensajes fallidos" :
                           filtroEstado === "enviados" ? "Aún no hay mensajes enviados" :
                           "Esperando registro de actividad..."}
                        </div>
                      )}
                      {mensajesFiltrados.map(m => (
                        <div
                          key={m.id}
                          className={`grid grid-cols-4 px-4 py-3 rounded-xl text-sm items-start border transition-colors ${
                            m.estado === "fallido" || m.estado === "error"
                              ? "bg-red-950/30 border-red-900/40 hover:bg-red-950/50"
                              : m.estado === "enviado" || m.estado === "entregado"
                              ? "bg-green-950/20 border-green-900/30 hover:bg-green-950/40"
                              : "bg-gray-800/50 border-transparent hover:bg-gray-700 hover:border-gray-600"
                          }`}
                        >
                          <div className="font-bold truncate pr-2 pt-0.5">{m.destinatario_nombre}</div>
                          <div className="text-gray-400 pt-0.5">{m.destinatario_numero}</div>
                          <div className="flex items-center gap-1.5 text-gray-300 text-xs pt-0.5">
                            <Smartphone className="w-3 h-3 text-gray-500 shrink-0"/>
                            <span className="truncate">{m.linea_usada}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            {(m.estado === "enviado" || m.estado === "entregado" || m.estado === "leido") && (
                              <span className="inline-flex items-center gap-1 text-green-400 bg-green-400/10 px-2 py-1 rounded-md text-xs font-bold w-fit">
                                <CheckCircle2 className="w-3 h-3"/> Enviado
                              </span>
                            )}
                            {m.estado === "en_cola" && (
                              <span className="inline-flex items-center gap-1 text-blue-400 bg-blue-400/10 px-2 py-1 rounded-md text-xs font-bold w-fit">
                                <Clock className="w-3 h-3"/> En Cola
                              </span>
                            )}
                            {m.estado === "pendiente" && (
                              <span className="inline-flex items-center gap-1 text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-md text-xs font-bold w-fit">
                                <Clock className="w-3 h-3"/> Próximo día
                              </span>
                            )}
                            {(m.estado === "fallido" || m.estado === "error") && (
                              <>
                                <span className="inline-flex items-center gap-1 text-red-400 bg-red-400/10 px-2 py-1 rounded-md text-xs font-bold w-fit">
                                  <XCircle className="w-3 h-3"/> Fallido
                                </span>
                                {m.error_descripcion && (
                                  <span className="text-red-300/70 text-[11px] leading-tight pl-0.5">
                                    {m.error_descripcion}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}

          </div>
        )}

      </div>
    </div>
  );
}
