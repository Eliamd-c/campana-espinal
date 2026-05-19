"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Contacto {
  cedula: string;
  nombre: string | null;
  telefono: string | null;
  barrio: string | null;
  municipio: string | null;
  es_nuevo: boolean | null;
  fecha_registro: string | null;
  fecha_ultimo_contacto: string | null;
  problematica: string | null;
  categoria_problematica: string | null;
  puesto_votacion: string | null;
  direccion_puesto: string | null;
  mesa_numero: string | null;
  notas: string | null;
  intencion_voto: string | null;
  ultima_encuesta: string | null;
  lider: { id: number; nombre: string | null; barrio: string | null } | null;
  mensajes: {
    id: number;
    texto: string | null;
    direccion: string | null;
    estado: string | null;
    fecha: string | null;
  }[];
}

export default function PerfilContactoPage() {
  const params = useParams();
  const router = useRouter();
  const cedula = params.cedula as string;

  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [editandoNotas, setEditandoNotas] = useState(false);
  const [notas, setNotas] = useState("");

  useEffect(() => {
    fetch(`/api/contactos/${cedula}`)
      .then((r) => {
        if (!r.ok) throw new Error("No encontrado");
        return r.json();
      })
      .then((json) => {
        setContacto(json.data);
        setNotas(json.data.notas || "");
      })
      .catch(() => setError("No se encontró el contacto"))
      .finally(() => setCargando(false));
  }, [cedula]);

  const guardarNotas = async () => {
    await fetch(`/api/contactos/${cedula}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notas }),
    });
    setContacto((prev) => prev ? { ...prev, notas } : prev);
    setEditandoNotas(false);
  };

  if (cargando) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !contacto) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">🔍</p>
        <p className="font-medium">{error || "Contacto no encontrado"}</p>
        <button onClick={() => router.back()} className="mt-4 text-blue-600 hover:underline text-sm">
          ← Volver
        </button>
      </div>
    );
  }

  const fecha = (str: string | null) =>
    str ? new Date(str).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/contactos" className="hover:text-blue-600">Contactos</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{contacto.nombre || contacto.cedula}</span>
      </div>

      {/* Encabezado */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl">
              👤
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{contacto.nombre || "Sin nombre"}</h1>
              <p className="font-mono text-gray-500">{contacto.cedula}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {contacto.es_nuevo ? (
              <span className="bg-green-100 text-green-700 text-sm font-medium px-3 py-1 rounded-full">✨ Nuevo</span>
            ) : (
              <span className="bg-gray-100 text-gray-500 text-sm font-medium px-3 py-1 rounded-full">Repetido</span>
            )}
            {contacto.categoria_problematica && (
              <span className="bg-purple-100 text-purple-700 text-sm font-medium px-3 py-1 rounded-full capitalize">
                {contacto.categoria_problematica}
              </span>
            )}
            <VotoSemaforo intencion={contacto.intencion_voto} />
            {contacto.telefono && (
              <Link 
                href={`/mensajes?tab=campana&cedula=${contacto.cedula}&telefono=${contacto.telefono.replace(/\D/g, '')}`} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-1.5 rounded-full flex items-center gap-2 transition shadow-sm ml-2"
              >
                <span className="text-lg">💬</span> Enviar Mensaje
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Datos personales */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-gray-700 border-b border-gray-100 pb-2">Datos personales</h2>
          <InfoFila label="Teléfono" valor={contacto.telefono} icon="📱" />
          <InfoFila label="Barrio" valor={contacto.barrio} icon="🏘️" />
          <InfoFila label="Municipio" valor={contacto.municipio} icon="🏙️" />
          <InfoFila label="Líder" valor={contacto.lider?.nombre} icon="⭐" />
          <InfoFila label="Primer registro" valor={fecha(contacto.fecha_registro)} icon="📅" />
          <InfoFila label="Último contacto" valor={fecha(contacto.fecha_ultimo_contacto)} icon="🕐" />
        </div>

        {/* Puesto de votación */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-gray-700 border-b border-gray-100 pb-2">Puesto de votación</h2>
          <InfoFila label="Puesto" valor={contacto.puesto_votacion} icon="🗳️" />
          <InfoFila label="Dirección" valor={contacto.direccion_puesto} icon="📍" />
          <InfoFila label="Mesa" valor={contacto.mesa_numero} icon="🔢" />
        </div>
      </div>

      {/* Problemática */}
      {contacto.problematica && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-700 border-b border-gray-100 pb-2 mb-3">Problemática</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{contacto.problematica}</p>
        </div>
      )}

      {/* Notas */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
          <h2 className="font-semibold text-gray-700">Notas</h2>
          {!editandoNotas ? (
            <button
              onClick={() => setEditandoNotas(true)}
              className="text-xs text-blue-600 hover:underline"
            >
              ✏️ Editar
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={guardarNotas} className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700">
                Guardar
              </button>
              <button onClick={() => setEditandoNotas(false)} className="text-xs text-gray-500 hover:text-gray-700">
                Cancelar
              </button>
            </div>
          )}
        </div>
        {editandoNotas ? (
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            placeholder="Escribe notas sobre este contacto..."
          />
        ) : (
          <p className="text-gray-600 text-sm leading-relaxed">
            {contacto.notas || <span className="text-gray-300 italic">Sin notas</span>}
          </p>
        )}
      </div>

      {/* Mensajes */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-700 border-b border-gray-100 pb-2 mb-4">
          Mensajes ({contacto.mensajes.length})
        </h2>
        {contacto.mensajes.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Sin mensajes registrados</p>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {contacto.mensajes.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.direccion === "enviado" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
                    m.direccion === "enviado"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  <p>{m.texto}</p>
                  <p className={`text-xs mt-1 ${m.direccion === "enviado" ? "text-blue-200" : "text-gray-400"}`}>
                    {fecha(m.fecha)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoFila({ label, valor, icon }: { label: string; valor: string | null | undefined; icon: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-800 font-medium">{valor || <span className="text-gray-300 font-normal">—</span>}</p>
      </div>
    </div>
  );
}

function VotoSemaforo({ intencion }: { intencion: string | null }) {
  if (!intencion || intencion === "desconocido") {
    return (
      <span className="bg-gray-100 text-gray-500 text-xs font-medium px-3 py-1 rounded-full border border-gray-200">
        ⬜ Sin perfil de voto
      </span>
    );
  }

  const config = {
    positivo: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200", icon: "🟢", label: "Positivo" },
    negativo: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200", icon: "🔴", label: "Negativo" },
    indeciso: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200", icon: "🟡", label: "Indeciso" },
  };

  const c = config[intencion as keyof typeof config];
  if (!c) return null;

  return (
    <span className={`${c.bg} ${c.text} text-xs font-bold px-3 py-1 rounded-full border ${c.border}`}>
      {c.icon} Intención: {c.label}
    </span>
  );
}
