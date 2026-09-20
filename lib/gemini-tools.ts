import { ejecutarHerramienta } from "./ia-tools";
import { ejecutarAgente, type TurnoNeutro, type DefinicionHerramienta } from "./ia/agente";

/**
 * Agente de Inteligencia Electoral con llamada a herramientas.
 *
 * El bucle vive ahora en `lib/ia/agente.ts` y sirve tanto para Gemini como
 * para OpenAI; este archivo se queda como adaptador, porque las rutas le
 * pasan el historial ya con forma de Gemini. El nombre del archivo se
 * conserva para no tocar a quien lo importa, pero de Gemini ya solo queda
 * como una opción más.
 */

interface HistorialGemini {
  role: "user" | "model";
  parts: Array<{ text?: string; functionCall?: any; functionResponse?: any }>;
}

/**
 * El historial que llega de las rutas es solo texto: la memoria del chat
 * guarda lo dicho, no las llamadas a herramientas de conversaciones
 * anteriores. Se traduce a turnos neutros quedándose con eso.
 */
function aTurnosNeutros(historial: HistorialGemini[]): TurnoNeutro[] {
  return historial.map((h) => ({
    rol: h.role === "model" ? ("modelo" as const) : ("usuario" as const),
    texto: h.parts.map((p) => p.text ?? "").join(""),
  }));
}

const INSTRUCCIONES = `Eres el Analista Electoral de la Campaña El Espinal.

Usa las herramientas disponibles para consultar la base de datos y obtener respuestas exactas.
Si necesitas datos para responder, usa las herramientas. Si ya tienes la respuesta o la pregunta es un saludo/agradecimiento, responde directamente.
IMPORTANTE: ejecutar_consulta_sql es de SOLO LECTURA (SELECT sobre las tablas de la campana). Nunca pidas claves al usuario: no existe forma de modificar datos por SQL. Si te piden crear o cambiar registros, usa las herramientas especificas; si no hay ninguna para eso, dilo con claridad en vez de intentarlo con SQL.`;

function armarPregunta(pregunta: string): string {
  return `${INSTRUCCIONES}\n\nPregunta actual: "${pregunta}"`;
}

export async function generarConHerramientasV2(
  pregunta: string,
  historial: HistorialGemini[],
  toolDefinitions: DefinicionHerramienta[]
): Promise<string> {
  return ejecutarAgente({
    pregunta: armarPregunta(pregunta),
    historial: aTurnosNeutros(historial),
    herramientas: toolDefinitions,
    ejecutar: (nombre, argumentos) => ejecutarHerramienta(nombre, argumentos),
  });
}

/**
 * Igual que la anterior, pero avisando del texto final por `onToken`.
 *
 * La respuesta llega de una vez, no token a token: en un bucle con
 * herramientas no se sabe si lo que empieza a llegar es la respuesta o una
 * llamada a función hasta que el turno se cierra. Se prefiere tardar un poco
 * más en pintar a pintar un texto que luego resulte no ser la respuesta.
 */
export async function generarConHerramientasV2Stream(
  pregunta: string,
  historial: HistorialGemini[],
  toolDefinitions: DefinicionHerramienta[],
  onToken: (token: string) => void
): Promise<string> {
  return ejecutarAgente({
    pregunta: armarPregunta(pregunta),
    historial: aTurnosNeutros(historial),
    herramientas: toolDefinitions,
    ejecutar: (nombre, argumentos) => ejecutarHerramienta(nombre, argumentos),
    onToken,
  });
}
