'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, MapPin, User } from 'lucide-react';

interface Evento {
  id: string;
  titulo: string;
  fecha_inicio: string;
  fecha_fin?: string;
  barrio?: string;
  responsable?: string;
  estado: string;
  recursos_solicitados?: any[];
}

interface DiaHora {
  fecha: Date;
  eventos: Evento[];
}

const HORAS = Array.from({ length: 16 }, (_, i) => i + 6); // 6am a 10pm
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const COLORES_ESTADO: Record<string, string> = {
  confirmado: 'bg-indigo-500 text-white',
  cupo: 'bg-amber-400 text-slate-900',
  borrador: 'bg-slate-200 text-slate-700',
  rechazado: 'bg-red-200 text-red-800',
  cancelado: 'bg-gray-300 text-gray-700 line-through',
};

export function CalendarioSemanal({ agendamientos = [] }: { agendamientos?: Evento[] }) {
  const [semanaActual, setSemanaActual] = useState<Date>(new Date());
  const [eventoSeleccionado, setEventoSeleccionado] = useState<Evento | null>(null);

  const obtenerInicioSemana = (fecha: Date) => {
    const d = new Date(fecha);
    const dias = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - dias);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const inicioSemana = obtenerInicioSemana(semanaActual);
  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(inicioSemana);
    fecha.setDate(fecha.getDate() + i);
    return fecha;
  });

  const moverSemana = (paso: number) => {
    const nueva = new Date(semanaActual);
    nueva.setDate(nueva.getDate() + paso * 7);
    setSemanaActual(nueva);
  };

  const obtenerEventosDia = (dia: Date): Evento[] => {
    return agendamientos.filter((e) => {
      const fechaEvento = new Date(e.fecha_inicio);
      return (
        fechaEvento.getFullYear() === dia.getFullYear() &&
        fechaEvento.getMonth() === dia.getMonth() &&
        fechaEvento.getDate() === dia.getDate()
      );
    });
  };

  const obtenerEventosHora = (dia: Date, hora: number): Evento[] => {
    return obtenerEventosDia(dia).filter((e) => {
      const fechaEvento = new Date(e.fecha_inicio);
      return fechaEvento.getHours() === hora;
    });
  };

  const esHoy = (fecha: Date) => {
    const hoy = new Date();
    return (
      fecha.getFullYear() === hoy.getFullYear() &&
      fecha.getMonth() === hoy.getMonth() &&
      fecha.getDate() === hoy.getDate()
    );
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-900">
          Semana de {inicioSemana.toLocaleDateString('es-CO', {
            day: 'numeric',
            month: 'short',
          })}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => moverSemana(-1)}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setSemanaActual(new Date())}
            className="px-4 py-2 hover:bg-slate-100 rounded-lg font-medium text-sm transition"
          >
            Hoy
          </button>
          <button
            onClick={() => moverSemana(1)}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
            aria-label="Semana siguiente"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* CALENDARIO TIMELINE */}
      <div className="flex gap-1 overflow-x-auto pb-4">
        {/* COLUMNA DE HORAS */}
        <div className="flex flex-col min-w-[60px] flex-shrink-0">
          <div className="h-12 border-b border-slate-200" />
          {HORAS.map((hora) => (
            <div
              key={hora}
              className="h-16 border-b border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-500"
            >
              {hora}:00
            </div>
          ))}
        </div>

        {/* COLUMNAS DE DÍAS */}
        {diasSemana.map((dia) => {
          const eventosDia = obtenerEventosDia(dia);
          const esHoyFlag = esHoy(dia);

          return (
            <div key={dia.toISOString()} className="flex flex-col min-w-[180px] flex-shrink-0 border-l border-slate-200">
              {/* HEADER DÍA */}
              <div
                className={`h-12 flex flex-col items-center justify-center border-b border-slate-200 font-semibold ${
                  esHoyFlag ? 'bg-indigo-50' : 'bg-slate-50'
                }`}
              >
                <div className="text-xs text-slate-600">{DIAS_SEMANA[dia.getDay() === 0 ? 6 : dia.getDay() - 1]}</div>
                <div
                  className={`text-lg font-bold ${
                    esHoyFlag ? 'text-indigo-600 bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center' : 'text-slate-900'
                  }`}
                >
                  {dia.getDate()}
                </div>
              </div>

              {/* HORAS */}
              {HORAS.map((hora) => {
                const eventosHora = obtenerEventosHora(dia, hora);

                return (
                  <div key={`${dia.toISOString()}-${hora}`} className="h-16 border-b border-slate-200 p-1 hover:bg-slate-50 transition relative">
                    {eventosHora.map((evento, idx) => (
                      <div
                        key={evento.id}
                        onClick={() => setEventoSeleccionado(evento)}
                        className={`text-xs p-1.5 rounded mb-0.5 cursor-pointer hover:shadow-md transition truncate ${
                          COLORES_ESTADO[evento.estado] || 'bg-slate-200'
                        }`}
                        title={evento.titulo}
                      >
                        <div className="font-semibold line-clamp-1">{evento.titulo}</div>
                        {evento.responsable && (
                          <div className="text-xs opacity-75 line-clamp-1">{evento.responsable}</div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* RESUMEN DIARIO */}
              {eventosDia.length > 0 && (
                <div className="p-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 font-semibold">
                  {eventosDia.length} evento{eventosDia.length > 1 ? 's' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* LEYENDA */}
      <div className="mt-6 pt-4 border-t border-slate-200 flex flex-wrap gap-4 text-xs">
        {Object.entries(COLORES_ESTADO).map(([estado, classes]) => (
          <div key={estado} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded ${classes}`} />
            <span className="text-slate-600 capitalize">{estado}</span>
          </div>
        ))}
      </div>

      {/* MODAL DE EVENTO */}
      {eventoSeleccionado && (
        <div
          className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50"
          onClick={() => setEventoSeleccionado(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{eventoSeleccionado.titulo}</h3>
                <span
                  className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${
                    COLORES_ESTADO[eventoSeleccionado.estado] || 'bg-slate-200'
                  }`}
                >
                  {eventoSeleccionado.estado}
                </span>
              </div>
              <button
                onClick={() => setEventoSeleccionado(null)}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>
                  {new Date(eventoSeleccionado.fecha_inicio).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {eventoSeleccionado.barrio && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-600" />
                  <span>{eventoSeleccionado.barrio}</span>
                </div>
              )}

              {eventoSeleccionado.responsable && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span>{eventoSeleccionado.responsable}</span>
                </div>
              )}

              {eventoSeleccionado.recursos_solicitados && eventoSeleccionado.recursos_solicitados.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="font-semibold text-slate-900 mb-2">Recursos:</div>
                  <ul className="space-y-1 text-xs">
                    {eventoSeleccionado.recursos_solicitados.map((r, i) => (
                      <li key={i} className="text-slate-600">
                        • {r.item} {r.cantidad_solicitada && `(${r.cantidad_solicitada})`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              onClick={() => setEventoSeleccionado(null)}
              className="w-full mt-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
