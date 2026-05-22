"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Send, Users, CheckCircle2, Image as ImageIcon, ListPlus, Smartphone, BarChart3, ChevronRight, ChevronLeft, Search, RefreshCw, XCircle, Clock, UploadCloud } from "lucide-react";
import { supabaseClient } from "@/lib/supabaseClient";
import { convertBlocksToWhatsApp } from "@/lib/message-builder/converters";
import MessageBuilder from "./components/MessageBuilder";

export default function MensajesPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [activeCampanaId, setActiveCampanaId] = useState<number | null>(null);

  // Paso 1: Redacción
  const [nombreCampana, setNombreCampana] = useState("");
  const [textoMensaje, setTextoMensaje] = useState("");
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
  const [liveStats, setLiveStats] = useState({ total: 0, enviados: 0, pendientes: 0, fallidos: 0 });
  const [liveMensajes, setLiveMensajes] = useState<any[]>([]);
  
  const [enviando, setEnviando] = useState(false);

  // Inicialización
  useEffect(() => {
    fetch("/api/barrios").then(res => res.json()).then(json => setBarrios(json.data || []));
  }, []);

  // Fetch Audiencia cuando cambian los filtros
  useEffect(() => {
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
          setAudienciaList(json.data || []);
      })
      .finally(() => setCargandoAudiencia(false));
  }, [step, barrioSeleccionado, intencionVoto, soloManuales]);

  // Polling para Monitoreo en Paso 3
  useEffect(() => {
    let interval: any;
    if (step === 3 && activeCampanaId) {
      const fetchLive = async () => {
        const res = await fetch(`/api/campanas/${activeCampanaId}/mensajes?limit=100`);
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

  const enviarCampana = async () => {
    if (!textoMensaje || (audienciaList.length + manuales.length) === 0) return;
    setEnviando(true);
    
    try {
      const cedulas = audienciaList.map(c => c.cedula);
      const res = await fetch("/api/mensajes/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedulas: cedulas,
          texto: textoMensaje,
          nombre_campana: nombreCampana || `Campaña ${new Date().toLocaleDateString()}`,
          mediaUrl: mediaUrl || undefined,
          pollOptions: pollOptionsArray.length > 0 ? pollOptionsArray : undefined,
          lineaId: lineaSeleccionada ? parseInt(lineaSeleccionada) : undefined,
          delayMin,
          delayMax,
          manuales: manuales.map(m => ({ nombre: m.nombre, telefono: m.telefono }))
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        let errMsg = json.error || "Error al enviar";
        if (json.details) {
          errMsg += ": " + JSON.stringify(json.details);
        }
        throw new Error(errMsg);
      }

      setActiveCampanaId(json.campanaId);
      setStep(3); // Saltar a monitoreo
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 md:p-8">
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
                <p className="text-gray-500 mb-8">Filtra tu base de datos y previsualiza exactamente a quién le llegará el mensaje.</p>
            
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
                      {audienciaList.length + manuales.length} destinatarios
                    </span>
                  </div>
                  
                  <div className="p-6">
                    {cargandoAudiencia ? (
                      <div className="flex justify-center items-center py-12">
                        <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
                      </div>
                    ) : (audienciaList.length + manuales.length) === 0 ? (
                      <p className="text-center text-gray-500 py-12">Ningún contacto coincide con los filtros ni manuales agregados.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[...manuales, ...audienciaList].slice(0, 50).map((c, i) => (
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
                          <option key={l.id} value={l.id}>{l.nombre} ({l.numero_telefono || 'Sin número'}) - {l.estado}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-400 mt-2">Si dejas esta opción en blanco, el sistema repartirá la carga entre todas tus líneas conectadas equitativamente.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Tiempos de Espera (Anti-Ban)</label>
                      <div className="flex items-center gap-4">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Mínimo (Seg)</label>
                          <input type="number" min={1} max={60} value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value))} className="w-24 border border-slate-200 p-2 rounded-lg text-sm outline-none focus:border-purple-500" />
                        </div>
                        <span className="text-gray-400 mt-4">-</span>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Máximo (Seg)</label>
                          <input type="number" min={1} max={120} value={delayMax} onChange={(e) => setDelayMax(Number(e.target.value))} className="w-24 border border-slate-200 p-2 rounded-lg text-sm outline-none focus:border-purple-500" />
                        </div>
                      </div>
                      <p className="text-[10px] text-orange-500/80 font-medium mt-2">Valores recomendados: 5 a 15 segundos. Tiempos menores a 2s incrementan el riesgo de bloqueo.</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            <div className="mt-8 flex justify-end border-t pt-6">
              <button onClick={enviarCampana} disabled={enviando || (audienciaList.length + manuales.length) === 0} className="bg-green-600 text-white px-8 py-4 rounded-xl font-bold flex items-center gap-3 hover:bg-green-700 transition-transform hover:scale-105 disabled:opacity-50 shadow-lg text-lg">
                {enviando ? <RefreshCw className="w-6 h-6 animate-spin"/> : <Send className="w-6 h-6"/>}
                {enviando ? 'Iniciando Motor...' : `¡Lanzar Campaña a ${audienciaList.length + manuales.length}!`}
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
                  <div className="w-4 h-4 bg-green-400 rounded-full animate-pulse"></div>
                  Transmisión en Vivo
                </h2>
                <p className="text-gray-400 text-sm mt-1">Monitoreando la distribución de {liveStats.total} mensajes.</p>
              </div>
              <button onClick={() => { setStep(1); setTextoMensaje(""); setActiveCampanaId(null); setLiveMensajes([]); }} className="text-gray-400 hover:text-white bg-gray-800 px-4 py-2 rounded-lg font-bold text-sm">
                Nueva Campaña
              </button>
            </div>

            {/* Metricas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                <p className="text-gray-400 text-xs font-bold mb-1 uppercase tracking-wider">Total a Enviar</p>
                <p className="text-3xl font-black">{liveStats.total}</p>
              </div>
              <div className="bg-gray-800 border border-green-900 p-6 rounded-2xl">
                <p className="text-green-500 text-xs font-bold mb-1 uppercase tracking-wider">Enviados (Éxito)</p>
                <p className="text-3xl font-black text-green-400">{liveStats.enviados}</p>
              </div>
              <div className="bg-gray-800 border border-yellow-900 p-6 rounded-2xl">
                <p className="text-yellow-500 text-xs font-bold mb-1 uppercase tracking-wider">Pendientes (Cola)</p>
                <p className="text-3xl font-black text-yellow-400">{liveStats.pendientes}</p>
              </div>
              <div className="bg-gray-800 border border-red-900 p-6 rounded-2xl">
                <p className="text-red-500 text-xs font-bold mb-1 uppercase tracking-wider">Fallidos</p>
                <p className="text-3xl font-black text-red-400">{liveStats.fallidos}</p>
              </div>
            </div>

            {/* Barra de Progreso */}
            <div className="bg-gray-800 rounded-full h-4 mb-8 overflow-hidden flex">
              {liveStats.total > 0 && (
                <>
                  <div style={{width: `${(liveStats.enviados/liveStats.total)*100}%`}} className="bg-green-500 h-full transition-all duration-500"></div>
                  <div style={{width: `${(liveStats.fallidos/liveStats.total)*100}%`}} className="bg-red-500 h-full transition-all duration-500"></div>
                </>
              )}
            </div>

            {/* Tabla en vivo */}
            <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden flex flex-col max-h-[400px]">
              <div className="grid grid-cols-4 px-6 py-3 bg-gray-900/50 text-xs font-bold text-gray-400 uppercase">
                <div>Destinatario</div>
                <div>Número</div>
                <div>Línea Emisora</div>
                <div>Estado</div>
              </div>
              <div className="overflow-y-auto p-2 space-y-1">
                {liveMensajes.length === 0 && (
                  <div className="text-center py-8 text-gray-500">Esperando registro de actividad...</div>
                )}
                {liveMensajes.map(m => (
                  <div key={m.id} className="grid grid-cols-4 px-4 py-3 bg-gray-800/50 hover:bg-gray-700 rounded-lg text-sm items-center border border-transparent hover:border-gray-600 transition-colors">
                    <div className="font-bold truncate pr-2">{m.destinatario_nombre}</div>
                    <div className="text-gray-400">{m.destinatario_numero}</div>
                    <div className="flex items-center gap-2 text-gray-300 text-xs">
                      <Smartphone className="w-3 h-3 text-gray-500"/> {m.linea_usada}
                    </div>
                    <div>
                      {(m.estado === 'enviado' || m.estado === 'entregado') && <span className="inline-flex items-center gap-1 text-green-400 bg-green-400/10 px-2 py-1 rounded-md text-xs font-bold"><CheckCircle2 className="w-3 h-3"/> Enviado</span>}
                      {m.estado === 'pendiente' && <span className="inline-flex items-center gap-1 text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-md text-xs font-bold"><Clock className="w-3 h-3"/> Pendiente</span>}
                      {(m.estado === 'fallido' || m.estado === 'error') && <span className="inline-flex items-center gap-1 text-red-400 bg-red-400/10 px-2 py-1 rounded-md text-xs font-bold"><XCircle className="w-3 h-3"/> Fallido</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
