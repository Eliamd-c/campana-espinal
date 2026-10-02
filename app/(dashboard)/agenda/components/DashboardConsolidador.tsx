'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, MapPin, AlertTriangle, TrendingUp, Users, Calendar } from 'lucide-react';

interface Alerta {
  tipo: string;
  severidad: 'alta' | 'media' | 'baja';
  texto: string;
  reuniones?: any[];
}

interface BriefingData {
  hoy: string;
  reunionesHoy: {
    cantidad: number;
    eventos: any[];
  };
  alertas: Alerta[];
  solicitudesPendientes: {
    cantidad: number;
    eventos: any[];
  };
  resumenSemanal: {
    confirmadas: number;
    cupos: number;
    borradores: number;
    rechazadas: number;
    canceladas: number;
  };
  timelineVisual: any[];
}

interface Conflicto {
  tipo: string;
  severidad: 'alta' | 'media' | 'baja';
  descripcion: string;
  evento1?: any;
  evento2?: any;
  eventos?: any[];
  sugerencia?: string;
}

interface ConflictosData {
  conflictos: Conflicto[];
  resumen: {
    alta: number;
    media: number;
    baja: number;
  };
}

export function DashboardConsolidador() {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [conflictos, setConflictos] = useState<ConflictosData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cargar = async () => {
      try {
        const [resBriefing, resConflictos] = await Promise.all([
          fetch('/api/agenda/daily-briefing').then(r => r.json()),
          fetch('/api/agenda/conflictos').then(r => r.json()),
        ]);

        if (resBriefing.data) setBriefing(resBriefing.data);
        if (resConflictos.data) setConflictos(resConflictos.data);
      } catch (err) {
        console.error('Error cargando dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, []);

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
        <div className="animate-pulse flex justify-center items-center gap-2">
          <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce" />
          <span className="text-slate-600">Cargando briefing...</span>
        </div>
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center text-slate-500">
        No se pudo cargar el briefing
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HOY */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-indigo-600" />
          <h2 className="text-xl font-bold text-slate-900">HOY</h2>
          <span className="text-sm text-slate-500 ml-auto">{briefing.hoy}</span>
        </div>

        {briefing.reunionesHoy.cantidad === 0 ? (
          <p className="text-slate-500 text-center py-8">Sin reuniones confirmadas hoy</p>
        ) : (
          <div className="space-y-3">
            {briefing.reunionesHoy.eventos.map((evento) => (
              <div
                key={evento.id}
                className="flex items-start gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200"
              >
                <div className="flex-1">
                  <div className="font-semibold text-slate-900">{evento.titulo}</div>
                  <div className="text-sm text-slate-600 mt-1">
                    🕐 {evento.hora} · {evento.responsable || 'Sin asignar'}
                  </div>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                    evento.estado === 'confirmado'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {evento.estado}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ALERTAS CRÍTICAS */}
      {briefing.alertas.length > 0 && (
        <div className="bg-red-50 p-6 rounded-xl shadow-sm border border-red-200">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-bold text-red-900">⚠️ ALERTAS CRÍTICAS</h2>
          </div>

          <div className="space-y-3">
            {briefing.alertas.map((alerta, idx) => (
              <div key={idx} className="bg-white p-3 rounded-lg border border-red-200">
                <div className="font-semibold text-red-900">{alerta.texto}</div>
                {alerta.reuniones && alerta.reuniones.length > 0 && (
                  <div className="mt-2 text-sm text-red-800 space-y-1">
                    {alerta.reuniones.map((r) => (
                      <div key={r.id}>
                        <span className="font-medium">{r.titulo}</span>
                        {r.campos && r.campos.length > 0 && (
                          <span className="text-red-700"> - Falta: {r.campos.join(', ')}</span>
                        )}
                        {r.recursos && r.recursos.length > 0 && (
                          <span className="text-red-700"> - Recursos: {r.recursos.join(', ')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CONFLICTOS DETECTADOS */}
      {conflictos && conflictos.conflictos.length > 0 && (
        <div className="bg-orange-50 p-6 rounded-xl shadow-sm border border-orange-200">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-bold text-orange-900">
              🔴 CONFLICTOS DETECTADOS ({conflictos.resumen.alta + conflictos.resumen.media})
            </h2>
          </div>

          <div className="space-y-3">
            {conflictos.conflictos
              .filter((c) => c.severidad !== 'baja')
              .map((conflicto, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    conflicto.severidad === 'alta'
                      ? 'bg-white border-red-300'
                      : 'bg-white border-orange-300'
                  }`}
                >
                  <div className={`font-semibold ${conflicto.severidad === 'alta' ? 'text-red-900' : 'text-orange-900'}`}>
                    {conflicto.descripcion}
                  </div>
                  {conflicto.evento1 && (
                    <div className="mt-2 text-sm text-slate-700 space-y-1">
                      <div>
                        <span className="font-medium">{conflicto.evento1.titulo}</span>
                        {conflicto.evento1.hora && (
                          <span> · {new Date(conflicto.evento1.hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                        {conflicto.evento1.barrio && (
                          <span> · {conflicto.evento1.barrio}</span>
                        )}
                      </div>
                      <div>
                        <span className="font-medium">{conflicto.evento2?.titulo}</span>
                        {conflicto.evento2?.hora && (
                          <span> · {new Date(conflicto.evento2.hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                        {conflicto.evento2?.barrio && (
                          <span> · {conflicto.evento2.barrio}</span>
                        )}
                      </div>
                    </div>
                  )}
                  {conflicto.sugerencia && (
                    <div className="mt-2 text-sm font-medium text-slate-700 bg-yellow-50 p-2 rounded border border-yellow-200">
                      💡 {conflicto.sugerencia}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* RESUMEN SEMANAL */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
          <div className="text-2xl font-bold text-indigo-700">{briefing.resumenSemanal.confirmadas}</div>
          <div className="text-sm text-indigo-600">Confirmadas</div>
        </div>
        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
          <div className="text-2xl font-bold text-amber-700">{briefing.resumenSemanal.cupos}</div>
          <div className="text-sm text-amber-600">Cupos</div>
        </div>
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div className="text-2xl font-bold text-slate-700">{briefing.resumenSemanal.borradores}</div>
          <div className="text-sm text-slate-600">Borradores</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <div className="text-2xl font-bold text-red-700">{briefing.resumenSemanal.rechazadas}</div>
          <div className="text-sm text-red-600">Rechazadas</div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-gray-700">{briefing.resumenSemanal.canceladas}</div>
          <div className="text-sm text-gray-600">Canceladas</div>
        </div>
      </div>

      {/* SOLICITUDES PENDIENTES */}
      {briefing.solicitudesPendientes.cantidad > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">
              DECISIONES PENDIENTES ({briefing.solicitudesPendientes.cantidad})
            </h2>
          </div>

          <div className="space-y-2">
            {briefing.solicitudesPendientes.eventos.slice(0, 5).map((solicitud) => (
              <div
                key={solicitud.id}
                className="flex items-start justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
              >
                <div className="flex-1">
                  <div className="font-semibold text-slate-900">{solicitud.titulo}</div>
                  <div className="text-sm text-slate-600">
                    {solicitud.solicitadaPor && `Por: ${solicitud.solicitadaPor}`}
                    {solicitud.fechaPropuesta && ` · ${solicitud.fechaPropuesta}`}
                  </div>
                </div>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
                  {solicitud.recursosSolicitados} recursos
                </span>
              </div>
            ))}
          </div>

          {briefing.solicitudesPendientes.cantidad > 5 && (
            <div className="mt-4 text-center text-sm text-slate-500">
              +{briefing.solicitudesPendientes.cantidad - 5} más en la bandeja
            </div>
          )}
        </div>
      )}

      {/* TIMELINE VISUAL */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Próximos 7 días</h2>
        <div className="flex justify-between text-xs font-semibold text-slate-600 mb-2">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, i) => (
            <div key={d} className="text-center">
              {d}
              <div className="text-slate-400 font-normal mt-1">
                {new Date(briefing.timelineVisual[i]?.fecha).getDate()}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between gap-2">
          {briefing.timelineVisual.map((dia, idx) => (
            <div
              key={idx}
              className="flex-1 bg-gradient-to-b from-indigo-50 to-indigo-100 rounded-lg p-3 text-center border border-indigo-200"
            >
              <div className="text-2xl font-bold text-indigo-700">{dia.cantidad}</div>
              <div className="text-xs text-indigo-600 mt-1">
                {dia.estados.confirmado > 0 && `✓${dia.estados.confirmado} `}
                {dia.estados.cupo > 0 && `◉${dia.estados.cupo}`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
