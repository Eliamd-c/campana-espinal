"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Smartphone, QrCode, AlertCircle,
  RefreshCw, CheckCircle2, WifiOff, Wifi, Loader2
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface Linea {
  id: number;
  nombre: string;
  numero_telefono: string | null;
  estado: string;
  qr_actual: string | null;
  mensajes_enviados_hoy: number;
  limite_diario: number;
  proxyUrl?: string;
}

export default function LineasPage() {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [nuevaLineaNombre, setNuevaLineaNombre] = useState("");
  const [reconectando, setReconectando] = useState<Record<number, boolean>>({});

  const cargarLineas = useCallback(async () => {
    try {
      const res = await fetch("/api/lineas");
      const json = await res.json();
      if (json.success) setLineas(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarLineas();
    const interval = setInterval(cargarLineas, 5000);
    return () => clearInterval(interval);
  }, [cargarLineas]);

  const reconectar = async (lineaId: number) => {
    setReconectando(prev => ({ ...prev, [lineaId]: true }));
    try {
      // Forzar sincronización haciendo GET con parámetro de reconexión
      await fetch(`/api/lineas/${lineaId}/reconectar`, { method: "POST" });
      await cargarLineas();
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => {
        setReconectando(prev => ({ ...prev, [lineaId]: false }));
      }, 2000);
    }
  };

  const crearLinea = async () => {
    if (!nuevaLineaNombre) return;
    setCreando(true);
    await fetch("/api/lineas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nuevaLineaNombre })
    });
    setNuevaLineaNombre("");
    setCreando(false);
    cargarLineas();
  };

  const conectadas = lineas.filter(l => l.estado === "conectado").length;
  const desconectadas = lineas.filter(l => l.estado !== "conectado").length;

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-gray-500">
      <Loader2 className="animate-spin" size={20} /> Cargando líneas...
    </div>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Líneas de WhatsApp</h1>
          <p className="text-gray-500 mt-1">
            <span className="text-green-600 font-semibold">{conectadas}</span> conectadas &nbsp;·&nbsp;
            <span className={desconectadas > 0 ? "text-red-500 font-semibold" : "text-gray-400"}>{desconectadas}</span> desconectadas
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nombre de la línea"
            className="border p-2 rounded-md text-sm"
            value={nuevaLineaNombre}
            onChange={(e) => setNuevaLineaNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crearLinea()}
          />
          <button
            onClick={crearLinea}
            disabled={creando || !nuevaLineaNombre}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center gap-2 disabled:opacity-50 text-sm"
          >
            <Plus size={16} /> Añadir
          </button>
        </div>
      </div>

      {/* Alerta si hay líneas caídas */}
      {desconectadas > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">
              {desconectadas} línea{desconectadas > 1 ? "s" : ""} necesita{desconectadas === 1 ? "" : "n"} reconexión
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              Haz clic en <strong>"Generar QR"</strong> en cada línea caída, luego abre LDPlayer con ese número,
              ve a <strong>WhatsApp → Ajustes → Dispositivos vinculados → Vincular dispositivo</strong> y escanea el código.
              Una vez vinculado, cierra completamente LDPlayer.
            </p>
          </div>
        </div>
      )}

      {/* Grid de líneas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {lineas.map(linea => {
          const estaConectada = linea.estado === "conectado";
          const tieneQR = linea.estado === "qr_listo" && linea.qr_actual;
          const estaReconectando = reconectando[linea.id];

          return (
            <div
              key={linea.id}
              className={`rounded-xl border shadow-sm p-6 flex flex-col transition-all ${
                estaConectada
                  ? "bg-white border-gray-200"
                  : tieneQR
                    ? "bg-yellow-50 border-yellow-300"
                    : "bg-red-50 border-red-200"
              }`}
            >
              {/* Cabecera de la tarjeta */}
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-full ${
                    estaConectada ? "bg-green-100 text-green-600" :
                    tieneQR ? "bg-yellow-100 text-yellow-600" :
                    "bg-red-100 text-red-600"
                  }`}>
                    {estaConectada ? <Wifi size={20} /> : tieneQR ? <QrCode size={20} /> : <WifiOff size={20} />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">{linea.nombre}</h3>
                    <p className="text-xs text-gray-500">{linea.numero_telefono || "Sin número"}</p>
                  </div>
                </div>
                {/* Badge de estado */}
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  estaConectada ? "bg-green-100 text-green-700" :
                  tieneQR ? "bg-yellow-100 text-yellow-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {estaConectada ? "✓ Activa" : tieneQR ? "⚡ QR listo" : "✗ Caída"}
                </span>
              </div>

              {/* Estadísticas */}
              <div className="space-y-2 flex-1 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Enviados hoy</span>
                  <span className="font-medium">
                    {linea.mensajes_enviados_hoy} / {linea.limite_diario}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      linea.mensajes_enviados_hoy >= linea.limite_diario ? "bg-red-500" : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(100, (linea.mensajes_enviados_hoy / (linea.limite_diario || 1)) * 100)}%` }}
                  />
                </div>

                {/* Proxy */}
                <div className="pt-2 border-t">
                  <label className="text-xs text-gray-400 font-medium">Proxy</label>
                  <input
                    type="text"
                    placeholder="socks5://... (opcional)"
                    defaultValue={linea.proxyUrl || ""}
                    onBlur={(e) => {
                      if (e.target.value !== (linea.proxyUrl || "")) {
                        fetch("/api/lineas", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: linea.id, proxyUrl: e.target.value })
                        }).then(() => cargarLineas());
                      }
                    }}
                    className="w-full border p-1.5 rounded text-xs mt-1 bg-white"
                  />
                </div>
              </div>

              {/* QR Code */}
              {tieneQR && (
                <div className="mb-4 p-3 bg-white rounded-lg flex flex-col items-center border border-yellow-200">
                  <p className="text-xs text-yellow-700 font-semibold mb-2 text-center">
                    📱 Escanea desde WhatsApp → Dispositivos vinculados
                  </p>
                  <div className="bg-white p-2 rounded shadow-sm border">
                    <QRCodeSVG value={linea.qr_actual!} size={160} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2 text-center">
                    El QR expira en ~60 segundos. Si no funciona, vuelve a generar.
                  </p>
                </div>
              )}

              {/* Botón de reconexión (solo para líneas caídas) */}
              {!estaConectada && (
                <button
                  onClick={() => reconectar(linea.id)}
                  disabled={estaReconectando}
                  className={`w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                    tieneQR
                      ? "bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  } disabled:opacity-60`}
                >
                  {estaReconectando ? (
                    <><Loader2 size={15} className="animate-spin" /> Generando QR...</>
                  ) : tieneQR ? (
                    <><RefreshCw size={15} /> Regenerar QR</>
                  ) : (
                    <><QrCode size={15} /> Generar QR para reconectar</>
                  )}
                </button>
              )}

              {estaConectada && (
                <div className="flex items-center justify-center gap-1.5 text-green-600 text-sm pt-1">
                  <CheckCircle2 size={15} />
                  <span>Enviando correctamente</span>
                </div>
              )}
            </div>
          );
        })}

        {lineas.length === 0 && (
          <div className="col-span-full text-center py-16 text-gray-400 bg-gray-50 rounded-xl border border-dashed">
            <Smartphone size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay líneas configuradas. Añade una para empezar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
