"use client";

import { useEffect, useState } from "react";
import { Plus, Smartphone, QrCode, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface Linea {
  id: number;
  nombre: string;
  numero_telefono: string | null;
  estado: string;
  qr_actual: string | null;
  mensajes_enviados_hoy: number;
  limite_diario: number;
}

export default function LineasPage() {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [nuevaLineaNombre, setNuevaLineaNombre] = useState("");

  const cargarLineas = async () => {
    try {
      const res = await fetch("/api/lineas");
      const json = await res.json();
      if (json.success) setLineas(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarLineas();
    const interval = setInterval(cargarLineas, 5000); // Polling cada 5 seg para ver cambios de estado/QR
    return () => clearInterval(interval);
  }, []);

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

  if (loading) return <div className="p-8">Cargando líneas...</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Líneas de WhatsApp</h1>
          <p className="text-gray-500 mt-2">Gestiona las conexiones activas para envíos masivos</p>
        </div>
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Nombre de la línea" 
            className="border p-2 rounded-md"
            value={nuevaLineaNombre}
            onChange={(e) => setNuevaLineaNombre(e.target.value)}
          />
          <button 
            onClick={crearLinea} 
            disabled={creando || !nuevaLineaNombre}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
          >
            <Plus size={18} /> Añadir Línea
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {lineas.map(linea => (
          <div key={linea.id} className="bg-white rounded-xl border shadow-sm p-6 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-full ${
                  linea.estado === 'conectado' ? 'bg-green-100 text-green-600' : 
                  linea.estado === 'desconectado' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'
                }`}>
                  <Smartphone size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{linea.nombre}</h3>
                  <p className="text-sm text-gray-500">{linea.numero_telefono || "Sin número registrado"}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 flex-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Estado</span>
                <span className="font-medium flex items-center gap-1">
                  {linea.estado === 'conectado' && <><CheckCircle2 size={16} className="text-green-500"/> Conectado</>}
                  {linea.estado === 'desconectado' && <><AlertCircle size={16} className="text-red-500"/> Desconectado</>}
                  {linea.estado === 'qr_listo' && <><QrCode size={16} className="text-yellow-500"/> QR Pendiente</>}
                  {!['conectado', 'desconectado', 'qr_listo'].includes(linea.estado) && <><RefreshCw size={16} className="animate-spin text-blue-500"/> {linea.estado}</>}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Enviados hoy</span>
                <span className="font-medium">{linea.mensajes_enviados_hoy} / {linea.limite_diario}</span>
              </div>
            </div>

            {linea.estado === 'qr_listo' && linea.qr_actual && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg flex flex-col items-center border">
                <p className="text-xs text-gray-500 mb-2 font-medium">Escanea este QR con WhatsApp</p>
                <div className="bg-white p-2 rounded shadow-sm">
                  <QRCodeSVG value={linea.qr_actual} size={150} />
                </div>
              </div>
            )}
          </div>
        ))}

        {lineas.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed">
            No tienes ninguna línea configurada. Añade una para empezar.
          </div>
        )}
      </div>
    </div>
  );
}
