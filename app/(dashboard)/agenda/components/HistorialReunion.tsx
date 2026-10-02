'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Edit, X, Plus, AlertCircle } from 'lucide-react';

interface AuditoriaEvento {
  id: number;
  accion: string;
  datos_antes: any;
  datos_despues: any;
  usuario_id: string;
  timestamp: string;
}

interface HistorialProps {
  reunionId: string;
  titulo: string;
}

export function HistorialReunion({ reunionId, titulo }: HistorialProps) {
  const [eventos, setEventos] = useState<AuditoriaEvento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch(`/api/auditoria?registro_id=${reunionId}&tabla=agendamientos&limite=20`);
        const data = await res.json();
        setEventos(data.data || []);
      } catch (err) {
        console.error('Error cargando historial:', err);
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, [reunionId]);

  if (loading) {
    return <div className="text-slate-500 text-center py-4">Cargando historial...</div>;
  }

  const acciones: Record<string, { icono: any; color: string; etiqueta: string }> = {
    'alta': { icono: Plus, color: 'bg-green-100 text-green-700', etiqueta: 'Creada' },
    'confirmacion': { icono: CheckCircle2, color: 'bg-indigo-100 text-indigo-700', etiqueta: 'Confirmada' },
    'edicion': { icono: Edit, color: 'bg-blue-100 text-blue-700', etiqueta: 'Editada' },
    'cancelacion': { icono: X, color: 'bg-red-100 text-red-700', etiqueta: 'Cancelada' },
    'reprogramacion': { icono: Clock, color: 'bg-amber-100 text-amber-700', etiqueta: 'Reprogramada' },
    'default': { icono: AlertCircle, color: 'bg-slate-100 text-slate-700', etiqueta: 'Cambio' },
  };

  const obtenerAccion = (accion: string) => {
    return acciones[accion] || acciones['default'];
  };

  const obtenerCambiosDetallados = (antes: any, despues: any) => {
    if (!antes || !despues) return [];

    const cambios: Array<{ campo: string; de: any; hacia: any }> = [];
    const campos = ['estado', 'fecha_inicio', 'titulo', 'barrio', 'direccion', 'responsable'];

    campos.forEach((campo) => {
      if (antes[campo] !== despues[campo]) {
        cambios.push({
          campo,
          de: antes[campo],
          hacia: despues[campo],
        });
      }
    });

    return cambios;
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <h2 className="text-lg font-bold text-slate-900 mb-6">Historial: {titulo}</h2>

      {eventos.length === 0 ? (
        <div className="text-center text-slate-500 py-8">
          No hay cambios registrados
        </div>
      ) : (
        <div className="space-y-6">
          {eventos.map((evento, idx) => {
            const accion = obtenerAccion(evento.accion);
            const Icono = accion.icono;
            const cambios = obtenerCambiosDetallados(evento.datos_antes, evento.datos_despues);

            return (
              <div key={evento.id} className="relative">
                {/* LÍNEA CONECTORA */}
                {idx < eventos.length - 1 && (
                  <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-slate-200" />
                )}

                {/* EVENTO */}
                <div className="flex gap-4">
                  {/* ÍCONO */}
                  <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${accion.color} relative z-10`}>
                    <Icono className="w-5 h-5" />
                  </div>

                  {/* CONTENIDO */}
                  <div className="flex-1 pt-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-slate-900">{accion.etiqueta}</div>
                        <div className="text-sm text-slate-600">
                          Por: {evento.usuario_id || 'Sistema'}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 text-right">
                        {new Date(evento.timestamp).toLocaleDateString('es-CO')}
                        <br />
                        {new Date(evento.timestamp).toLocaleTimeString('es-CO', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    {/* CAMBIOS ESPECÍFICOS */}
                    {cambios.length > 0 && (
                      <div className="mt-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm space-y-1">
                        {cambios.map((cambio, i) => (
                          <div key={i} className="text-slate-700">
                            <span className="font-medium capitalize">{cambio.campo}:</span>
                            <span className="text-slate-500"> {cambio.de} </span>
                            <span className="text-slate-400">→</span>
                            <span className="text-slate-600"> {cambio.hacia}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
