'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Power, Unlink, Smartphone, X, ShieldCheck } from 'lucide-react';

/** Debe coincidir con el catálogo de lib/whatsapp/autorizados.ts. */
const AGENTES = [
  { valor: 'agenda', etiqueta: 'Agenda' },
  { valor: 'datos', etiqueta: 'Consultas a la base' },
];

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
  agente: string | null;
  estado: string | null;
  qr_actual: string | null;
  ultima_conexion: string | null;
  autorizados: number;
  viva: boolean;
  detalle: string | null;
  requiere_qr: boolean;
  intentos_fallidos: number;
}

interface Autorizado {
  id: number;
  numero: string;
  nombre: string | null;
  activo: boolean;
  usuario: { username: string | null; activo: boolean } | null;
}

interface Cuenta {
  id: string;
  username: string | null;
  name: string | null;
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

  async function cambiarAgente(id: number, agente: string) {
    try {
      const res = await fetch(`/api/whatsapp/lineas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agente: agente || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar');
      cargar();
    } catch (error) {
      setAviso({ tipo: 'error', texto: String((error as Error).message) });
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

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Agente que atiende
                  </label>
                  <select
                    value={linea.agente ?? ''}
                    onChange={(e) => cambiarAgente(linea.id, e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Ninguno — no responde a nadie</option>
                    {AGENTES.map((a) => (
                      <option key={a.valor} value={a.valor}>
                        {a.etiqueta}
                      </option>
                    ))}
                  </select>
                  {!linea.agente && (
                    <p className="text-xs text-gray-500 mt-1">
                      La línea está conectada pero calla. Asígnale un agente para que
                      empiece a responder.
                    </p>
                  )}
                </div>

                <BloqueAutorizados lineaId={linea.id} alCambiar={cargar} />

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

/**
 * Los números que pueden hablarle a esta línea.
 *
 * Carga bajo demanda y no con el resto de la pantalla, que se refresca cada
 * tres segundos por el QR: no tiene sentido volver a pedir la lista cada vez.
 * Se recarga sola cuando se agrega o se quita alguien.
 */
function BloqueAutorizados({
  lineaId,
  alCambiar,
}: {
  lineaId: number;
  alCambiar: () => void;
}) {
  const [autorizados, setAutorizados] = useState<Autorizado[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [numero, setNumero] = useState('');
  const [nombre, setNombre] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/lineas/${lineaId}/autorizados`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo leer la lista');
      setAutorizados(json.data.autorizados);
      setCuentas(json.data.cuentas);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }, [lineaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function agregar() {
    setError(null);
    setGuardando(true);
    try {
      const res = await fetch(`/api/whatsapp/lineas/${lineaId}/autorizados`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero, nombre, usuario_id: cuentaId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo autorizar');
      setNumero('');
      setNombre('');
      setCuentaId('');
      cargar();
      alCambiar();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(id: number, num: string) {
    if (!window.confirm(`Quitar el ${num}? Dejara de recibir respuesta de esta linea.`)) return;
    try {
      const res = await fetch(
        `/api/whatsapp/lineas/${lineaId}/autorizados?autorizado_id=${id}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo quitar');
      cargar();
      alCambiar();
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  return (
    <div className="border-t border-gray-100 pt-3 space-y-2">
      <p className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
        <ShieldCheck size={14} className="text-gray-400" />
        Numeros autorizados
      </p>

      {autorizados.length === 0 ? (
        <p className="text-xs text-gray-500">
          Nadie autorizado todavia. La linea ignora en silencio todo lo que le llegue.
        </p>
      ) : (
        <ul className="space-y-1">
          {autorizados.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded-lg px-2.5 py-1.5"
            >
              <span className="min-w-0">
                <span className="font-medium text-gray-800">+{a.numero}</span>
                {a.nombre && <span className="text-gray-500"> — {a.nombre}</span>}
                <span className="text-gray-400 block">
                  responde como {a.usuario?.username ?? 'cuenta no disponible'}
                  {a.usuario && !a.usuario.activo && ' (cuenta desactivada)'}
                </span>
              </span>
              <button
                onClick={() => quitar(a.id, a.numero)}
                className="text-gray-400 hover:text-red-600 shrink-0"
                aria-label="Quitar"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="573133288298"
          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs"
        />
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre (opcional)"
          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs"
        />
        <select
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs"
        >
          <option value="">Responde como…</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.username || c.name || c.id}
            </option>
          ))}
        </select>
        <button
          onClick={agregar}
          disabled={guardando || !numero || !cuentaId}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Autorizar
        </button>
      </div>

      <p className="text-xs text-gray-400">
        El agente responde con los permisos de la cuenta elegida, igual que si esa
        persona entrara al panel.
      </p>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
