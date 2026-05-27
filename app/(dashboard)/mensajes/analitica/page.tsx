"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { CheckCircle2, Clock, AlertCircle, TrendingUp, Search, Calendar, BarChart2 } from "lucide-react";

export default function AnaliticaCampanaPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id"); // ?id=1
  
  const [data, setData] = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  // Estados para listado de campañas
  const [campanas, setCampanas] = useState<any[]>([]);
  const [cargandoCampanas, setCargandoCampanas] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (id) {
      cargarAnalitica(id);
    } else {
      cargarListaCampanas();
      setCargando(false);
    }
  }, [id]);

  const cargarListaCampanas = async () => {
    setCargandoCampanas(true);
    try {
      const res = await fetch("/api/campanas");
      const json = await res.json();
      if (json.data) setCampanas(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setCargandoCampanas(false);
    }
  };

  const cargarAnalitica = async (campanaId: string) => {
    try {
      const res = await fetch(`/api/campanas/${campanaId}/analitica`);
      const json = await res.json();
      if (json.campana) setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  };

  const campanasFiltradas = campanas.filter(c => 
    c.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (cargando) return <div className="p-12 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

  if (!id) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600">
            Historial de Campañas
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Monitorea el progreso, la tasa de éxito y las cuotas de tus envíos masivos.
          </p>
        </div>

        <div className="flex gap-4 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar campaña por nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9 w-full text-sm border border-slate-200 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/50"
            />
          </div>
          <button 
            onClick={cargarListaCampanas}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
          >
            Refrescar
          </button>
        </div>

        {cargandoCampanas ? (
          <div className="flex justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          </div>
        ) : campanasFiltradas.length === 0 ? (
          <div className="p-12 text-center text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
            <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700">No se encontraron campañas</h3>
            <p className="text-sm text-slate-400 mt-1">Crea una campaña en la pestaña "Enviar Mensajes" para verla aquí.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {campanasFiltradas.map(c => {
              const stats = c.stats || { total: 0, enviados: 0, pendientes: 0, fallidos: 0 };
              const ratioExito = stats.total > 0 ? Math.round((stats.enviados / stats.total) * 100) : 0;
              const ratioFallido = stats.total > 0 ? Math.round((stats.fallidos / stats.total) * 100) : 0;
              const ratioPendiente = stats.total > 0 ? Math.round((stats.pendientes / stats.total) * 100) : 0;

              return (
                <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between hover:scale-[1.01] hover:shadow-md transition-all duration-300">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg text-slate-800 truncate max-w-[280px]">
                          {c.nombre}
                        </h3>
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(c.fecha_creado).toLocaleString("es-CO")}
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        c.estado === 'finalizada' ? 'bg-green-100 text-green-700' :
                        c.estado === 'enviando' ? 'bg-yellow-100 text-yellow-700 animate-pulse' :
                        c.estado === 'pausada' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {c.estado.toUpperCase()}
                      </span>
                    </div>

                    {/* Barra de progreso visual tricolor */}
                    <div className="space-y-1 mb-6">
                      <div className="flex justify-between text-xs text-slate-500 font-medium">
                        <span>Progreso de Envío</span>
                        <span>{stats.enviados} / {stats.total} mensajes</span>
                      </div>
                      <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex shadow-inner">
                        {stats.total > 0 ? (
                          <>
                            <div 
                              style={{ width: `${ratioExito}%` }} 
                              className="bg-emerald-500 h-full transition-all duration-500" 
                              title={`Enviados: ${stats.enviados}`}
                            />
                            <div 
                              style={{ width: `${ratioPendiente}%` }} 
                              className="bg-amber-400 h-full transition-all duration-500" 
                              title={`Pendientes: ${stats.pendientes}`}
                            />
                            <div 
                              style={{ width: `${ratioFallido}%` }} 
                              className="bg-rose-500 h-full transition-all duration-500" 
                              title={`Fallidos: ${stats.fallidos}`}
                            />
                          </>
                        ) : (
                          <div className="w-full bg-slate-200 h-full" />
                        )}
                      </div>
                    </div>

                    {/* Stats desglosadas */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl text-center mb-6">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Enviados</p>
                        <p className="text-base font-black text-emerald-600">{stats.enviados}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">En Cola</p>
                        <p className="text-base font-black text-amber-600">{stats.pendientes}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fallidos</p>
                        <p className="text-base font-black text-rose-600">{stats.fallidos}</p>
                      </div>
                    </div>
                  </div>

                  <a 
                    href={`/mensajes/analitica?id=${c.id}`}
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white text-center py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <BarChart2 className="w-4 h-4" /> Ver Monitor e Inteligencia IA
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (!id || !data) return (
    <div className="p-12 text-center text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200 mx-6 mt-6">
      <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
      <h2 className="text-xl font-bold text-slate-700">No se encontró la campaña</h2>
      <p>Asegúrate de pasar el parámetro ?id= en la URL.</p>
    </div>
  );

  const stats = data.estadisticas;
  const enviados = stats.estados["enviado"] || 0;
  const pendientes = stats.estados["pendiente"] || 0;
  const fallidos = stats.estados["fallido"] || 0;
  const total = enviados + pendientes + fallidos;
  const ratioExito = total > 0 ? Math.round((enviados / total) * 100) : 0;

  const chartEstados = [
    { name: "Enviados", value: enviados, color: "#10b981" },
    { name: "Pendientes", value: pendientes, color: "#f59e0b" },
    { name: "Fallidos", value: fallidos, color: "#ef4444" },
  ];

  const sentimentData = [
    { name: "Positivo", value: stats.sentimientos["positivo"] || 0, fill: "#10b981" },
    { name: "Negativo", value: stats.sentimientos["negativo"] || 0, fill: "#ef4444" },
    { name: "Indeciso", value: stats.sentimientos["indeciso"] || 0, fill: "#f59e0b" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Analítica: {data.campana.nombre}</h1>
          <p className="text-slate-500">Rendimiento en tiempo real de la campaña masiva.</p>
        </div>
        <span className="px-4 py-1.5 bg-indigo-50 text-indigo-700 rounded-full font-medium border border-indigo-100">
          Estado: {data.campana.estado.toUpperCase()}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <span className="text-sm font-medium text-slate-500">Tasa de Éxito</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{ratioExito}%</p>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
            <span className="text-sm font-medium text-slate-500">Enviados</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{enviados} <span className="text-sm text-slate-400 font-normal">/ {total}</span></p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-medium text-slate-500">En Cola</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{pendientes}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-5 h-5 text-rose-500" />
            <span className="text-sm font-medium text-slate-500">Fallidos</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{fallidos}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribucion Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Estado de los Mensajes</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartEstados}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartEstados.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cronologia Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Velocidad de Envío (por hora)</h3>
          <div className="h-64">
            {stats.cronologia.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.cronologia}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="fecha" tickFormatter={(v) => new Date(v).getHours() + ":00"} stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <RechartsTooltip labelFormatter={(v) => new Date(v).toLocaleString()} />
                  <Line type="monotone" dataKey="envios" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                Aún no hay datos de envío en el tiempo
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
