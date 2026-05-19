"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { QrCode, Smartphone, Wifi, WifiOff, RefreshCcw, CheckCircle2, Terminal, Shield, Plus, Trash2, Lock } from "lucide-react";

export default function WhatsAppConfigPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [estado, setEstado] = useState("desconectado");
  const [qrUrl, setQrUrl] = useState("");
  const [cargando, setCargando] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);
  
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [nuevoNumero, setNuevoNumero] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && (session?.user as any)?.role !== "admin") {
      router.push("/");
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status !== "authenticated" || (session?.user as any)?.role !== "admin") return;

    let interval: NodeJS.Timeout;

    const fetchEstado = async () => {
      try {
        const res = await fetch("/api/whatsapp/estado");
        const json = await res.json();
        
        if (json.data) {
          setEstado(json.data.estado);
          if (json.data.logs) setLogs(json.data.logs);

          if (json.data.qr && json.data.estado === "qr_listo") {
            const url = await QRCode.toDataURL(json.data.qr, { width: 300, margin: 2, color: { dark: '#111827', light: '#ffffff' } });
            setQrUrl(url);
          }
        }
      } catch (error) {} finally { setCargando(false); }
    };

    const fetchWhitelist = async () => {
      try {
        const res = await fetch("/api/whatsapp/whitelist");
        const json = await res.json();
        if (json.data) setWhitelist(json.data);
      } catch (e) {}
    };

    fetchEstado();
    fetchWhitelist();
    interval = setInterval(fetchEstado, 2000);

    return () => clearInterval(interval);
  }, [status, session]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  const agregarNumero = async () => {
    if (!nuevoNumero) return;
    try {
      const res = await fetch("/api/whatsapp/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: nuevoNumero })
      });
      const json = await res.json();
      if (json.data) setWhitelist(json.data);
      setNuevoNumero("");
    } catch (e) {}
  };

  const eliminarNumero = async (numero: string) => {
    try {
      const res = await fetch(`/api/whatsapp/whitelist?numero=${numero}`, { method: "DELETE" });
      const json = await res.json();
      if (json.data) setWhitelist(json.data);
    } catch (e) {}
  };

  if (status === "loading" || (status === "authenticated" && (session?.user as any)?.role !== "admin")) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <RefreshCcw className="w-10 h-10 text-emerald-600 animate-spin" />
        <p className="text-gray-500 font-medium">Verificando acceso de administrador...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-1">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-900 to-emerald-600">
            Bot de WhatsApp
          </h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Conecta el motor de IA y gestiona los accesos.</p>
        </div>
        <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border border-emerald-100 self-start md:self-center">
          <Lock className="w-3.5 h-3.5" /> ACCESO RESTRINGIDO: SOLO ADMINISTRADORES
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Panel Izquierdo: Estado y QR (1 columna) */}
        <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 p-6 flex flex-col items-center justify-center min-h-[300px]">
          {cargando ? (
            <div className="flex flex-col items-center gap-3">
              <RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm font-semibold text-gray-500">Comprobando estado...</p>
            </div>
          ) : estado === "conectado" ? (
            <div className="flex flex-col items-center text-center animate-in zoom-in duration-300">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">¡Conectado!</h3>
              <p className="text-xs text-gray-500">El motor está escuchando mensajes.</p>
            </div>
          ) : estado === "qr_listo" && qrUrl ? (
            <div className="flex flex-col items-center animate-in fade-in duration-500">
              <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 mb-4">
                <img src={qrUrl} alt="WhatsApp QR Code" className="w-48 h-48 object-contain" />
              </div>
              <span className="text-xs font-bold text-amber-600">Escanea para vincular</span>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <WifiOff className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">Desconectado</h3>
              <p className="text-xs text-gray-500">Asegúrate de correr <code className="bg-gray-100 px-1 py-0.5 rounded text-pink-600">npm run bot</code></p>
            </div>
          )}
        </div>

        {/* Panel Central: Whitelist (1 columna) */}
        <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 p-6 flex flex-col">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-indigo-600" />
            Números Autorizados
          </h2>
          <p className="text-xs text-gray-500 mb-4">El bot SOLO responderá a estos números (código de país incluido, ej. 57318...):</p>
          
          <div className="flex gap-2 mb-4">
            <input 
              type="text" 
              value={nuevoNumero}
              onChange={(e) => setNuevoNumero(e.target.value)}
              placeholder="Ej. 573001234567" 
              className="flex-1 text-sm rounded-lg border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            />
            <button 
              onClick={agregarNumero}
              className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg transition-colors">
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {whitelist.map(num => (
              <div key={num} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                <span className="text-sm font-medium text-gray-700">+{num}</span>
                <button onClick={() => eliminarNumero(num)} className="text-red-400 hover:text-red-600 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {whitelist.length === 0 && <p className="text-xs text-gray-400 italic">No hay números autorizados.</p>}
          </div>
        </div>

        {/* Panel Derecho: Instrucciones (1 columna) */}
        <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 p-6">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
            <Smartphone className="w-5 h-5 text-emerald-600" />
            Vincular Dispositivo
          </h2>
          <ol className="space-y-3 text-xs text-gray-600">
            <li className="flex gap-2"><span className="font-bold text-emerald-700">1.</span> Abre WhatsApp.</li>
            <li className="flex gap-2"><span className="font-bold text-emerald-700">2.</span> Ve a Configuración &gt; Dispositivos vinculados.</li>
            <li className="flex gap-2"><span className="font-bold text-emerald-700">3.</span> Escanea el QR.</li>
          </ol>
          <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs text-blue-800 leading-relaxed">
              <strong>Recuerda:</strong> Solo los números en la "Lista Autorizada" podrán interactuar con el bot para agendar eventos.
            </p>
          </div>
        </div>

      </div>

      {/* Terminal de Logs */}
      <div className="bg-gray-900 rounded-2xl shadow-lg border border-gray-800 overflow-hidden flex flex-col">
        <div className="px-4 py-3 bg-gray-950 border-b border-gray-800 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">Terminal de Procesos IA</h3>
          <div className="ml-auto flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>
        </div>
        
        <div ref={terminalRef} className="p-4 h-[250px] overflow-y-auto font-mono text-xs sm:text-sm space-y-1 scroll-smooth">
          {logs.length === 0 ? (
            <p className="text-gray-500 italic">Esperando actividad...</p>
          ) : (
            logs.map((log, idx) => {
              let color = "text-gray-300";
              if (log.tipo === "info") color = "text-blue-400";
              if (log.tipo === "success") color = "text-emerald-400 font-bold";
              if (log.tipo === "error") color = "text-red-400";
              if (log.tipo === "ia") color = "text-purple-400";
              if (log.tipo === "audio") color = "text-amber-400";

              return (
                <div key={idx} className="flex gap-3 hover:bg-gray-800/50 px-2 py-1 rounded">
                  <span className="text-gray-600 flex-shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  <span className={`${color} break-all`}>{log.mensaje}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
