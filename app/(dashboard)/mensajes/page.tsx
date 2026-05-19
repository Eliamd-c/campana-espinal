"use client";

import { useEffect, useState, useCallback } from "react";
import { Send, Smartphone, Users, AlertCircle, CheckCircle2 } from "lucide-react";

interface Instancia {
  id: string;
  estado: "conectando" | "conectado" | "desconectado" | "qr";
  qr?: string;
}

const ZONAS_POR_DEFECTO = ["zona-norte", "zona-sur", "zona-centro", "zona-este", "zona-oeste"];

export default function MensajesPage() {
  const [tab, setTab] = useState<"conexiones" | "campana" | "historial">("conexiones");
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [cargandoInstancias, setCargandoInstancias] = useState(true);
  
  // Zonas dinámicas
  const [zonas, setZonas] = useState<string[]>(ZONAS_POR_DEFECTO);
  const [nuevaZona, setNuevaZona] = useState("");

  useEffect(() => {
    // Cargar zonas guardadas
    const guardadas = localStorage.getItem("zonas_whatsapp");
    if (guardadas) {
      setZonas(JSON.parse(guardadas));
    }
  }, []);

  const agregarZona = () => {
    if (!nuevaZona.trim()) return;
    const zonaId = nuevaZona.trim().toLowerCase().replace(/\s+/g, "-");
    if (!zonas.includes(zonaId)) {
      const nuevasZonas = [...zonas, zonaId];
      setZonas(nuevasZonas);
      localStorage.setItem("zonas_whatsapp", JSON.stringify(nuevasZonas));
    }
    setNuevaZona("");
  };

  // Estados para Campañas
  const [barrios, setBarrios] = useState<string[]>([]);
  const [barrioSeleccionado, setBarrioSeleccionado] = useState<string>("Todos");
  const [textoMensaje, setTextoMensaje] = useState("");
  const [instanciaEnvio, setInstanciaEnvio] = useState<string>("");
  const [audienciaCount, setAudienciaCount] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState("");
  const [destinatarioDirecto, setDestinatarioDirecto] = useState<{cedula: string, telefono: string} | null>(null);
  const [campanas, setCampanas] = useState<any[]>([]);
  const [cargandoCampanas, setCargandoCampanas] = useState(false);
  const [nombreCampana, setNombreCampana] = useState("");

  const cargarCampanas = useCallback(async () => {
    setCargandoCampanas(true);
    try {
      const res = await fetch("/api/campanas");
      const json = await res.json();
      setCampanas(json.data || []);
    } catch (error) {
      console.error("Error al cargar campañas:", error);
    } finally {
      setCargandoCampanas(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "campana") setTab("campana");
      const c = params.get("cedula");
      const t = params.get("telefono");
      if (c && t) {
        setDestinatarioDirecto({ cedula: c, telefono: t });
        setBarrioSeleccionado("Directo");
      }
    }
  }, []);

  const cargarInstancias = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/estado");
      const json = await res.json();
      let newInstancias: Instancia[] = [];
      if (Array.isArray(json.data)) {
        newInstancias = json.data;
      } else if (json.data && typeof json.data === 'object') {
        newInstancias = [{
          id: "zona-norte",
          estado: json.data.estado || "desconectado",
          qr: json.data.qr
        }];
      }
      setInstancias(newInstancias);
    } catch (error) {
      console.error("Error al cargar instancias:", error);
    } finally {
      setCargandoInstancias(false);
    }
  }, []);

  const cargarBarrios = useCallback(async () => {
    try {
      const res = await fetch("/api/barrios");
      const json = await res.json();
      setBarrios(json.data || []);
    } catch (error) {
      console.error("Error al cargar barrios:", error);
    }
  }, []);

  useEffect(() => {
    cargarInstancias();
    cargarBarrios();
    // Polling cada 5 segundos para actualizar QRs y estados
    const interval = setInterval(cargarInstancias, 5000);
    return () => clearInterval(interval);
  }, [cargarInstancias, cargarBarrios]);

  // Efecto para calcular la audiencia cuando cambia el barrio
  useEffect(() => {
    const calcularAudiencia = async () => {
      try {
        if (barrioSeleccionado === "Directo" && destinatarioDirecto) {
          setAudienciaCount(1);
          return;
        }
        
        const url = barrioSeleccionado !== "Todos" 
          ? `/api/contactos?barrio=${encodeURIComponent(barrioSeleccionado)}&limit=1`
          : `/api/contactos?limit=1`;
        
        const res = await fetch(url);
        const json = await res.json();
        if (json.meta) {
          setAudienciaCount(json.meta.total);
        }
      } catch (error) {
        console.error("Error al calcular audiencia:", error);
      }
    };
    calcularAudiencia();
  }, [barrioSeleccionado]);

  const inicializar = async (id: string) => {
    try {
      setInstancias((prev) => {
        const existe = prev.find((i) => i.id === id);
        if (existe) return prev.map((i) => (i.id === id ? { ...i, estado: "conectando" } : i));
        return [...prev, { id, estado: "conectando" }];
      });

      await fetch("/api/whatsapp/estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      cargarInstancias();
    } catch (error) {
      console.error("Error al inicializar:", error);
    }
  };

  const enviarCampana = async () => {
    if (!instanciaEnvio || !textoMensaje || audienciaCount === 0) return;
    
    setEnviando(true);
    setMensajeExito("");

    try {
      // 1. Obtener todas las cédulas de la audiencia
      let cedulas: string[] = [];
      
      if (barrioSeleccionado === "Directo" && destinatarioDirecto) {
        cedulas = [destinatarioDirecto.cedula];
      } else {
        const urlContactos = barrioSeleccionado !== "Todos" 
          ? `/api/contactos?barrio=${encodeURIComponent(barrioSeleccionado)}&limit=10000`
          : `/api/contactos?limit=10000`;
          
        const resContactos = await fetch(urlContactos);
        const jsonContactos = await resContactos.json();
        
        cedulas = jsonContactos.data.map((c: any) => c.cedula);
      }

      if (cedulas.length === 0) throw new Error("No hay contactos válidos para enviar.");

      // 2. Enviar a la API de mensajes
      const resEnvio = await fetch("/api/mensajes/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instancia_id: instanciaEnvio,
          cedulas: cedulas,
          texto_template: textoMensaje,
          nombre_campana: nombreCampana,
        }),
      });

      const jsonEnvio = await resEnvio.json();
      
      if (!resEnvio.ok) throw new Error(jsonEnvio.error || "Error al encolar");

      setMensajeExito(`¡Éxito! Se encolaron ${cedulas.length} mensajes en la línea ${instanciaEnvio}. Los mensajes se irán enviando progresivamente.`);
      setTextoMensaje(""); // Limpiar
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setEnviando(false);
    }
  };

  const instanciasConectadas = instancias.filter(i => i.estado === "conectado");

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex flex-col space-y-1">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 flex items-center gap-2">
            Central de Comunicaciones
          </h1>
          <p className="text-sm text-gray-500 font-medium">Gestiona tus líneas de WhatsApp y envía mensajes masivos a tu base de datos.</p>
        </div>
        
        <a 
          href="http://localhost:3001" 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-2.5 px-5 rounded-xl shadow-md shadow-purple-500/20 hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-2 text-sm"
        >
          <Send className="w-4 h-4" />
          Abrir Emisor (Puerto 3001)
        </a>
      </div>

      {/* Navegación por Tabs (Estilo Glassmorphism) */}
      <div className="bg-white/70 backdrop-blur-md p-1 rounded-xl shadow-sm border border-white flex gap-1 mb-8 max-w-lg">
        <button
          onClick={() => setTab("conexiones")}
          className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            tab === "conexiones" ? "bg-white text-blue-600 shadow-md" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          }`}
        >
          <Smartphone className="w-4 h-4" /> Líneas de Envío
        </button>
        <button
          onClick={() => setTab("campana")}
          className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            tab === "campana" ? "bg-white text-purple-600 shadow-md" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          }`}
        >
          <Send className="w-4 h-4" /> Nueva Campaña
        </button>
        <button
          onClick={() => { setTab("historial"); cargarCampanas(); }}
          className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            tab === "historial" ? "bg-white text-emerald-600 shadow-md" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          }`}
        >
          <Users className="w-4 h-4" /> Historial
        </button>
      </div>

      {/* CONTENIDO TABS */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        
        {/* TAB 1: CONEXIONES */}
        {tab === "conexiones" && (
          <div className="space-y-6">
            <div className="bg-white/80 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-white flex gap-3 items-center max-w-xl">
              <input 
                type="text" 
                placeholder="Nombre de nueva línea (Ej: zona rural)" 
                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500"
                value={nuevaZona}
                onChange={(e) => setNuevaZona(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && agregarZona()}
              />
              <button 
                onClick={agregarZona}
                className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 transition"
              >
                + Añadir Línea
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {zonas.map((zona) => {
              const inst = instancias.find((i) => i.id === zona);
              const estado = inst?.estado || "desconectado";

              return (
                <div key={zona} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 flex flex-col items-center text-center space-y-4 hover:shadow-lg transition-all">
                  <h3 className="font-bold text-lg text-gray-800 capitalize flex items-center gap-2">
                    <Smartphone className={`w-5 h-5 ${estado === 'conectado' ? 'text-green-500' : 'text-gray-400'}`} />
                    {zona.replace("-", " ")}
                  </h3>
                  
                  <div className="h-48 flex items-center justify-center w-full bg-gray-50/50 rounded-xl">
                    {estado === "desconectado" && (
                      <div className="text-gray-400 flex flex-col items-center">
                        <span className="text-sm font-medium">Línea inactiva</span>
                        <p className="text-xs mt-1 px-4">Escanea el código QR para vincular un teléfono de campaña.</p>
                      </div>
                    )}
                    
                    {estado === "conectando" && (
                      <div className="flex flex-col items-center text-blue-500">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2" />
                        <span className="text-sm font-bold">Generando QR...</span>
                      </div>
                    )}

                    {estado === "qr" && inst?.qr && (
                      <div className="flex flex-col items-center w-full px-4 py-2">
                        <p className="text-xs text-orange-600 font-bold mb-2">¡Abre WhatsApp y escanea!</p>
                        <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-100">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inst.qr)}`} 
                            alt="Código QR de WhatsApp" 
                            className="w-32 h-32 object-contain"
                          />
                        </div>
                      </div>
                    )}

                    {estado === "conectado" && (
                      <div className="text-green-500 flex flex-col items-center">
                        <CheckCircle2 className="w-12 h-12 mb-2 text-green-400" />
                        <span className="text-sm font-bold">Conectado y listo</span>
                        <span className="text-xs text-gray-500 mt-1">Recibiendo y enviando</span>
                      </div>
                    )}
                  </div>

                  <div className="w-full pt-4 border-t border-gray-100">
                    {estado === "desconectado" ? (
                      <button
                        onClick={() => inicializar(zona)}
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-bold py-3 rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg hover:from-blue-700 hover:to-blue-800 transition-all"
                      >
                        Vincular Teléfono
                      </button>
                    ) : estado === "conectado" ? (
                      <div className="w-full bg-green-50 border border-green-100 text-green-700 text-sm font-bold py-3 rounded-xl">
                        Línea Operativa
                      </div>
                    ) : (
                      <div className="w-full bg-gray-100 text-gray-400 text-sm font-bold py-3 rounded-xl">
                        Esperando escaneo...
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}

        {/* TAB 2: NUEVA CAMPAÑA */}
        {tab === "campana" && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <Send className="w-6 h-6 text-purple-600" /> Lanzar Mensaje Masivo
            </h2>

            {mensajeExito && (
              <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-6 py-4 rounded-xl flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />
                <p className="font-medium text-sm">{mensajeExito}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Columna Izquierda: Configuración */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">0. Nombre de la Campaña (Para el historial)</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Invitación Evento Central" 
                    className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl p-3.5 text-sm font-medium focus:ring-0 focus:border-purple-500 outline-none transition-all mb-4"
                    value={nombreCampana}
                    onChange={(e) => setNombreCampana(e.target.value)}
                  />
                  
                  <label className="block text-sm font-bold text-gray-700 mb-2">1. Selecciona tu audiencia (Filtro por Barrio)</label>
                  <select 
                    className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl p-3.5 text-sm font-medium focus:ring-0 focus:border-purple-500 outline-none transition-all cursor-pointer"
                    value={barrioSeleccionado}
                    onChange={(e) => {
                      setBarrioSeleccionado(e.target.value);
                      if (e.target.value !== "Directo") setDestinatarioDirecto(null);
                    }}
                  >
                    <option value="Todos">Todos los barrios registrados (Base completa)</option>
                    {destinatarioDirecto && (
                      <option value="Directo">Mensaje Directo (+{destinatarioDirecto.telefono})</option>
                    )}
                    {barrios.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-1">Impacto Estimado</p>
                    <p className="text-sm font-medium text-gray-700">Se enviará a los contactos válidos de esta selección.</p>
                  </div>
                  <div className="text-right">
                    {audienciaCount === null ? (
                      <div className="animate-pulse h-8 w-16 bg-purple-200 rounded-md"></div>
                    ) : (
                      <div className="flex items-center gap-2 text-2xl font-black text-purple-700">
                        <Users className="w-6 h-6" /> {audienciaCount}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">2. Selecciona la línea de salida</label>
                  {instanciasConectadas.length === 0 ? (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-red-800">No hay líneas conectadas</p>
                        <p className="text-xs text-red-600 mt-1">Ve a la pestaña "Líneas de Envío" y vincula un WhatsApp primero.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {instanciasConectadas.map(inst => (
                        <button
                          key={inst.id}
                          onClick={() => setInstanciaEnvio(inst.id)}
                          className={`p-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                            instanciaEnvio === inst.id 
                            ? "border-purple-600 bg-purple-50 text-purple-700" 
                            : "border-gray-100 bg-gray-50 text-gray-500 hover:border-purple-200 hover:bg-white"
                          }`}
                        >
                          <Smartphone className="w-4 h-4" /> {inst.id.replace("-", " ")}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Columna Derecha: Redacción */}
              <div className="space-y-4">
                <label className="block text-sm font-bold text-gray-700">3. Redacta el mensaje (Pega el de la IA)</label>
                <div className="relative">
                  <textarea
                    rows={8}
                    className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl p-4 text-sm font-medium focus:ring-0 focus:border-purple-500 outline-none transition-all resize-none"
                    placeholder={`Ejemplo:\n¡Hola {{nombre}}!\n\nTe invitamos este fin de semana a la reunión...`}
                    value={textoMensaje}
                    onChange={(e) => setTextoMensaje(e.target.value)}
                  />
                  <div className="absolute bottom-4 right-4 flex gap-2">
                    <span className="text-[10px] font-bold text-white bg-purple-500 px-2 py-1 rounded-md opacity-80 pointer-events-none">
                      Tip: Usa {'{{nombre}}'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={enviarCampana}
                  disabled={enviando || !instanciaEnvio || !textoMensaje || (audienciaCount || 0) === 0}
                  className="w-full mt-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-purple-500/30 hover:shadow-xl hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex justify-center items-center gap-2 text-lg"
                >
                  {enviando ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                      Encolando Mensajes...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Enviar a {audienciaCount || 0} personas
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: HISTORIAL */}
        {tab === "historial" && (
          <div className="space-y-6">
            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-white">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-500" /> Historial de Campañas
              </h2>
              
              {cargandoCampanas ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
                </div>
              ) : campanas.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No se han registrado campañas aún.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3">Campaña</th>
                        <th scope="col" className="px-6 py-3">Estado</th>
                        <th scope="col" className="px-6 py-3">Mensajes</th>
                        <th scope="col" className="px-6 py-3">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campanas.map((c) => (
                        <tr key={c.id} className="bg-white border-b hover:bg-gray-50">
                          <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                            {c.nombre}
                          </th>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                              c.estado === "finalizada" ? "bg-green-100 text-green-700" :
                              c.estado === "enviando" ? "bg-blue-100 text-blue-700" :
                              "bg-gray-100 text-gray-700"
                            }`}>
                              {c.estado}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {c._count?.mensajes || 0}
                          </td>
                          <td className="px-6 py-4">
                            {new Date(c.fecha_creado).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
