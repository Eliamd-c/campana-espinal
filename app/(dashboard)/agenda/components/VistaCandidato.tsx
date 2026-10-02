'use client';

import { useEffect, useState } from 'react';
import { MapPin, Phone, Clock, Navigation, AlertCircle } from 'lucide-react';

interface Evento {
  id: string;
  titulo: string;
  fecha_inicio: string;
  barrio?: string;
  direccion?: string;
  responsable?: string;
  estado: string;
}

export function VistaCandidato() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [proximoEvento, setProximoEvento] = useState<Evento | null>(null);

  useEffect(() => {
    const cargar = async () => {
      try {
        const hoy = new Date();
        const desde = hoy.toISOString();
        const hasta = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const res = await fetch(
          `/api/agenda?desde=${desde}&hasta=${hasta}&estado=confirmado&limite=50`
        );
        const data = await res.json();
        const eventosList = (data.data || []).sort(
          (a: Evento, b: Evento) =>
            new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime()
        );

        setEventos(eventosList);

        // Encuentra el próximo evento
        const ahora = new Date();
        const proximo = eventosList.find(
          (e: Evento) => new Date(e.fecha_inicio) > ahora
        );
        setProximoEvento(proximo || null);
      } catch (err) {
        console.error('Error cargando eventos:', err);
      } finally {
        setLoading(false);
      }
    };

    cargar();
    const interval = setInterval(cargar, 5 * 60 * 1000); // Recargar cada 5 min
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-center">
          <div className="text-slate-600">Cargando agenda...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PRÓXIMO EVENTO - DESTACADO */}
      {proximoEvento ? (
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl shadow-lg p-8 text-white">
          <div className="text-sm font-semibold opacity-90 mb-2">PRÓXIMO</div>

          <div className="text-5xl font-black mb-6">
            {new Date(proximoEvento.fecha_inicio).toLocaleTimeString('es-CO', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>

          <div className="space-y-4 mb-8">
            <div>
              <div className="text-sm opacity-75">Evento</div>
              <div className="text-2xl font-bold">{proximoEvento.titulo}</div>
            </div>

            {proximoEvento.barrio && (
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5" />
                <div>
                  <div className="text-sm opacity-75">Barrio</div>
                  <div className="font-semibold">{proximoEvento.barrio}</div>
                </div>
              </div>
            )}

            {proximoEvento.direccion && (
              <div className="flex items-center gap-3">
                <Navigation className="w-5 h-5" />
                <div>
                  <div className="text-sm opacity-75">Dirección</div>
                  <div className="font-semibold">{proximoEvento.direccion}</div>
                </div>
              </div>
            )}

            {proximoEvento.responsable && (
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5" />
                <div>
                  <div className="text-sm opacity-75">Responsable</div>
                  <div className="font-semibold">{proximoEvento.responsable}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            {proximoEvento.barrio && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(
                  `${proximoEvento.barrio}${proximoEvento.direccion ? ', ' + proximoEvento.direccion : ''}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-white text-indigo-600 font-bold py-3 rounded-lg text-center hover:bg-slate-100 transition"
              >
                📍 Ver en Maps
              </a>
            )}
            {proximoEvento.responsable && (
              <a
                href={`tel:+57${proximoEvento.responsable.replace(/\D/g, '')}`}
                className="flex-1 bg-indigo-500 hover:bg-indigo-400 font-bold py-3 rounded-lg text-center transition"
              >
                📞 Llamar
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl p-8 text-center text-slate-600 border border-slate-200">
          <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <div className="text-lg font-semibold">No hay próximos eventos confirmados</div>
        </div>
      )}

      {/* LISTA DE SIGUIENTES EVENTOS */}
      {eventos.length > 1 && (
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Después...</h2>
          <div className="space-y-3">
            {eventos
              .filter((e) => e.id !== proximoEvento?.id)
              .slice(0, 5)
              .map((evento) => (
                <div
                  key={evento.id}
                  className="bg-white p-4 rounded-lg border border-slate-200 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900">{evento.titulo}</div>
                      <div className="text-sm text-slate-600 mt-1">
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
                        <div className="text-xs text-slate-500 mt-2">
                          📍 {evento.barrio}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* AVISO SI NO HAY EVENTOS */}
      {eventos.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-900">Sin eventos cercanos</div>
            <p className="text-sm text-amber-800 mt-1">
              Próximamente tendrás más eventos confirmados. Estamos organizando tu agenda.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
