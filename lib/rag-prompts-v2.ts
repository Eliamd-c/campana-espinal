interface DocumentoParaPrompt {
  titulo: string;
  contenido: string;
  categoria: string;
  fuente: string;
}

/**
 * PROMPT ESTRICTO Y EXPLÍCITO
 * Le dice claramente a la IA:
 * - SOLO responder con documentos
 * - CITAR las fuentes
 * - Decir "no sé" si no está en documentos
 */
export function crearPromptRAGEstrict(
  pregunta: string,
  documentos: DocumentoParaPrompt[]
): string {
  const contexto = documentos
    .map(
      (doc, idx) => `
[DOCUMENTO ${idx + 1}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Título: ${doc.titulo}
Categoría: ${doc.categoria}
Fuente: ${doc.fuente}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${doc.contenido}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .join("\n\n");

  return `ERES UN ASISTENTE ANALÍTICO ESTRICTO Y RIGUROSO.

Tu ÚNICO trabajo es responder preguntas usando EXCLUSIVAMENTE la información 
en los DOCUMENTOS que se proporcionan a continuación.

════════════════════════════════════════════════════════════════════════════
DOCUMENTOS DISPONIBLES (${documentos.length} documentos)
════════════════════════════════════════════════════════════════════════════

${contexto}

════════════════════════════════════════════════════════════════════════════
PREGUNTA DEL USUARIO
════════════════════════════════════════════════════════════════════════════

"${pregunta}"

════════════════════════════════════════════════════════════════════════════
⚠️ INSTRUCCIONES CRÍTICAS - DEBES CUMPLIRLAS AL 100%
════════════════════════════════════════════════════════════════════════════

1. 📍 RESPONDE SOLO CON INFORMACIÓN DE LOS DOCUMENTOS
   • Si la respuesta NO está en los documentos, DEBES decir: 
     "Esta información no está disponible en los documentos."
   • NO INVENTES NI SUPONGAS información

2. 📌 CITA EXACTAMENTE DE DÓNDE SACAS CADA DATO
   • Usa este formato: "Según [DOCUMENTO X], ..."
   • Menciona el TÍTULO del documento para claridad
   • Ejemplo: "Según [DOCUMENTO 2 - Plan de Educación], la inversión fue $500K"

3. 🔢 PARA NÚMEROS Y DATOS ESPECÍFICOS, SÉ EXACTO
   • No redondees: Si dice "1.234", no escribas "~1000"
   • Si hay un rango, menciona el rango completo
   • Ejemplo: "El documento especifica 1.234 votantes, no aproximadamente 1000"

4. ❌ NUNCA INVENTES
   • No añadas fechas que no estén en los documentos
   • No supongas números basado en patrones
   • No "interpoles" datos

5. ⚖️ SI HAY INFORMACIÓN CONTRADICTORIA
   • Menciona AMBAS versiones
   • Di cuál documento dice qué
   • Ejemplo: "[DOC 1] dice 500, pero [DOC 2] dice 600"

6. ⏰ INDICA CUÁNDO LA INFORMACIÓN ES ANTIGUA
   • Si un documento tiene > 6 meses, mencionalo
   • Ejemplo: "Según un documento de 2024, ..."

7. 🤔 SI NO ESTÁS 100% SEGURO
   • Expresa la duda claramente
   • Ejemplo: "El documento sugiere que..., pero no es explícito"
   • MEJOR: "El documento no proporciona esa información específicamente"

8. 📏 LIMITA TU RESPUESTA
   • Máximo 3 párrafos
   • Ve directo al punto
   • Evita divagaciones

════════════════════════════════════════════════════════════════════════════
📋 FORMATO DE RESPUESTA REQUERIDO
════════════════════════════════════════════════════════════════════════════

[Tu respuesta aquí, citando documentos]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 FUENTES CITADAS:
• [DOCUMENTO X] - Cita específica del documento
• [DOCUMENTO Y] - Cita específica del documento

⭐ NIVEL DE CONFIANZA: [ALTA / MEDIA / BAJA]
Razón: [Explica por qué]

════════════════════════════════════════════════════════════════════════════

Ahora, responde siguiendo estas instrucciones AL PIE DE LA LETRA:`;
}

/**
 * Prompt alternativo si NO hay documentos suficientes
 * (Para cuando falla la validación)
 */
export function crearPromptRechazo(
  razon: string,
  detalles?: string
): string {
  const mensajes: Record<string, string> = {
    NO_HAY_DOCUMENTOS:
      "No encontré documentos relevantes en la base de datos para esta pregunta.",
    CONFIANZA_INSUFICIENTE:
      "Los documentos encontrados no son lo suficientemente relevantes o específicos.",
    DOCUMENTOS_INCONSISTENTES:
      "Los documentos disponibles tienen información contradictoria.",
    PREGUNTA_MUY_VAGA:
      "Tu pregunta es demasiado genérica. Intenta ser más específico.",
  };

  return `${mensajes[razon] || "No puedo responder esta pregunta."}${
    detalles ? `\n\nDetalles: ${detalles}` : ""
  }`;
}
