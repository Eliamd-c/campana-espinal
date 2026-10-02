'use client';

import { useEffect, useState } from 'react';
import { Package, CheckCircle2, AlertTriangle, Clock, TrendingUp } from 'lucide-react';

interface Recurso {
  id: string;
  item: string;
  cantidad_solicitada?: number;
  cantidad_conseguida?: number;
  estado: string;
  responsable?: string;
  agendamiento_id: string;
  titulo_reunion?: string;
  fecha_reunion?: string;
}

interface ResumenRecursos {
  total: number;
  conseguidos: number;
  pendientes: number;
  porcentaje: number;
}

export function VistaLogistico() {
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [resumen, setResumen] = useState<ResumenRecursos>({
    total: 0,
    conseguidos: 0,
    pendientes: 0,
    porcentaje: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'todos' | 'pendientes' | 'conseguidos'>('todos');

  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch('/api/agenda/recursos?dias=30');
        const data = await res.json();
        const recursosList = data.data || [];

        setRecursos(recursosList);

        // Calcular resumen
        const total = recursosList.length;
        const conseguidos = recursosList.filter((r: Recurso) =>
          ['conseguido', 'entregado'].includes(r.estado)
        ).length;
        const pendientes = total - conseguidos;

        setResumen({
          total,
          conseguidos,
          pendientes,
          porcentaje: total > 0 ? Math.round((conseguidos / total) * 100) : 0,
        });
      } catch (err) {
        console.error('Error cargando recursos:', err);
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-600">Cargando logística...</div>
      </div>
    );
  }

  const calcularUrgencia = (fecha?: string): 'rojo' | 'ambar' | 'gris' => {
    if (!fecha) return 'gris';
    const dias = Math.floor(
      (new Date(fecha).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    if (dias < 1) return 'rojo'; // HOY
    if (dias < 7) return 'ambar'; // SEMANA
    return 'gris'; // PRÓXIMO
  };

  const mostrar = filtro === 'pendientes'
    ? recursos.filter((r) => !['conseguido', 'entregado'].includes(r.estado))
    : filtro === 'conseguidos'
      ? recursos.filter((r) => ['conseguido', 'entregado'].includes(r.estado))
      : recursos;

  const coloresUrgencia: Record<string, string> = {
    rojo: 'bg-red-100 border-red-300 text-red-800',
    ambar: 'bg-amber-100 border-amber-300 text-amber-800',
    gris: 'bg-slate-100 border-slate-300 text-slate-700',
  };

  const etiquetasEstado: Record<string, string> = {
    solicitado: 'Solicitado',
    conseguido: 'Conseguido',
    entregado: 'En el sitio',
    no_disponible: 'No se consiguió',
  };

  return (
    <div className="space-y-6">
      {/* BARRA DE PROGRESO */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            Progreso General
          </h2>
          <div className="text-3xl font-bold text-indigo-600">{resumen.porcentaje}%</div>
        </div>

        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full transition-all"
            style={{ width: `${resumen.porcentaje}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div>
            <div className="text-2xl font-bold text-slate-900">{resumen.total}</div>
            <div className="text-sm text-slate-600">Total</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-600">{resumen.conseguidos}</div>
            <div className="text-sm text-slate-600">Conseguidos</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">{resumen.pendientes}</div>
            <div className="text-sm text-slate-600">Pendientes</div>
          </div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex gap-2 flex-wrap">
        {(['todos', 'pendientes', 'conseguidos'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-lg font-semibold transition ${
              filtro === f
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {f === 'todos'
              ? 'Todos'
              : f === 'pendientes'
                ? '🔄 Pendientes'
                : '✓ Conseguidos'}
          </button>
        ))}
      </div>

      {/* LISTA DE RECURSOS POR REUNIÓN */}
      <div className="space-y-4">
        {mostrar.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>
              {filtro === 'pendientes'
                ? 'Sin recursos pendientes'
                : filtro === 'conseguidos'
                  ? 'Sin recursos conseguidos'
                  : 'Sin recursos registrados'}
            </p>
          </div>
        ) : (
          recursos
            .reduce(
              (grupos, recurso) => {
                const grupo = grupos.find((g) => g.reunion_id === recurso.agendamiento_id);
                if (grupo) {
                  grupo.recursos.push(recurso);
                } else {
                  grupos.push({
                    reunion_id: recurso.agendamiento_id,
                    titulo: recurso.titulo_reunion || 'Sin título',
                    fecha: recurso.fecha_reunion,
                    recursos: [recurso],
                  });
                }
                return grupos;
              },
              [] as any[]
            )
            .filter((g) =>
              filtro === 'todos'
                ? true
                : filtro === 'pendientes'
                  ? g.recursos.some(
                      (r: Recurso) => !['conseguido', 'entregado'].includes(r.estado)
                    )
                  : g.recursos.some((r: Recurso) =>
                      ['conseguido', 'entregado'].includes(r.estado)
                    )
            )
            .map((grupo) => {
              const urgencia = calcularUrgencia(grupo.fecha);
              return (
                <div
                  key={grupo.reunion_id}
                  className={`rounded-lg border p-4 ${coloresUrgencia[urgencia]}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-lg">{grupo.titulo}</div>
                      {grupo.fecha && (
                        <div className="text-sm mt-1">
                          {new Date(grupo.fecha).toLocaleDateString('es-CO', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      )}
                    </div>
                    <span className="px-3 py-1 bg-white rounded-full text-xs font-bold">
                      {grupo.recursos.filter((r: Recurso) => ['conseguido', 'entregado'].includes(r.estado)).length}/{grupo.recursos.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {grupo.recursos.map((recurso: Recurso) => (
                      <div
                        key={recurso.id}
                        className="bg-white rounded p-2 flex items-center justify-between text-sm"
                      >
                        <div className="flex-1">
                          <div className="font-semibold">
                            {recurso.item}
                            {recurso.cantidad_solicitada && ` (${recurso.cantidad_solicitada})`}
                          </div>
                          {recurso.responsable && (
                            <div className="text-xs opacity-75">👤 {recurso.responsable}</div>
                          )}
                        </div>
                        <span className="px-2 py-1 bg-slate-100 rounded text-xs font-semibold">
                          {etiquetasEstado[recurso.estado] || recurso.estado}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* LEYENDA DE URGENCIA */}
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
        <div className="text-sm font-semibold text-slate-900 mb-3">Urgencia:</div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-400 rounded" />
            <span>HOY - Crítico</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-400 rounded" />
            <span>Esta semana - Urgente</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-slate-400 rounded" />
            <span>Próximo - Normal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
