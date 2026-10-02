'use client';

import { AlertTriangle, Users, TrendingDown, Zap, X } from 'lucide-react';

interface Impacto {
  tipo: string;
  descripcion: string;
  cantidad?: number;
  detalles?: string[];
}

interface ImpactoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  titulo: string;
  accion: 'cancelar' | 'mover' | 'rechazar';
  impactos: Impacto[];
  cargando?: boolean;
}

const ICONOS: Record<string, any> = {
  contactos: Users,
  logistica: TrendingDown,
  sugerencia: Zap,
};

export function ImpactoModal({
  isOpen,
  onClose,
  onConfirm,
  titulo,
  accion,
  impactos,
  cargando = false,
}: ImpactoModalProps) {
  if (!isOpen) return null;

  const textoAccion: Record<string, string> = {
    cancelar: 'CANCELAR',
    mover: 'MOVER',
    rechazar: 'RECHAZAR',
  };

  const colorAccion: Record<string, string> = {
    cancelar: 'bg-red-600 hover:bg-red-700',
    mover: 'bg-amber-600 hover:bg-amber-700',
    rechazar: 'bg-slate-600 hover:bg-slate-700',
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-red-50 to-orange-50 p-6 border-b border-slate-200 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                ⚠️ IMPACTO DE {textoAccion[accion]}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Revisá qué se verá afectado antes de confirmar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl flex-shrink-0"
          >
            ×
          </button>
        </div>

        {/* CONTENIDO */}
        <div className="p-6 space-y-6">
          {/* TÍTULO DE LA REUNIÓN */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div className="text-sm text-slate-600 font-medium">Reunión a {textoAccion[accion].toLowerCase()}:</div>
            <div className="text-lg font-bold text-slate-900 mt-1">{titulo}</div>
          </div>

          {/* IMPACTOS */}
          {impactos.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Sin impactos identificados
            </div>
          ) : (
            <div className="space-y-4">
              {impactos.map((impacto, idx) => {
                const Icono = ICONOS[impacto.tipo] || AlertTriangle;

                return (
                  <div
                    key={idx}
                    className="border border-orange-200 bg-orange-50 rounded-lg p-4"
                  >
                    <div className="flex items-start gap-3">
                      <Icono className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between">
                          <div className="font-semibold text-slate-900">
                            {impacto.descripcion}
                          </div>
                          {impacto.cantidad !== undefined && (
                            <span className="text-xl font-bold text-orange-600">
                              {impacto.cantidad}
                            </span>
                          )}
                        </div>

                        {impacto.detalles && impacto.detalles.length > 0 && (
                          <ul className="mt-2 space-y-1 text-sm text-slate-700">
                            {impacto.detalles.map((detalle, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-orange-600">•</span>
                                <span>{detalle}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SUGERENCIA */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-blue-900">💡 Sugerencia de IA</div>
                <p className="text-sm text-blue-800 mt-1">
                  ¿Quizás solo cambiar de fecha/hora en lugar de {textoAccion[accion].toLowerCase()}?
                  Esto afectaría menos a tu equipo.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="bg-slate-50 border-t border-slate-200 p-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={cargando}
            className="px-6 py-2.5 text-slate-700 font-semibold hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
          >
            Mejor no
          </button>
          <button
            onClick={onConfirm}
            disabled={cargando}
            className={`px-6 py-2.5 text-white font-semibold rounded-lg transition disabled:opacity-50 ${
              colorAccion[accion]
            }`}
          >
            {cargando ? 'Procesando...' : `Confirmar ${textoAccion[accion]}`}
          </button>
        </div>
      </div>
    </div>
  );
}
