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
 * Procesa una imagen enviándola a la API del servidor (Gemini 1.5 Flash)
 * y extrae los campos de la planilla.
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
      throw new Error(json.error || "Error en el servidor OCR");
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
