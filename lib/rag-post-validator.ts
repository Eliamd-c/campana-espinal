interface ResultadoValidacion {
  valida: boolean;
  score: number; // 0-100
  problemas: string[];
  advertencias: string[];
}

/**
 * VALIDACIÓN POST-RESPUESTA
 * Verifica que la IA realmente citó los documentos
 * y no inventó información
 */
export async function validarRespuestaRAG(
  respuesta: string,
  documentos: any[]
): Promise<ResultadoValidacion> {
  const problemas: string[] = [];
  const advertencias: string[] = [];
  let score = 100;

  // ========== CHECK 1: ¿Cita documentos? ==========
  const citasEncontradas = documentos.filter(
    (doc) =>
      respuesta.includes(`[DOCUMENTO`) ||
      respuesta.includes(doc.titulo) ||
      respuesta.toLowerCase().includes("según") ||
      respuesta.toLowerCase().includes("segun")
  );

  if (citasEncontradas.length === 0) {
    problemas.push("NO_CITA_DOCUMENTOS");
    score -= 40;
  } else if (citasEncontradas.length < documentos.length / 2) {
    advertencias.push(`Solo cita ${citasEncontradas.length}/${documentos.length} documentos`);
    score -= 10;
  }

  // ========== CHECK 2: ¿Contiene números verificables? ==========
  const numerosEnRespuesta = respuesta.match(/\b\d+([.,]\d+)?\b/g) || [];

  if (numerosEnRespuesta.length > 0) {
    // Extraer números de documentos
    const numerosEnDocs = documentos
      .flatMap((doc) => doc.contenido.match(/\b\d+([.,]\d+)?\b/g) || [])
      .map((n) => n.replace(",", "."));

    const numerosSospechosos = numerosEnRespuesta.filter((num) => {
      const normalizado = num.replace(",", ".");
      // Permitir números estándar de índice como [DOCUMENTO 1] o fechas lógicas
      if (normalizado === "1" || normalizado === "2" || normalizado === "3" || normalizado === "4" || normalizado === "5") return false;
      return !numerosEnDocs.includes(normalizado);
    });

    if (numerosSospechosos.length > 0) {
      problemas.push(`NÚMEROS_NO_VERIFICADOS: ${numerosSospechosos.slice(0, 3).join(", ")}`);
      score -= 25;
    }
  }

  // ========== CHECK 3: ¿Usa lenguaje especulativo? ==========
  const palabrasEspeculativas = [
    "probablemente",
    "posiblemente",
    "quizás",
    "quizas",
    "podría",
    "podria",
    "aparentemente",
    "se cree que",
    "supuestamente",
  ];

  const tieneEspeculacion = palabrasEspeculativas.some((palabra) =>
    respuesta.toLowerCase().includes(palabra)
  );

  if (tieneEspeculacion && documentos.length > 0) {
    advertencias.push(
      "Contiene lenguaje especulativo (probablemente, quizás, etc.)"
    );
    score -= 5;
  }

  // ========== CHECK 4: ¿Rechaza preguntas sin documentos? ==========
  const tieneNegativa =
    respuesta.includes("no está") ||
    respuesta.includes("no tengo") ||
    respuesta.includes("no disponible") ||
    respuesta.includes("no encontr") ||
    respuesta.includes("no se ha encontrado");

  if (documentos.length === 0 && !tieneNegativa) {
    problemas.push("RESPONDE SIN DOCUMENTOS");
    score -= 50;
  }

  // ========== CHECK 5: ¿Tiene disclaimer de confianza? ==========
  const tieneDisclaimer =
    respuesta.includes("NIVEL DE CONFIANZA") ||
    respuesta.includes("CONFIANZA:") ||
    respuesta.includes("FUENTES CITADAS");

  if (!tieneDisclaimer && documentos.length > 0) {
    advertencias.push("Falta disclaimer de confianza");
    score -= 8;
  }

  // ========== CHECK 6: ¿Respuesta es muy corta (posible falta de contenido)? ==========
  if (respuesta.length < 40 && documentos.length > 0) {
    advertencias.push("Respuesta muy corta (posible contenido insuficiente)");
    score -= 5;
  }

  // ========== CHECK 7: ¿Respuesta es realista en longitud? ==========
  const longitudDocumentos = documentos.reduce(
    (sum, doc) => sum + doc.contenido.length,
    0
  );

  if (respuesta.length > longitudDocumentos * 2 && longitudDocumentos > 0) {
    advertencias.push("Respuesta extremadamente larga comparada con los documentos");
    score -= 10;
  }

  // ========== RESULTADO FINAL ==========
  const valida = score >= 55 && problemas.length === 0;

  return {
    valida,
    score: Math.max(0, Math.min(100, score)),
    problemas,
    advertencias,
  };
}

/**
 * Obtiene recomendación basada en score
 */
export function obtenerRecomendacion(score: number): string {
  if (score >= 90) return "✅ Respuesta altamente verídica y documentada";
  if (score >= 70) return "⚠️ Respuesta confiable con observaciones leves";
  if (score >= 50) return "⚠️ Respuesta sospechosa, auditar antes de divulgar";
  return "❌ Respuesta no confiable, bloqueada";
}
