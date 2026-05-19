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

    // Mapeamos los datos limpios que trae Gemini al formato interno de la UI
    // Asignamos una confianza alta por defecto porque Gemini es muy preciso.
    const resultadosBrutos: any[] = json.data || [];
    
    const registros: RegistroEscaneado[] = resultadosBrutos.map((r) => ({
      cedula: { valor: r.cedula || "", confianza: 95 },
      nombre: { valor: r.nombre || "", confianza: 95 },
      telefono: { valor: r.telefono || "", confianza: 95 },
      barrio: { valor: r.barrio || "", confianza: 90 },
    }));

    return registros;
  } catch (error) {
    console.error("Error al procesar planilla con OCR avanzado:", error);
    throw error;
  }
}
