export function crearPromptRAG(
  pregunta: string,
  documentos: Array<{
    titulo: string;
    contenido: string;
    categoria: string;
  }>
): string {
  const contexto = documentos
    .map(
      (doc) => `
**Documento: ${doc.titulo}** (${doc.categoria})
${doc.contenido}
---`
    )
    .join("\n");

  return `Eres el Analista Electoral y de Datos de la Campaña de El Espinal. Tu trabajo es dar respuestas precisas y profesionales basadas en la documentación oficial disponible de la campaña.

INFORMACIÓN DE CONTEXTO DISPONIBLE:
${contexto}

PREGUNTA DEL USUARIO:
"${pregunta}"

INSTRUCCIONES CRÍTICAS:
1. Responde de forma clara y estructurada basándote ÚNICAMENTE en la información de contexto proporcionada arriba.
2. Si la información necesaria para responder la pregunta no está en el contexto, indica explícitamente: "No he encontrado información relevante en los documentos oficiales de campaña para responder esta pregunta."
3. Sé extremadamente preciso con cifras, porcentajes, nombres y fechas. No asumas ni inventes ningún dato.
4. Cita las fuentes exactas (títulos de los documentos de contexto) que utilizaste para elaborar tu respuesta.

RESPUESTA DETALLADA (Cita las fuentes al final):`;
}
