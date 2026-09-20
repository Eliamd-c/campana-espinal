'use client';

import { useState, useEffect } from 'react';
import { Calendar, List, Plus, Settings, MessageSquare, Save, ChevronLeft, ChevronRight, CheckCircle2, Clock, X } from 'lucide-react';

export default function AgendaPage() {
  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [agendamientos, setAgendamientos] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'calendario' | 'agendar' | 'plantillas' | 'config'>('calendario');

  // Form states
  const [textoIA, setTextoIA] = useState('');
  const [interpretando, setInterpretando] = useState(false);

  /**
   * Todo lo que se puede extraer del texto. Antes solo se guardaban el título
   * y la fecha, así que el barrio, la dirección y los recursos que la IA
   * reconocía se perdían por el camino.
   */
  const FORM_VACIO = {
    plantilla_id: '',
    titulo: '',
    fecha_inicio: '',
    barrio: '',
    direccion: '',
    responsable: '',
    telefono_responsable: '',
  };
  const [formAgenda, setFormAgenda] = useState(FORM_VACIO);

  /** Recursos solicitados: «sillas 200», «sonido», «200 refrigerios». */
  const [recursos, setRecursos] = useState<{ item: string; cantidad: number | null }[]>([]);

  /** Lo que la IA no supo encajar en ningún campo. */
  const [noReconocido, setNoReconocido] = useState<string[]>([]);

  /** Aviso en pantalla, en lugar de un `alert` que tapa el resultado. */
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Modal Plantilla states
  const [mostrarModalPlantilla, setMostrarModalPlantilla] = useState(false);
  const [nuevaPlantilla, setNuevaPlantilla] = useState({ nombre: '', descripcion: '', icono: '📝', campos: [] as any[] });

  // Config states
  /** Estado de cada clave: si esta puesta y de donde sale, nunca su valor. */
  const [configEstado, setConfigEstado] = useState<any[]>([]);

  useEffect(() => {
    /**
     * Las rutas devuelven `{ data: … }`. Se admite también la forma antigua
     * (el array o el objeto en la raíz) para no romper nada si alguna ruta
     * todavía no se ha actualizado.
     */
    const contenido = (json: any) => json?.data ?? json;

    fetch('/api/agenda/plantillas').then(r => r.json()).then(json => {
      const lista = contenido(json);
      if (Array.isArray(lista)) setPlantillas(lista);
    });
    fetch('/api/agenda').then(r => r.json()).then(json => {
      const lista = contenido(json);
      if (Array.isArray(lista)) setAgendamientos(lista);
    });

    /**
     * La configuración ya no devuelve los valores de las claves de API: solo
     * si están puestas y de dónde salen. Una clave que no sale del servidor
     * no se puede copiar desde el navegador.
     */
    fetch('/api/configuracion').then(r => r.json()).then(json => {
      const estado = contenido(json);
      if (Array.isArray(estado)) setConfigEstado(estado);
    });
  }, []);

  /**
   * Guarda la configuracion.
   *
   * Solo viajan los campos que la persona escribio: un campo en blanco
   * significa «no lo toques», no «borralo». Sin esta distincion, abrir la
   * pestana y pulsar Guardar borraria todas las claves, porque el servidor ya
   * no las devuelve para rellenar los inputs.
   */
  const guardarConfiguracion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formulario = e.currentTarget;
    const fd = new FormData(formulario);

    const cambios: Record<string, string> = {};
    for (const [clave, valor] of Array.from(fd.entries())) {
      const texto = String(valor).trim();
      if (texto !== '') cambios[clave] = texto;
    }

    if (Object.keys(cambios).length === 0) {
      setAviso({ tipo: 'error', texto: 'No hay nada que guardar.' });
      return;
    }

    try {
      const res = await fetch('/api/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? 'No se pudo guardar');

      setAviso({ tipo: 'ok', texto: 'Configuracion guardada.' });

      // Se relee el estado: las pistas y el origen cambian tras guardar.
      const estado = await fetch('/api/configuracion').then(r => r.json());
      if (Array.isArray(estado?.data)) setConfigEstado(estado.data);

      // Los campos sensibles se vacian: lo guardado ya no se reescribe.
      formulario.reset();
    } catch (err: any) {
      setAviso({ tipo: 'error', texto: err?.message ?? 'No se pudo guardar la configuracion.' });
    }
  };

  const handleInterpretar = async () => {
    setInterpretando(true);
    try {
      const res = await fetch('/api/agenda/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: textoIA })
      });
      const json = await res.json();

      if (!res.ok || json.error) throw new Error(json.error ?? 'No se pudo interpretar');

      // La respuesta viene dentro de `data`, junto a lo que no se reconoció.
      const extraido = json.data ?? {};

      /**
       * La fecha y la hora llegan por separado. Se combinan para el campo
       * `datetime-local`; si falta la hora, el campo queda vacío en vez de
       * inventarse la hora actual, que es lo que pasaba antes y hacía parecer
       * que la IA había entendido algo que no dijo nadie.
       */
      const fechaHora =
        extraido.fecha && extraido.hora
          ? `${extraido.fecha}T${extraido.hora}`
          : extraido.fecha
            ? `${extraido.fecha}T00:00`
            : '';

      setFormAgenda(prev => ({
        ...prev,
        // El servidor ya resolvio el nombre de plantilla a un id real; si no
        // caso con ninguna, llega vacio y lo elige la persona.
        plantilla_id: extraido.plantilla_id || prev.plantilla_id,
        titulo: extraido.titulo || '',
        fecha_inicio: fechaHora,
        barrio: extraido.barrio || '',
        direccion: extraido.direccion || '',
        responsable: extraido.responsable || '',
        telefono_responsable: extraido.telefono_responsable || '',
      }));

      setRecursos(Array.isArray(extraido.recursos) ? extraido.recursos : []);
      setNoReconocido(Array.isArray(extraido.no_reconocido) ? extraido.no_reconocido : []);

      // Se dice qué faltó, para que se vea sin tener que buscarlo.
      const faltan = [
        !extraido.fecha && 'la fecha',
        !extraido.hora && 'la hora',
        !extraido.barrio && 'el barrio',
        !extraido.direccion && 'la dirección',
      ].filter(Boolean);

      setAviso({
        tipo: 'ok',
        texto: faltan.length
          ? `Revisa lo que entendí. Falta por completar: ${faltan.join(', ')}.`
          : 'Revisa lo que entendí antes de guardar.',
      });
    } catch(e: any) {
      setAviso({ tipo: 'error', texto: e.message });
    } finally {
      setInterpretando(false);
    }
  };

  const agendar = async (e: React.FormEvent) => {
    e.preventDefault();
    setAviso(null);

    const { telefono_responsable, ...campos } = formAgenda;

    try {
      const res = await fetch('/api/agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...campos,
          /**
           * El telefono no es una columna del modelo, asi que viaja en
           * `datos`. Si se enviara suelto, el esquema del servidor lo
           * descartaria en silencio por ser una clave que no conoce.
           */
          datos: telefono_responsable ? { telefono_responsable } : {},
          // El servidor decide el estado final; aqui solo se pide cupo.
          estado: 'cupo',
          texto_original: textoIA || undefined,
          recursos_solicitados: recursos.map(r => ({
            item: r.item,
            cantidad_solicitada: r.cantidad,
          })),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        // El servidor dice que falta; se muestra en vez de recargar a ciegas.
        const detalle = json?.details?.fieldErrors
          ? Object.entries(json.details.fieldErrors)
              .map(([campo, errores]: any) => `${campo}: ${errores.join(', ')}`)
              .join(' · ')
          : json?.error;
        throw new Error(detalle ?? 'No se pudo guardar');
      }

      setAviso({ tipo: 'ok', texto: 'Guardado como cupo. Aun no es una reunion confirmada.' });
      setFormAgenda(FORM_VACIO);
      setRecursos([]);
      setNoReconocido([]);
      setTextoIA('');

      // Se refresca la lista sin recargar la pagina entera.
      const lista = await fetch('/api/agenda').then(r => r.json());
      setAgendamientos(lista?.data ?? lista ?? []);
    } catch (err: any) {
      setAviso({ tipo: 'error', texto: err.message });
    }
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

        {/* El resultado se ve aquí, no en una ventana que hay que cerrar para
            poder mirarlo. */}
        {aviso && (
          <div
            role="status"
            className={`mb-4 rounded-lg p-3 text-sm ${
              aviso.tipo === 'ok'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {aviso.texto}
          </div>
        )}

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
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha y hora</label>
              <input
                required
                type="datetime-local"
                className="w-full border border-slate-300 rounded-lg p-3"
                value={formAgenda.fecha_inicio}
                onChange={e => setFormAgenda({...formAgenda, fecha_inicio: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Barrio</label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg p-3"
                placeholder="Sin barrio"
                value={formAgenda.barrio}
                onChange={e => setFormAgenda({...formAgenda, barrio: e.target.value})}
              />
            </div>
          </div>

          {/* La dirección es un dato distinto del barrio: sin ella nadie
              encuentra el sitio, aunque sepa en qué barrio es. */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Dirección exacta</label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg p-3"
              placeholder="Ej: carrera 12 # 11-18"
              value={formAgenda.direccion}
              onChange={e => setFormAgenda({...formAgenda, direccion: e.target.value})}
            />
          </div>

          {/* Quien responde por la reunion. Se escribia en el texto («numero
              de responsable 321 123 4567») y acababa en «no supe donde poner
              esto», porque no habia campo donde ponerlo. */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Responsable</label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg p-3"
                placeholder="Quién responde"
                value={formAgenda.responsable}
                onChange={e => setFormAgenda({...formAgenda, responsable: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
              <input
                type="tel"
                className="w-full border border-slate-300 rounded-lg p-3"
                placeholder="Ej: 321 123 4567"
                value={formAgenda.telefono_responsable}
                onChange={e => setFormAgenda({...formAgenda, telefono_responsable: e.target.value})}
              />
            </div>
          </div>

          {/* Lo que hay que conseguir. Antes la IA lo reconocía y se perdía
              por el camino, porque no había dónde mostrarlo. */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">
                Recursos solicitados
                {recursos.length > 0 && (
                  <span className="ml-2 text-xs text-slate-500">({recursos.length})</span>
                )}
              </label>
              <button
                type="button"
                onClick={() => setRecursos([...recursos, { item: '', cantidad: null }])}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                + Añadir
              </button>
            </div>

            {recursos.length === 0 ? (
              <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg p-3">
                Ninguno. Escribe «sillas 200, sonido» y la IA los reconoce.
              </p>
            ) : (
              <div className="space-y-2">
                {recursos.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 border border-slate-300 rounded-lg p-2 text-sm"
                      placeholder="Qué hace falta"
                      value={r.item}
                      onChange={e => {
                        const copia = [...recursos];
                        copia[i] = { ...copia[i], item: e.target.value };
                        setRecursos(copia);
                      }}
                    />
                    <input
                      type="number"
                      min={0}
                      className="w-28 border border-slate-300 rounded-lg p-2 text-sm"
                      placeholder="cantidad"
                      value={r.cantidad ?? ''}
                      onChange={e => {
                        const copia = [...recursos];
                        copia[i] = {
                          ...copia[i],
                          cantidad: e.target.value === '' ? null : Number(e.target.value),
                        };
                        setRecursos(copia);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setRecursos(recursos.filter((_, j) => j !== i))}
                      className="px-2 text-slate-400 hover:text-red-600"
                      aria-label="Quitar recurso"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lo que la IA no supo encajar. Se enseña en vez de descartarlo en
              silencio: puede ser justo el dato que importaba. */}
          {noReconocido.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm font-medium text-amber-900">No supe dónde poner esto:</p>
              <ul className="mt-1 space-y-0.5">
                {noReconocido.map((t, i) => (
                  <li key={i} className="text-sm text-amber-800">· {t}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-4 mt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setFormAgenda(FORM_VACIO);
                setRecursos([]);
                setNoReconocido([]);
                setAviso(null);
              }}
              className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg"
            >
              Descartar
            </button>
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
          <button 
            onClick={() => setActiveTab('config')}
            className={`px-6 py-2 rounded-md font-medium transition-all ${activeTab === 'config' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Configuración IA
          </button>
        </div>
      </div>

      <div className="mt-8 transition-all duration-300">
        {activeTab === 'calendario' && renderCalendario()}
        {activeTab === 'agendar' && renderAgendar()}
        {activeTab === 'plantillas' && renderPlantillas()}
        {activeTab === 'config' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 max-w-3xl mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-6 h-6 text-indigo-600" />
              <h2 className="text-xl font-bold">Configuración de Inteligencia Artificial</h2>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Las claves de API no se muestran: el servidor solo informa si están puestas, de
              dónde salen y sus últimos cuatro caracteres. Deja un campo en blanco para no
              tocarlo.
            </p>

            {configEstado.length === 0 ? (
              <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg text-center border border-dashed border-slate-200">
                No se pudo leer la configuración. Necesitas el permiso «configuracion.gestionar».
              </p>
            ) : (
              <form onSubmit={guardarConfiguracion} className="space-y-5">
                {configEstado.map((c: any) => (
                  <div key={c.clave}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-slate-700">{c.etiqueta}</label>
                      {c.configurada ? (
                        <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          Configurada{c.pista ? ` (${c.pista})` : ''} · {c.origen}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                          Sin configurar
                        </span>
                      )}
                    </div>

                    {Array.isArray(c.opciones) && c.opciones.length > 0 ? (
                      <select
                        name={c.clave}
                        defaultValue={c.valor ?? c.opciones[0]}
                        className="w-full border border-slate-300 rounded-lg p-3 bg-slate-50"
                      >
                        {c.opciones.map((o: string) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        name={c.clave}
                        type={c.sensible ? 'password' : 'text'}
                        autoComplete="off"
                        defaultValue={c.sensible ? '' : (c.valor ?? '')}
                        placeholder={c.sensible && c.configurada ? 'Sin cambios' : ''}
                        className="w-full border border-slate-300 rounded-lg p-3"
                      />
                    )}

                    {c.ayuda && <p className="text-xs text-slate-500 mt-1">{c.ayuda}</p>}
                  </div>
                ))}

                <div className="pt-4 mt-4 border-t border-slate-100 flex justify-end">
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 shadow-sm">
                    <Save className="w-5 h-5" /> Guardar Configuración
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
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
