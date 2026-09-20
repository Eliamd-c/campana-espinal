'use client';

import { useState, useEffect } from 'react';
import { Calendar, List, Plus, Settings, MessageSquare, Save, ChevronLeft, ChevronRight, CheckCircle2, Clock, X } from 'lucide-react';

export default function AgendaPage() {
  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [agendamientos, setAgendamientos] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'calendario' | 'agendar' | 'plantillas'>('calendario');

  // Form states
  const [textoIA, setTextoIA] = useState('');
  const [interpretando, setInterpretando] = useState(false);
  const [formAgenda, setFormAgenda] = useState({ plantilla_id: '', titulo: '', fecha_inicio: '' });

  // Modal Plantilla states
  const [mostrarModalPlantilla, setMostrarModalPlantilla] = useState(false);
  const [nuevaPlantilla, setNuevaPlantilla] = useState({ nombre: '', descripcion: '', icono: '📝', campos: [] as any[] });

  useEffect(() => {
    fetch('/api/agenda/plantillas').then(r => r.json()).then(data => {
      if(Array.isArray(data)) setPlantillas(data);
    });
    fetch('/api/agenda').then(r => r.json()).then(data => {
      if(Array.isArray(data)) setAgendamientos(data);
    });
  }, []);

  const handleInterpretar = async () => {
    setInterpretando(true);
    try {
      const res = await fetch('/api/agenda/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: textoIA })
      });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);

      setFormAgenda(prev => ({
        ...prev,
        titulo: data.titulo || 'Reunión autogenerada por IA',
        fecha_inicio: data.fecha ? data.fecha.slice(0, 16) : new Date().toISOString().slice(0, 16)
      }));
      
      alert("La IA extrajo exitosamente los datos de tu texto.");
    } catch(e: any) {
      alert("Error al interpretar: " + e.message);
    } finally {
      setInterpretando(false);
    }
  };

  const agendar = (e: React.FormEvent) => {
    e.preventDefault();
    fetch('/api/agenda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formAgenda, estado: 'cupo' })
    }).then(() => {
      alert("Agendamiento creado como CUPO");
      window.location.reload();
    });
  };

  const guardarPlantilla = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/agenda/plantillas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({...nuevaPlantilla, requiere_aprobacion: false, activa: true, recursos_sugeridos: []})
    });
    setMostrarModalPlantilla(false);
    window.location.reload();
  };

  const agregarCampo = () => {
    setNuevaPlantilla({
      ...nuevaPlantilla, 
      campos: [...nuevaPlantilla.campos, { clave: `campo_${nuevaPlantilla.campos.length + 1}`, etiqueta: '', tipo: 'texto_corto', requerido_para_confirmar: true }]
    });
  };

  const renderCalendario = () => {
    const dias = Array.from({length: 35}, (_, i) => i + 1);

    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-indigo-600" />
            Septiembre 2026
          </h2>
          <div className="flex gap-2">
            <button className="p-2 border rounded hover:bg-slate-50"><ChevronLeft className="w-5 h-5"/></button>
            <button className="px-4 py-2 border rounded hover:bg-slate-50 font-medium">Hoy</button>
            <button className="p-2 border rounded hover:bg-slate-50"><ChevronRight className="w-5 h-5"/></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
            <div key={d} className="bg-slate-50 p-2 text-center text-sm font-semibold text-slate-600">
              {d}
            </div>
          ))}
          {dias.map(d => {
            const eventosDia = agendamientos.filter(a => new Date(a.fecha_inicio).getDate() === (d % 30));

            return (
              <div key={d} className="bg-white min-h-[120px] p-2 hover:bg-slate-50 transition-colors">
                <span className={`text-sm font-medium ${d === 20 ? 'bg-indigo-600 text-white w-7 h-7 flex items-center justify-center rounded-full' : 'text-slate-700'}`}>
                  {d > 30 ? d - 30 : d}
                </span>
                <div className="mt-2 space-y-1">
                  {eventosDia.map(ev => (
                    <div 
                      key={ev.id} 
                      className={`text-xs p-1.5 rounded truncate flex items-center gap-1
                        ${ev.estado === 'confirmado' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-white border border-dashed border-slate-400 text-slate-600'}`}
                    >
                      {ev.estado === 'confirmado' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3 text-amber-500" />}
                      {ev.titulo}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAgendar = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-600" />
          Escritura Natural
        </h2>
        <p className="text-slate-500 text-sm mb-4">
          Escribe cómo te solicitaron la reunión. La Inteligencia Artificial extraerá automáticamente la plantilla, fecha, recursos necesarios y campos requeridos.
        </p>
        <textarea 
          value={textoIA}
          onChange={e => setTextoIA(e.target.value)}
          className="w-full border border-slate-300 rounded-lg p-4 h-48 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none"
          placeholder="Ej: Vamos a realizar una reunión el 4 de agosto en el barrio Caballero y Góngora, hora 6:30 pm. Solicito tarima, sonido y 200 sillas."
        />
        <button 
          onClick={handleInterpretar}
          disabled={!textoIA || interpretando}
          className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-medium flex justify-center items-center gap-2 transition-colors disabled:opacity-50"
        >
          {interpretando ? <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> : <Settings className="w-5 h-5" />}
          Interpretar Texto
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <List className="w-5 h-5 text-indigo-600" />
          Datos Estructurados
        </h2>
        <form onSubmit={agendar} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Plantilla Aplicada</label>
            <select 
              className="w-full border border-slate-300 rounded-lg p-3 bg-slate-50"
              value={formAgenda.plantilla_id}
              onChange={e => setFormAgenda({...formAgenda, plantilla_id: e.target.value})}
              required
            >
              <option value="">Selecciona o deja que la IA asigne...</option>
              {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Título del Evento</label>
            <input 
              required
              type="text" 
              className="w-full border border-slate-300 rounded-lg p-3"
              value={formAgenda.titulo}
              onChange={e => setFormAgenda({...formAgenda, titulo: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Inicio</label>
              <input 
                required
                type="datetime-local" 
                className="w-full border border-slate-300 rounded-lg p-3"
                value={formAgenda.fecha_inicio}
                onChange={e => setFormAgenda({...formAgenda, fecha_inicio: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Lugar / Barrio</label>
              <input type="text" className="w-full border border-slate-300 rounded-lg p-3" placeholder="Por confirmar..." />
            </div>
          </div>
          <div className="pt-4 mt-4 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg">Descartar</button>
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 shadow-sm">
              <Save className="w-5 h-5" />
              Guardar como Cupo
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderPlantillas = () => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6 text-indigo-600" />
            Constructor de Plantillas
          </h2>
          <p className="text-slate-500 text-sm">Define el esquema y requisitos de diferentes tipos de eventos.</p>
        </div>
        <button 
          onClick={() => setMostrarModalPlantilla(true)} 
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-5 h-5" /> Nueva Plantilla
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plantillas.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
            No hay plantillas creadas. Las plantillas definen los requisitos dinámicos para confirmar reuniones.
          </div>
        ) : (
          plantillas.map(p => (
            <div key={p.id} className="border border-slate-200 rounded-lg p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xl">
                  {p.icono || p.nombre.charAt(0)}
                </div>
                <h3 className="font-bold text-lg text-slate-800">{p.nombre}</h3>
              </div>
              <p className="text-sm text-slate-600 mb-4 h-10 overflow-hidden">{p.descripcion || 'Sin descripción'}</p>
              <div className="text-xs bg-slate-100 text-slate-600 px-3 py-2 rounded-md">
                <strong>{p.campos ? p.campos.length : 0}</strong> campos requeridos configurados
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestión de Agenda</h1>
          <p className="text-slate-500 mt-1">Organiza y administra reuniones con validación de requisitos.</p>
        </div>
        
        <div className="flex bg-slate-200 p-1 rounded-lg w-fit">
          <button 
            onClick={() => setActiveTab('calendario')}
            className={`px-6 py-2 rounded-md font-medium transition-all ${activeTab === 'calendario' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Calendario
          </button>
          <button 
            onClick={() => setActiveTab('agendar')}
            className={`px-6 py-2 rounded-md font-medium transition-all ${activeTab === 'agendar' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Agendar con IA
          </button>
          <button 
            onClick={() => setActiveTab('plantillas')}
            className={`px-6 py-2 rounded-md font-medium transition-all ${activeTab === 'plantillas' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Plantillas
          </button>
        </div>
      </div>

      <div className="mt-8 transition-all duration-300">
        {activeTab === 'calendario' && renderCalendario()}
        {activeTab === 'agendar' && renderAgendar()}
        {activeTab === 'plantillas' && renderPlantillas()}
      </div>

      {mostrarModalPlantilla && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold flex items-center gap-2"><Settings className="w-5 h-5 text-indigo-600"/> Nueva Plantilla</h2>
              <button onClick={() => setMostrarModalPlantilla(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={guardarPlantilla} className="p-6 space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-3">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la plantilla</label>
                  <input required type="text" className="w-full border border-slate-300 rounded-lg p-2.5" value={nuevaPlantilla.nombre} onChange={e => setNuevaPlantilla({...nuevaPlantilla, nombre: e.target.value})} placeholder="Ej: Reunión de barrio" />
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Icono (Emoji)</label>
                  <input required type="text" className="w-full border border-slate-300 rounded-lg p-2.5 text-center" value={nuevaPlantilla.icono} onChange={e => setNuevaPlantilla({...nuevaPlantilla, icono: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                <textarea className="w-full border border-slate-300 rounded-lg p-2.5 resize-none h-20" value={nuevaPlantilla.descripcion} onChange={e => setNuevaPlantilla({...nuevaPlantilla, descripcion: e.target.value})} placeholder="Instrucciones para quien use esta plantilla..." />
              </div>
              
              <div className="mt-6 pt-6 border-t border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <label className="block text-sm font-bold text-slate-800">Campos Dinámicos</label>
                  <button type="button" onClick={agregarCampo} className="text-sm text-indigo-600 font-medium hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-md flex items-center gap-1"><Plus className="w-4 h-4"/> Añadir campo</button>
                </div>
                
                {nuevaPlantilla.campos.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg text-center border border-dashed border-slate-200">No hay campos adicionales. Solo se pedirá título y fecha.</p>
                ) : (
                  <div className="space-y-3">
                    {nuevaPlantilla.campos.map((campo, index) => (
                      <div key={index} className="flex gap-3 items-start bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div className="flex-1">
                          <input required type="text" placeholder="Nombre del campo (ej: Dirección)" className="w-full border border-slate-300 rounded p-2 text-sm mb-2" value={campo.etiqueta} onChange={e => {
                            const newCampos = [...nuevaPlantilla.campos];
                            newCampos[index].etiqueta = e.target.value;
                            newCampos[index].clave = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_');
                            setNuevaPlantilla({...nuevaPlantilla, campos: newCampos});
                          }}/>
                          <div className="flex gap-4 items-center">
                            <select className="border border-slate-300 rounded p-1.5 text-sm" value={campo.tipo} onChange={e => {
                              const newCampos = [...nuevaPlantilla.campos];
                              newCampos[index].tipo = e.target.value;
                              setNuevaPlantilla({...nuevaPlantilla, campos: newCampos});
                            }}>
                              <option value="texto_corto">Texto Corto</option>
                              <option value="texto_largo">Texto Largo</option>
                              <option value="numero">Número</option>
                              <option value="barrio">Barrio (Lista)</option>
                            </select>
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                              <input type="checkbox" checked={campo.requerido_para_confirmar} onChange={e => {
                                const newCampos = [...nuevaPlantilla.campos];
                                newCampos[index].requerido_para_confirmar = e.target.checked;
                                setNuevaPlantilla({...nuevaPlantilla, campos: newCampos});
                              }}/> Requerido confirmar
                            </label>
                          </div>
                        </div>
                        <button type="button" onClick={() => {
                          const newCampos = nuevaPlantilla.campos.filter((_, i) => i !== index);
                          setNuevaPlantilla({...nuevaPlantilla, campos: newCampos});
                        }} className="text-red-500 hover:bg-red-50 p-2 rounded"><X className="w-4 h-4"/></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setMostrarModalPlantilla(false)} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 shadow-sm">
                  <Save className="w-5 h-5" /> Crear Plantilla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
