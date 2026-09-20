"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";

/**
 * Generador de planillas en blanco para imprimir.
 *
 * El diseño del papel es la única variable que de verdad mueve la precisión
 * del escáner y, hasta ahora, la única que no controlábamos: cada quien
 * llevaba su hoja. Las reglas que se aplican aquí son las de diseño de
 * formularios para ICR, quedándose con las que pagan cuando quien lee es un
 * modelo multimodal:
 *
 * - Casillas sueltas para cédula y teléfono. Es donde un error cuesta más,
 *   porque un dígito mal deja el contacto inservible, y separar caracteres
 *   es lo que más sube el acierto en números manuscritos.
 * - Bordes en un azul muy claro (dropout). Un recuadro oscuro y pegado al
 *   trazo se confunde con un "1" o una "l".
 * - Renglones altos, para que las colas de la "g" o la "j" no invadan la
 *   fila de abajo.
 * - Instructivo en cabecera: letra imprenta mayúscula y tinta oscura.
 * - Cuadros negros en las esquinas. Hoy no los usa nadie: sirven para
 *   corregir la inclinación en un preprocesado que todavía no existe. Se
 *   imprimen porque no cuestan nada y dejan la hoja lista para ese paso.
 *
 * Las columnas son justo los cuatro campos que el OCR extrae. Una columna que
 * nadie lee solo roba ancho a las que sí importan.
 */

const CASILLAS_CEDULA = 10;
const CASILLAS_TELEFONO = 10;

/**
 * Alto de renglón según cuántas personas quepan en la hoja.
 *
 * Medido sobre A4: la cabecera y el pie se comen unos 69 mm, así que quedan
 * ~212 mm para la tabla. Con renglón de 11 mm caben 15 filas; para 20 o 25 hay
 * que apretar, y apretar es una concesión: cuanto más bajo el renglón, más
 * fácil es que una letra invada la fila de abajo y el OCR la lea mal.
 */
function medidasFila(filas: number) {
  if (filas >= 25) return { fila: "8mm", casilla: "6.2mm" };
  if (filas >= 20) return { fila: "9mm", casilla: "7mm" };
  return { fila: "11mm", casilla: "8.5mm" };
}

interface EventoResumen {
  id: string;
  titulo: string;
  lugar: string;
  barrio: string | null;
  fecha_inicio: string;
}

export default function GenerarPlanillaPage() {
  const [titulo, setTitulo] = useState("");
  const [lugar, setLugar] = useState("");
  const [fecha, setFecha] = useState("");
  const [barrio, setBarrio] = useState("");
  const [filas, setFilas] = useState(15);
  const [eventos, setEventos] = useState<EventoResumen[]>([]);

  /**
   * La lista de eventos es una comodidad, no un requisito: la ruta pide
   * permiso de agenda y quien captura en campo puede no tenerlo. Si no
   * llega, los campos se escriben a mano y la planilla sale igual.
   */
  useEffect(() => {
    fetch("/api/eventos")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (Array.isArray(json?.data)) setEventos(json.data.slice(0, 50));
      })
      .catch(() => {
        /* sin lista, se rellena a mano */
      });
  }, []);

  const elegirEvento = (id: string) => {
    const evento = eventos.find((e) => e.id === id);
    if (!evento) return;

    setTitulo(evento.titulo);
    setLugar(evento.lugar);
    setBarrio(evento.barrio ?? "");
    setFecha(evento.fecha_inicio.slice(0, 10));
  };

  const medidas = medidasFila(filas);

  const fechaLegible = fecha
    ? new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <style>{`
        /* Colores atenuados: el trazo del bolígrafo tiene que destacar más
           que la propia cuadrícula. */
        .planilla {
          --borde: #b9cde0;
          --borde-fuerte: #8fa9c2;
          --texto-guia: #7b8ea1;
        }

        @media print {
          /* En papel solo va la planilla: nada de menús, botones ni fondos. */
          body * { visibility: hidden; }
          .planilla, .planilla * { visibility: visible; }
          .planilla {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
            border: none !important;
          }
          .no-imprimir { display: none !important; }
          /* El relleno de la vista previa se quita en papel: con él, las
             columnas de casillas no caben en el ancho de un A4. */
          .planilla { padding: 0 !important; border-radius: 0 !important; }
          .hoja-interna { padding: 6mm 4mm !important; }
          @page { size: A4 portrait; margin: 8mm; }
        }
      `}</style>

      {/* Controles (no se imprimen) */}
      <div className="no-imprimir space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Generar planilla en blanco</h1>
            <p className="text-sm text-gray-500 mt-1">
              Imprime esta hoja para la reunión: está diseñada para que el escáner la lea bien.
            </p>
          </div>
          <Link
            href="/escanear"
            className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Volver a escanear
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {eventos.length > 0 && (
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Rellenar desde la agenda</span>
              <select
                onChange={(e) => elegirEvento(e.target.value)}
                defaultValue=""
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">— Escribir a mano —</option>
                {eventos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.titulo} · {e.fecha_inicio.slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Reunión o evento</span>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej. Reunión barrial San José"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Fecha</span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Lugar</span>
              <input
                value={lugar}
                onChange={(e) => setLugar(e.target.value)}
                placeholder="Ej. Salón comunal"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Barrio</span>
              <input
                value={barrio}
                onChange={(e) => setBarrio(e.target.value)}
                placeholder="Ej. San José"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Filas por hoja</span>
              <select
                value={filas}
                onChange={(e) => setFilas(Number(e.target.value))}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {[10, 15, 20, 25].map((n) => (
                  <option key={n} value={n}>
                    {n} personas {n >= 25 ? "(renglón más apretado)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => window.print()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-all flex items-center gap-2"
            >
              <Printer className="w-4 h-4" /> Imprimir planilla
            </button>
            <span className="text-xs text-gray-500">
              En el diálogo de impresión elige A4 y desactiva encabezados y pies de página.
            </span>
          </div>
        </div>
      </div>

      {/* Vista previa / hoja imprimible */}
      <div className="planilla bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative text-black">
        {/* Marcas de esquina */}
        <div className="absolute top-3 left-3 w-5 h-5 bg-black" />
        <div className="absolute top-3 right-3 w-5 h-5 bg-black" />
        <div className="absolute bottom-3 left-3 w-5 h-5 bg-black" />
        <div className="absolute bottom-3 right-3 w-5 h-5 bg-black" />

        <div className="hoja-interna px-6 pt-4 pb-6">
          <h2 className="text-center text-xl font-bold tracking-wide">PLANILLA DE ASISTENCIA</h2>

          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <p>
              <strong>Reunión:</strong> {titulo || "______________________________"}
            </p>
            <p>
              <strong>Fecha:</strong> {fechaLegible || "___________________"}
            </p>
            <p>
              <strong>Lugar:</strong> {lugar || "______________________________"}
            </p>
            <p>
              <strong>Barrio:</strong> {barrio || "___________________"}
            </p>
          </div>

          <p
            className="mt-3 text-center text-[11px] font-semibold border border-dashed rounded px-2 py-1.5"
            style={{ borderColor: "var(--borde-fuerte)" }}
          >
            ESCRIBA EN LETRA IMPRENTA MAYÚSCULA, CON BOLÍGRAFO NEGRO O AZUL OSCURO.
            UN CARÁCTER POR CASILLA, SIN SALIRSE DE LOS RECUADROS.
          </p>

          {/* Tabla */}
          <table className="mt-4 w-full border-collapse text-[11px]">
            <thead>
              <tr>
                {["N°", "CÉDULA", "NOMBRE Y APELLIDOS", "TELÉFONO", "BARRIO"].map((h) => (
                  <th
                    key={h}
                    className="border px-1 py-1 font-bold text-[10px] tracking-wide"
                    style={{ borderColor: "var(--borde-fuerte)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: filas }).map((_, i) => (
                <tr key={i} style={{ height: medidas.fila }}>
                  <td
                    className="border text-center align-middle"
                    style={{ borderColor: "var(--borde)", width: "7mm", color: "var(--texto-guia)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </td>

                  {/* Casillas sueltas: un dígito por recuadro */}
                  <td className="border p-0.5" style={{ borderColor: "var(--borde)" }}>
                    <div className="flex gap-[1px] justify-center">
                      {Array.from({ length: CASILLAS_CEDULA }).map((_, c) => (
                        <span
                          key={c}
                          className="block border"
                          style={{
                            borderColor: "var(--borde)",
                            width: "4.2mm",
                            height: medidas.casilla,
                          }}
                        />
                      ))}
                    </div>
                  </td>

                  {/* Texto libre: sin cuadrícula interna, para no partir el trazo */}
                  <td className="border" style={{ borderColor: "var(--borde)", minWidth: "50mm" }} />

                  <td className="border p-0.5" style={{ borderColor: "var(--borde)" }}>
                    <div className="flex gap-[1px] justify-center">
                      {Array.from({ length: CASILLAS_TELEFONO }).map((_, c) => (
                        <span
                          key={c}
                          className="block border"
                          style={{
                            borderColor: "var(--borde)",
                            width: "4.2mm",
                            height: medidas.casilla,
                          }}
                        />
                      ))}
                    </div>
                  </td>

                  <td className="border" style={{ borderColor: "var(--borde)", minWidth: "25mm" }} />
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-between text-[10px] px-8" style={{ color: "var(--texto-guia)" }}>
            <span>Responsable de la planilla: ______________________________</span>
            <span>Hoja ______ de ______</span>
          </div>
        </div>
      </div>
    </div>
  );
}
