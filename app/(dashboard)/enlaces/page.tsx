"use client";

import { useEffect, useState } from "react";
import { Link2, Plus, Copy, Check, BarChart2, ExternalLink } from "lucide-react";

interface Enlace {
  codigo: string;
  url_original: string;
  fecha_creado: string;
  _count: {
    clics: number;
  };
}

export default function EnlacesPage() {
  const [enlaces, setEnlaces] = useState<Enlace[]>([]);
  const [cargando, setCargando] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [urlOriginal, setUrlOriginal] = useState("");
  const [codigoPersonalizado, setCodigoPersonalizado] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    cargarEnlaces();
  }, []);

  const cargarEnlaces = () => {
    setCargando(true);
    fetch("/api/enlaces")
      .then((res) => res.json())
      .then((data) => {
        setEnlaces(data.data || []);
      })
      .catch((error) => console.error("Error al cargar enlaces:", error))
      .finally(() => setCargando(false));
  };

  const handleCrearEnlace = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);

    try {
      const res = await fetch("/api/enlaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url_original: urlOriginal, codigo_personalizado: codigoPersonalizado }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setUrlOriginal("");
        setCodigoPersonalizado("");
        cargarEnlaces();
      } else {
        const error = await res.json();
        alert(error.error || "Error al crear el enlace");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error de conexión");
    } finally {
      setGuardando(false);
    }
  };

  const copiarAlPortapapeles = (codigo: string) => {
    const url = `${window.location.origin}/ir/${codigo}`;
    navigator.clipboard.writeText(url);
    setCopiado(codigo);
    setTimeout(() => setCopiado(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Link2 className="w-6 h-6 text-blue-600" />
            Acortador de Enlaces
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestiona enlaces y rastrea quién hace clic en ellos
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Nuevo Enlace
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {cargando ? (
          <div className="py-16 flex justify-center bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : enlaces.length === 0 ? (
          <div className="py-16 text-center text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <Link2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-600">No hay enlaces creados</p>
            <p className="text-sm mt-1">Crea tu primer enlace acortado para empezar a rastrear clics</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-sm">
                    <th className="p-4 font-semibold text-gray-600">Enlace Corto</th>
                    <th className="p-4 font-semibold text-gray-600">URL Original</th>
                    <th className="p-4 font-semibold text-gray-600 text-center">Clics</th>
                    <th className="p-4 font-semibold text-gray-600">Fecha</th>
                    <th className="p-4 font-semibold text-gray-600 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {enlaces.map((enlace) => (
                    <tr key={enlace.codigo} className="hover:bg-gray-50/50 transition">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                            /ir/{enlace.codigo}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 max-w-xs sm:max-w-md">
                          <p className="text-sm text-gray-600 truncate" title={enlace.url_original}>
                            {enlace.url_original}
                          </p>
                          <a href={enlace.url_original} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-blue-600">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-1">
                          <BarChart2 className="w-4 h-4 text-emerald-500" />
                          <span className="font-bold text-gray-800">{enlace._count.clics}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-gray-500">
                          {new Date(enlace.fecha_creado).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => copiarAlPortapapeles(enlace.codigo)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Copiar enlace"
                        >
                          {copiado === enlace.codigo ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-800">Crear Enlace Corto</h2>
              <p className="text-sm text-gray-500 mt-1">Acorta un enlace para compartir y rastrear clics</p>
            </div>
            
            <form onSubmit={handleCrearEnlace} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">URL Original</label>
                <input
                  type="url"
                  required
                  value={urlOriginal}
                  onChange={(e) => setUrlOriginal(e.target.value)}
                  placeholder="https://facebook.com/video/..."
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Código Personalizado (Opcional)</label>
                <div className="flex items-center">
                  <span className="bg-gray-50 border border-gray-200 border-r-0 rounded-l-lg p-2.5 text-sm text-gray-500 font-mono">
                    /ir/
                  </span>
                  <input
                    type="text"
                    value={codigoPersonalizado}
                    onChange={(e) => setCodigoPersonalizado(e.target.value)}
                    placeholder="ej: video1"
                    maxLength={10}
                    className="w-full border border-gray-200 rounded-r-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>
                <p className="text-xs text-gray-500">Dejar en blanco para generar automáticamente</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {guardando ? "Creando..." : "Crear Enlace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
