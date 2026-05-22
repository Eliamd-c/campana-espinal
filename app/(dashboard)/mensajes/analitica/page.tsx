"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { CheckCircle2, Clock, AlertCircle, TrendingUp } from "lucide-react";

export default function AnaliticaCampanaPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id"); // ?id=1
  
  const [data, setData] = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (id) cargarAnalitica(id);
    else setCargando(false);
  }, [id]);

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

  if (cargando) return <div className="p-12 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  
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
