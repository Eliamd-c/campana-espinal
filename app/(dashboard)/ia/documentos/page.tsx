"use client";

import { useState, useEffect } from "react";
import { FileText, Upload, Trash2, Sparkles, BookOpen, Tag, Plus, X, Loader2 } from "lucide-react";

interface Documento { id: number; titulo: string; categoria: string; fecha_creado: string; }

const CATEGORIAS = ["plan_gobierno", "estrategia", "propuesta", "discurso", "estadistica", "general"];

export default function DocumentosPage() {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [cargando, setCargando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [categoria, setCategoria] = useState("general");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => { cargarDocumentos(); }, []);

  const cargarDocumentos = async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/ia/documentos");
      const j = await r.json();
      setDocumentos(j.data || []);
    } catch { } finally { setCargando(false); }
  };

  const subirDocumento = async () => {
    if (!titulo.trim() || !contenido.trim()) return;
    setSubiendo(true);
    setMensaje(null);
    try {
      const r = await fetch("/api/ia/documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, contenido, categoria })
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setMensaje({ tipo: "ok", texto: j.message });
      setTitulo(""); setContenido(""); setCategoria("general");
      setMostrarForm(false);
      cargarDocumentos();
    } catch (e: any) {
      setMensaje({ tipo: "error", texto: e.message });
    } finally { setSubiendo(false); }
  };

  const eliminarDocumento = async (id: number) => {
    if (!confirm("¿Eliminar este documento de la base de conocimiento?")) return;
    await fetch("/api/ia/documentos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    cargarDocumentos();
  };

  const categoriaColor: Record<string, string> = {
    plan_gobierno: "bg-blue-100 text-blue-700",
    estrategia: "bg-purple-100 text-purple-700",
    propuesta: "bg-emerald-100 text-emerald-700",
    discurso: "bg-amber-100 text-amber-700",
    estadistica: "bg-rose-100 text-rose-700",
    general: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-indigo-600" />
          Base de Conocimiento
        </h1>
        <p className="text-gray-500 mt-1">
          Sube documentos para que la IA los entienda semánticamente. El Agente los consultará automáticamente cuando sean relevantes.
        </p>
      </div>

      {/* Banner explicativo */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-indigo-800">¿Cómo funciona?</p>
          <p className="text-sm text-indigo-700 mt-1">
            Cada documento es convertido en vectores matemáticos. Cuando le preguntas algo al Analista, busca automáticamente los fragmentos más relevantes antes de responder. Es como darle memoria fotográfica de tus documentos.
          </p>
        </div>
      </div>

      {/* Botón añadir */}
      {!mostrarForm && (
        <button onClick={() => setMostrarForm(true)}
          className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition">
          <Plus className="w-4 h-4" /> Añadir Documento
        </button>
      )}

      {/* Formulario de subida */}
      {mostrarForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><Upload className="w-4 h-4" />Nuevo Documento</h3>
            <button onClick={() => setMostrarForm(false)}><X className="w-4 h-4 text-gray-400 hover:text-red-500" /></button>
          </div>

          <input type="text" placeholder="Título del documento (ej: Plan de Gobierno 2024-2027)"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            value={titulo} onChange={e => setTitulo(e.target.value)} />

          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-gray-400" />
            <select className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              value={categoria} onChange={e => setCategoria(e.target.value)}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace("_", " ").toUpperCase()}</option>)}
            </select>
          </div>

          <textarea
            placeholder="Pega aquí el contenido del documento. Puede ser el plan de gobierno completo, una propuesta, un discurso, etc."
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            rows={8} value={contenido} onChange={e => setContenido(e.target.value)} />

          {mensaje && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium ${mensaje.tipo === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {mensaje.texto}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={subirDocumento} disabled={!titulo || !contenido || subiendo}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition disabled:opacity-50">
              {subiendo ? <><Loader2 className="w-4 h-4 animate-spin" />Vectorizando...</> : <><Sparkles className="w-4 h-4" />Vectorizar y Guardar</>}
            </button>
            <button onClick={() => setMostrarForm(false)} className="px-4 py-3 text-gray-500 hover:text-gray-700 text-sm transition">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista de documentos */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">
            Documentos Vectorizados ({documentos.length})
          </h3>
          <button onClick={cargarDocumentos} className="text-xs text-indigo-600 hover:underline">Actualizar</button>
        </div>

        {cargando ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          </div>
        ) : documentos.length === 0 ? (
          <div className="text-center py-12 text-gray-400 space-y-2">
            <FileText className="w-10 h-10 mx-auto text-gray-200" />
            <p className="text-sm">Aún no hay documentos. Añade el Plan de Gobierno para empezar.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {documentos.map(doc => (
              <div key={doc.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{doc.titulo}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(doc.fecha_creado).toLocaleDateString("es-CO")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${categoriaColor[doc.categoria] || categoriaColor.general}`}>
                    {doc.categoria.replace("_", " ")}
                  </span>
                  <button onClick={() => eliminarDocumento(doc.id)}
                    className="text-gray-300 hover:text-red-500 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
