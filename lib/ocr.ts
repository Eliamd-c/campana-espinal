// lib/ocr.ts
// Lógica de OCR conectada al servidor (Gemini Multimodal)

export interface CampoOCR {
  valor: string;
  confianza: number; // 0–100
}

export interface RegistroEscaneado {
  cedula: CampoOCR;
  nombre: CampoOCR;
  telefono: CampoOCR;
  barrio: CampoOCR;
}

/**
 * Un archivo de la tanda a escanear: una foto tomada con la cámara, una
 * imagen subida, o un PDF de escáner que puede traer varias planillas dentro.
 */
export interface ArchivoPlanilla {
  url: string;
  nombre: string;
  esPdf: boolean;
}

/**
 * Junta los registros de varias páginas descartando repeticiones.
 *
 * Al fotografiar hoja por hoja es fácil repetir una, y un PDF puede traer la
 * misma planilla escaneada dos veces. Si dos filas comparten cédula se queda
 * la lectura más fiable, porque la segunda foto de la misma hoja suele salir
 * mejor o peor, no igual. Las filas sin cédula no se agrupan: no hay manera
 * de saber si son la misma persona.
 */
export function fusionarRegistros(paginas: RegistroEscaneado[][]): RegistroEscaneado[] {
  const porCedula = new Map<string, RegistroEscaneado>();
  const sinCedula: RegistroEscaneado[] = [];

  const fiabilidad = (r: RegistroEscaneado) =>
    r.cedula.confianza + r.nombre.confianza + r.telefono.confianza + r.barrio.confianza;

  for (const pagina of paginas) {
    for (const registro of pagina) {
      const cedula = registro.cedula.valor;
      if (!cedula) {
        sinCedula.push(registro);
        continue;
      }

      const previo = porCedula.get(cedula);
      if (!previo || fiabilidad(registro) > fiabilidad(previo)) {
        porCedula.set(cedula, registro);
      }
    }
  }

  return [...Array.from(porCedula.values()), ...sinCedula];
}

/**
 * Si el servidor no manda confianza para un campo, se asume dudosa. Antes
 * aquí se ponía 95 fijo a todo: la tabla de revisión marca en amarillo lo que
 * baja de 85, así que nunca se marcaba nada y el aviso de "revisa esto" era
 * decorativo. Más vale mandar a revisar de más que colar un error al padrón.
 */
const CONFIANZA_DUDOSA = 60;

function aCampo(valor: unknown, confianza: unknown): CampoOCR {
  const texto = typeof valor === "string" ? valor : "";
  const numero = typeof confianza === "number" && Number.isFinite(confianza) ? confianza : CONFIANZA_DUDOSA;

  return {
    valor: texto,
    // Un campo vacío no es una lectura fiable: es una casilla sin leer.
    confianza: texto ? Math.min(100, Math.max(0, Math.round(numero))) : 0,
  };
}

/**
 * Error del OCR que conserva el código HTTP.
 *
 * Quien procesa una tanda necesita distinguir "esta hoja salió borrosa" de
 * "se acabó el cupo de escaneos", porque en el segundo caso seguir pidiendo
 * solo suma rechazos. Mirar el texto del mensaje para adivinarlo se rompe en
 * cuanto alguien reescribe el aviso.
 */
export class ErrorOcr extends Error {
  constructor(mensaje: string, readonly status: number) {
    super(mensaje);
    this.name = "ErrorOcr";
  }
}

/**
 * Procesa una imagen o un PDF enviándolo a la API del servidor
 * (Gemini 1.5 Flash) y extrae los campos de la planilla.
 */
export async function procesarPlanilla(
  imagenUrl: string,
  onProgress?: (progress: number) => void
): Promise<RegistroEscaneado[]> {

  // Simulamos un progreso inicial para mantener la experiencia de usuario
  if (onProgress) {
    onProgress(20);
  }

  try {
    const res = await fetch("/api/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imagenUrl }),
    });

    if (onProgress) onProgress(80);

    const json = await res.json();

    if (!res.ok) {
      throw new ErrorOcr(json.error || "Error en el servidor OCR", res.status);
    }

    if (onProgress) onProgress(100);

    // Mapeamos los datos limpios que trae Gemini al formato interno de la UI,
    // conservando la confianza que el modelo declaró para cada casilla.
    const resultadosBrutos: any[] = json.data || [];

    const registros: RegistroEscaneado[] = resultadosBrutos.map((r) => {
      const c = r?.confianza ?? {};
      return {
        cedula: aCampo(r?.cedula, c.cedula),
        nombre: aCampo(r?.nombre, c.nombre),
        telefono: aCampo(r?.telefono, c.telefono),
        barrio: aCampo(r?.barrio, c.barrio),
      };
    });

    return registros;
  } catch (error) {
    console.error("Error al procesar planilla con OCR avanzado:", error);
    throw error;
  }
}
