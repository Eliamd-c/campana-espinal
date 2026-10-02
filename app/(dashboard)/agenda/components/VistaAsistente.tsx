'use client';

import { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Clock, MapPin, Users, Plus } from 'lucide-react';

interface Evento {
  id: string;
  titulo: string;
  fecha_inicio: string;
  barrio?: string;
  responsable?: string;
  estado: string;
  asistentes_esperados?: number;
}

export function VistaAsistente() {
  const [semana, setSemana] = useState<Evento[]>([]);
  const [porConfirmar, setPorConfirmar] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'confirmadas' | 'propuestas' | 'todas'>('confirmadas');

  useEffect(() => {
    const cargar = async () => {
      try {
        const hoy = new Date();
        const inicioSemana = new Date(hoy);
        const diasAlInicio = inicioSemana.getDay() === 0 ? 6 : inicioSemana.getDay() - 1;
        inicioSemana.setDate(inicioSemana.getDate() - diasAlInicio);

        const finSemana = new Date(inicioSemana);
        finSemana.setDate(finSemana.getDate() + 7);

        const desde = inicioSemana.toISOString();
        const hasta = finSemana.toISOString();

        const [resConfirmadas, resProposiciones] = await Promise.all([
          fetch(`/api/agenda?desde=${desde}&hasta=${hasta}&estado=confirmado`).then((r) =>
            r.json()
          ),
          fetch(`/api/agenda?desde=${desde}&hasta=${hasta}&estado=cupo`).then((r) => r.json()),
        ]);

        setSemana((resConfirmadas.data || []).sort(
          (a: Evento, b: Evento) =>
            new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime()
        ));

        setPorConfirmar((resProposiciones.data || []).sort(
          (a: Evento, b: Evento) =>
            new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime()
        ));
      } catch (err) {
        console.error('Error cargando agenda:', err);
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-600">Cargando agenda...</div>
      </div>
    );
  }

  const mostrar = filtro === 'confirmadas' ? semana : filtro === 'propuestas' ? porConfirmar : [...semana, ...porConfirmar];

  return (
    <div className="space-y-6">
      {/* FILTROS */}
      <div className="flex gap-2 flex-wrap">
        {(['confirmadas', 'propuestas', 'todas'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-lg font-semibold transition ${
              filtro === f
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {f === 'confirmadas' ? '✓ Confirmadas' : f === 'propuestas' ? '◉ Propuestas' : 'Todas'}
          </button>
        ))}
      </div>

      {/* RESUMEN */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
          <div className="text-2xl font-bold text-indigo-700">{semana.length}</div>
          <div className="text-sm text-indigo-600">Confirmadas esta semana</div>
        </div>
        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
          <div className="text-2xl font-bold text-amber-700">{porConfirmar.length}</div>
          <div className="text-sm text-amber-600">Propuestas por confirmar</div>
        </div>
        <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
          <div className="text-2xl font-bold text-emerald-700">
            {semana.reduce((sum, e) => sum + (e.asistentes_esperados || 0), 0)}
          </div>
          <div className="text-sm text-emerald-600">Asistentes esperados</div>
        </div>
      </div>

      {/* LISTA DE EVENTOS */}
      <div className="space-y-3">
        {mostrar.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
            <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No hay eventos {filtro === 'confirmadas' ? 'confirmados' : 'propuestos'} esta semana</p>
          </div>
        ) : (
          mostrar.map((evento) => (
            <div
              key={evento.id}
              className={`p-4 rounded-lg border transition ${
                evento.estado === 'confirmado'
                  ? 'bg-indigo-50 border-indigo-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-bold text-slate-900">{evento.titulo}</div>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        evento.estado === 'confirmado'
                          ? 'bg-indigo-200 text-indigo-800'
                          : 'bg-amber-200 text-amber-800'
                      }`}
                    >
                      {evento.estado === 'confirmado' ? 'Confirmado' : 'Cupo'}
                    </span>
                  </div>

                  <div className="space-y-1 mt-2 text-sm text-slate-700">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {new Date(evento.fecha_inicio).toLocaleDateString('es-CO', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      a las{' '}
                      {new Date(evento.fecha_inicio).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>

                    {evento.barrio && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {evento.barrio}
                      </div>
                    )}

                    {evento.asistentes_esperados && (
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        {evento.asistentes_esperados} personas esperadas
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <button
                    className="p-2 hover:bg-slate-200 rounded-lg transition"
                    title="Proponer otra fecha"
                  >
                    📅
                  </button>
                  <button
                    className="p-2 hover:bg-slate-200 rounded-lg transition"
                    title="Más detalles"
                  >
                    ℹ️
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ACCIÓN RÁPIDA */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex items-center justify-between">
        <div>
          <div className="font-semibold text-indigo-900">¿Necesitas proponer una fecha?</div>
          <p className="text-sm text-indigo-700 mt-1">Contacta al consolidador de agenda</p>
        </div>
        <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition">
          Proponer
        </button>
      </div>
    </div>
  );
}
