interface ValidacionPrevia {
  valida: boolean;
  razon?:
    | "NO_HAY_DOCUMENTOS"
    | "CONFIANZA_INSUFICIENTE"
    | "DOCUMENTOS_INCONSISTENTES"
    | "PREGUNTA_MUY_VAGA";
  confianzaPromedio?: number;
  detalles?: string;
}

/**
 * GATEKEEPER: Rechaza preguntas sin documentos suficientes
 * Evita intentar generar respuestas a ciegas
 */
export async function validarPreguntaRAG(
  pregunta: string,
  documentos: any[]
): Promise<ValidacionPrevia> {
  // VALIDACIÓN 1: ¿Hay al menos 2 documentos relevantes?
  if (documentos.length === 0) {
    return {
      valida: false,
      razon: "NO_HAY_DOCUMENTOS",
      detalles: "No se encontraron documentos relevantes para esta pregunta.",
    };
  }

  if (documentos.length === 1 && documentos[0].confianza === "BAJA") {
    return {
      valida: false,
      razon: "CONFIANZA_INSUFICIENTE",
      confianzaPromedio: documentos[0].relevancia,
      detalles: "El único documento encontrado tiene relevancia insuficiente.",
    };
  }

  // VALIDACIÓN 2: Calcular confianza promedio
  const confianzas = documentos.map((doc) => {
    // Mapear confianza a número
    const scores: Record<string, number> = {
      ALTA: 1.0,
      MEDIA: 0.75,
      BAJA: 0.5,
      INSUFICIENTE: 0.2,
    };
    return scores[doc.confianza] || 0;
  });

  const confianzaPromedio =
    confianzas.reduce((a, b) => a + b, 0) / confianzas.length;

  if (confianzaPromedio < 0.55) {
    return {
      valida: false,
      razon: "CONFIANZA_INSUFICIENTE",
      confianzaPromedio,
      detalles: `Confianza promedio: ${(confianzaPromedio * 100).toFixed(1)}% (mínimo requerido: 55%)`,
    };
  }

  // VALIDACIÓN 3: ¿Los documentos hablan de temas similares?
  const similitudEntreDocs = calcularSimilitudEntreDocs(documentos);

  if (similitudEntreDocs < 0.35 && documentos.length > 2) {
    return {
      valida: false,
      razon: "DOCUMENTOS_INCONSISTENTES",
      detalles: "Los documentos encontrados hablan de temas demasiado diferentes. La respuesta podría ser contradictoria.",
    };
  }

  // VALIDACIÓN 4: ¿Pregunta tiene suficiente especificidad?
  if (esPreguntaMuyVaga(pregunta)) {
    return {
      valida: false,
      razon: "PREGUNTA_MUY_VAGA",
      detalles: "La pregunta es demasiado genérica o muy corta. Intenta proporcionar detalles o palabras clave adicionales.",
    };
  }

  // ✅ PASA TODAS LAS VALIDACIONES
  return {
    valida: true,
    confianzaPromedio,
  };
}

/**
 * Mide similitud entre documentos
 * Compara categorías, fechas cercanas, etc.
 */
function calcularSimilitudEntreDocs(docs: any[]): number {
  if (docs.length < 2) return 1;

  let totalSimilitud = 0;
  let comparaciones = 0;

  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      let similitud = 0;

      // Misma categoría = 1.0
      if (docs[i].categoria === docs[j].categoria) {
        similitud = 1.0;
      } else {
        // Categorías similares = 0.5
        similitud = 0.5;
      }

      // Misma fuente = +0.3
      if (docs[i].fuente === docs[j].fuente) {
        similitud += 0.3;
      }

      // Cercanos en tiempo (< 30 días) = +0.2
      const dateI = new Date(docs[i].fecha_creacion).getTime();
      const dateJ = new Date(docs[j].fecha_creacion).getTime();
      const diasDiferencia = Math.abs((dateI - dateJ) / (1000 * 60 * 60 * 24));

      if (diasDiferencia < 30) {
        similitud += 0.2;
      }

      totalSimilitud += Math.min(similitud, 1.0);
      comparaciones++;
    }
  }

  return totalSimilitud / comparaciones;
}

/**
 * Filtra preguntas extremadamente vagas
 */
function esPreguntaMuyVaga(pregunta: string): boolean {
  const palabrasVagas = [
    "qué",
    "cuál",
    "cómo",
    "por qué",
    "dónde",
    "cuándo",
    "que",
    "como",
    "cual",
  ];

  const limpio = pregunta.toLowerCase().trim().replace(/[?¿!¡]/g, "");

  // Si la pregunta es muy corta Y es solo una palabra vaga
  if (limpio.length < 15 && palabrasVagas.some((p) => limpio === p)) {
    return true;
  }

  // Si tiene menos de 10 caracteres
  if (limpio.length < 10) {
    return true;
  }

  return false;
}
