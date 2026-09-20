'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Power, Unlink, Smartphone } from 'lucide-react';

/**
 * Líneas de WhatsApp.
 *
 * La pantalla desde la que se vincula un número escaneando su código QR y
 * desde la que se ve, sin adornos, si la línea está viva. Eso segundo importa
 * tanto como lo primero: mientras esto corra en alojamiento compartido la
 * aplicación se duerme sola, y quien escriba a una línea caída no recibirá
 * respuesta hasta que despierte. Es mejor verlo aquí que deducirlo del
 * silencio.
 */

interface Linea {
  id: number;
  nombre: string | null;
  numero_telefono: string | null;
  estado: string | null;
  qr_actual: string | null;
  ultima_conexion: string | null;
  viva: boolean;
  detalle: string | null;
  requiere_qr: boolean;
  intentos_fallidos: number;
}

const ASPECTO: Record<string, { texto: string; clase: string }> = {
  conectado: { texto: 'Conectada', clase: 'bg-green-100 text-green-800' },
  conectando: { texto: 'Conectando…', clase: 'bg-blue-100 text-blue-800' },
  qr_listo: { texto: 'Esperando escaneo', clase: 'bg-amber-100 text-amber-800' },
  desconectado: { texto: 'Desconectada', clase: 'bg-gray-200 text-gray-700' },
  baneado: { texto: 'Bloqueada por WhatsApp', clase: 'bg-red-100 text-red-800' },
};

export default function LineasPage() {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/lineas');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo leer el estado');
      setLineas(json.data);
    } catch (error) {
      setAviso({ tipo: 'error', texto: String((error as Error).message) });
    } finally {
      setCargando(false);
    }
  }, []);

  /**
   * Se refresca solo cada tres segundos. El código QR de WhatsApp caduca en
   * menos de un minuto y se regenera varias veces mientras la pantalla está
   * abierta: sin esta consulta periódica, quien la mira estaría escaneando un
   * código muerto sin saberlo.
   */
  useEffect(() => {
    cargar();
    const reloj = setInterval(cargar, 3000);
    return () => clearInterval(reloj);
  }, [cargar]);

  async function crearLinea() {
    if (nombreNuevo.trim().length < 2) {
      setAviso({ tipo: 'error', texto: 'Ponle un nombre a la línea.' });
      return;
    }
    setCreando(true);
    try {
      const res = await fetch('/api/whatsapp/lineas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombreNuevo.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo crear');
      setNombreNuevo('');
      setAviso({ tipo: 'ok', texto: 'Línea creada. Pulsa «Conectar» para escanear el código.' });
      cargar();
    } catch (error) {
      setAviso({ tipo: 'error', texto: String((error as Error).message) });
    } finally {
      setCreando(false);
    }
  }

  async function accionar(id: number, accion: 'conectar' | 'cerrar' | 'desvincular') {
    if (accion === 'desvincular') {
      const seguro = window.confirm(
        'Desvincular cierra la sesión en el teléfono y borra las credenciales. ' +
          'Para volver a usar la línea habrá que escanear un código QR nuevo. ¿Seguir?'
      );
      if (!seguro) return;
    }

    try {
      const res = await fetch(`/api/whatsapp/lineas/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo completar');
      cargar();
    } catch (error) {
      setAviso({ tipo: 'error', texto: String((error as Error).message) });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Líneas de WhatsApp</h1>
        <p className="text-sm text-gray-600 mt-1">
          Cada línea es un número con su propia sesión. Vincula el teléfono escaneando el
          código desde WhatsApp → Dispositivos vinculados.
        </p>
      </div>

      {aviso && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            aviso.tipo === 'ok'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {aviso.texto}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-3">
        <input
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          placeholder="Nombre de la línea (por ejemplo: Agenda)"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={crearLinea}
          disabled={creando}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus size={16} /> Crear línea
        </button>
      </div>

      {cargando ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : lineas.length === 0 ? (
        <p className="text-sm text-gray-500">
          Todavía no hay líneas. Crea la primera, llámala «Agenda».
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lineas.map((linea) => {
            const aspecto = ASPECTO[linea.estado ?? 'desconectado'] ?? ASPECTO.desconectado;

            /**
             * Una línea puede figurar como conectada en la base y no tener
             * socket vivo, porque la aplicación se reinició sin poder anotar
             * la caída. Se avisa en vez de dejar un estado que miente.
             */
            const desfasada = linea.estado === 'conectado' && !linea.viva;

            return (
              <div key={linea.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Smartphone size={16} className="text-gray-400" />
                      {linea.nombre || `Línea ${linea.id}`}
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {linea.numero_telefono ? `+${linea.numero_telefono}` : 'Sin vincular'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${aspecto.clase}`}>
                    {aspecto.texto}
                  </span>
                </div>

                {desfasada && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                    La aplicación se reinició y el socket no está abierto. Pulsa «Conectar»
                    o espera al siguiente latido.
                  </p>
                )}

                {linea.detalle && (
                  <p className="text-xs text-gray-600">{linea.detalle}</p>
                )}

                {linea.estado === 'qr_listo' && linea.qr_actual && (
                  <div className="flex flex-col items-center gap-2 py-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={linea.qr_actual}
                      alt="Código QR para vincular la línea"
                      className="w-56 h-56 rounded-lg border border-gray-200"
                    />
                    <p className="text-xs text-gray-500 text-center">
                      WhatsApp → Ajustes → Dispositivos vinculados → Vincular dispositivo.
                      El código caduca en menos de un minuto y se renueva solo.
                    </p>
                  </div>
                )}

                {linea.ultima_conexion && (
                  <p className="text-xs text-gray-400">
                    Última conexión: {new Date(linea.ultima_conexion).toLocaleString('es-CO')}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => accionar(linea.id, 'conectar')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    <RefreshCw size={14} /> Conectar
                  </button>
                  <button
                    onClick={() => accionar(linea.id, 'cerrar')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700"
                  >
                    <Power size={14} /> Cerrar
                  </button>
                  <button
                    onClick={() => accionar(linea.id, 'desvincular')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700"
                  >
                    <Unlink size={14} /> Desvincular
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
