import {
  proveedoresDisponibles,
  convieneRelevar,
  registrarRelevo,
  type Proveedor,
} from "./proveedor";
import { ErrorIA } from "./generar";
import { logger } from "@/lib/logger";

/**
 * Bucle de agente con herramientas, para cualquiera de los dos proveedores.
 *
 * Es la parte donde Gemini y OpenAI menos se parecen: uno llama a las
 * herramientas con `functionCall` y devuelve los resultados como turnos del
 * usuario; el otro usa `tool_calls` con identificadores y un rol `tool`
 * propio. Aquí dentro se mantiene una conversación neutra y se traduce al
 * formato de cada uno en el momento de llamar, para que el resto del sistema
 * no tenga que saber con quién está hablando.
 *
 * El proveedor se decide una vez y se mantiene durante todo el bucle. Cambiar
 * a mitad obligaría a traducir una conversación que ya arrastra llamadas y
 * resultados del otro formato; si el primero falla en el primer intento, se
 * empieza de cero con el segundo, que es más simple y más fácil de razonar.
 */

const MODELOS: Record<Proveedor, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
};

const MAX_ITERACIONES = 5;

export interface DefinicionHerramienta {
  name: string;
  description: string;
  parameters: { type: string; properties?: Record<string, unknown>; required?: string[] };
}

/** Turno de la conversación, sin forma de ningún proveedor. */
export interface TurnoNeutro {
  rol: "usuario" | "modelo";
  texto?: string;
  llamadas?: Array<{ id: string; nombre: string; argumentos: Record<string, unknown> }>;
  resultados?: Array<{ id: string; nombre: string; resultado: unknown }>;
}

export interface PeticionAgente {
  pregunta: string;
  historial: TurnoNeutro[];
  herramientas: DefinicionHerramienta[];
  ejecutar: (nombre: string, argumentos: Record<string, unknown>) => Promise<string>;
  /** Si se pasa, la respuesta final llega token a token. */
  onToken?: (t: string) => void;
}

function normalizarHerramientas(defs: DefinicionHerramienta[]) {
  return defs.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: t.parameters.type,
      properties: t.parameters.properties ?? {},
      required: t.parameters.required ?? [],
    },
  }));
}

// ── Traducción a cada proveedor ────────────────────────────────────────────

/** Expuesta para poder probar la traducción, que es la parte frágil. */
export function aFormatoGemini(turnos: TurnoNeutro[]) {
  return turnos.map((t) => {
    const parts: unknown[] = [];

    if (t.texto) parts.push({ text: t.texto });

    for (const ll of t.llamadas ?? []) {
      parts.push({ functionCall: { name: ll.nombre, args: ll.argumentos } });
    }
    for (const r of t.resultados ?? []) {
      parts.push({ functionResponse: { name: r.nombre, response: r.resultado } });
    }

    return { role: t.rol === "modelo" ? "model" : "user", parts };
  });
}

/** Expuesta para poder probar la traducción, que es la parte frágil. */
export function aFormatoOpenAI(turnos: TurnoNeutro[]) {
  const mensajes: unknown[] = [];

  for (const t of turnos) {
    if (t.resultados?.length) {
      // OpenAI exige un mensaje propio por cada resultado, atado por id a la
      // llamada que lo pidió.
      for (const r of t.resultados) {
        mensajes.push({
          role: "tool",
          tool_call_id: r.id,
          content: typeof r.resultado === "string" ? r.resultado : JSON.stringify(r.resultado),
        });
      }
      continue;
    }

    if (t.llamadas?.length) {
      mensajes.push({
        role: "assistant",
        content: t.texto ?? null,
        tool_calls: t.llamadas.map((ll) => ({
          id: ll.id,
          type: "function",
          function: { name: ll.nombre, arguments: JSON.stringify(ll.argumentos) },
        })),
      });
      continue;
    }

    mensajes.push({ role: t.rol === "modelo" ? "assistant" : "user", content: t.texto ?? "" });
  }

  return mensajes;
}

// ── Una vuelta del bucle, por proveedor ────────────────────────────────────

interface Vuelta {
  texto: string;
  llamadas: Array<{ id: string; nombre: string; argumentos: Record<string, unknown> }>;
}

class FalloAgente extends Error {
  constructor(
    readonly status: number,
    readonly cuerpo: string,
  ) {
    super(`El proveedor respondió ${status}`);
  }
}

async function turnoGemini(
  turnos: TurnoNeutro[],
  herramientas: DefinicionHerramienta[],
  apiKey: string,
): Promise<Vuelta> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELOS.gemini}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: aFormatoGemini(turnos),
        tools: [{ functionDeclarations: normalizarHerramientas(herramientas) }],
      }),
    },
  );

  const cuerpo = await res.text();
  if (!res.ok) throw new FalloAgente(res.status, cuerpo);

  const partes = JSON.parse(cuerpo)?.candidates?.[0]?.content?.parts ?? [];

  return {
    texto: partes.map((p: { text?: string }) => p.text ?? "").join(""),
    llamadas: partes
      .filter((p: { functionCall?: unknown }) => p.functionCall)
      .map((p: any, i: number) => ({
        // Gemini no da identificadores; se fabrican para que el formato
        // neutro sirva igual con los dos proveedores.
        id: `gemini-${i}-${p.functionCall.name}`,
        nombre: p.functionCall.name,
        argumentos: p.functionCall.args ?? {},
      })),
  };
}

async function turnoOpenAI(
  turnos: TurnoNeutro[],
  herramientas: DefinicionHerramienta[],
  apiKey: string,
): Promise<Vuelta> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODELOS.openai,
      temperature: 0,
      messages: aFormatoOpenAI(turnos),
      tools: normalizarHerramientas(herramientas).map((t) => ({ type: "function", function: t })),
    }),
  });

  const cuerpo = await res.text();
  if (!res.ok) throw new FalloAgente(res.status, cuerpo);

  const mensaje = JSON.parse(cuerpo)?.choices?.[0]?.message;

  return {
    texto: mensaje?.content ?? "",
    llamadas: (mensaje?.tool_calls ?? []).map((c: any) => {
      let argumentos: Record<string, unknown> = {};
      try {
        argumentos = JSON.parse(c.function?.arguments || "{}");
      } catch {
        // Argumentos ilegibles: se ejecuta sin ellos y que la herramienta se
        // queje, en vez de tumbar la conversación entera.
      }
      return { id: c.id, nombre: c.function?.name, argumentos };
    }),
  };
}

// ── Bucle ──────────────────────────────────────────────────────────────────

async function ejecutarBucle(
  p: PeticionAgente,
  proveedor: Proveedor,
  apiKey: string,
): Promise<string> {
  const turnos: TurnoNeutro[] = [...p.historial, { rol: "usuario", texto: p.pregunta }];

  let respuestaFinal = "";
  let herramientasUsadas = 0;
  const inicio = Date.now();

  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const vuelta =
      proveedor === "openai"
        ? await turnoOpenAI(turnos, p.herramientas, apiKey)
        : await turnoGemini(turnos, p.herramientas, apiKey);

    if (vuelta.texto) respuestaFinal = vuelta.texto;

    if (vuelta.llamadas.length === 0) {
      logger.info("[agente] El modelo dio su respuesta final", {
        proveedor,
        iteraciones: i + 1,
        herramientas: herramientasUsadas,
        ms: Date.now() - inicio,
      });
      break;
    }

    herramientasUsadas += vuelta.llamadas.length;

    const resultados = await Promise.all(
      vuelta.llamadas.map(async (ll) => {
        try {
          const bruto = await p.ejecutar(ll.nombre, ll.argumentos);
          let valor: unknown;
          try {
            valor = JSON.parse(bruto);
          } catch {
            valor = { rawResponse: bruto };
          }
          return { id: ll.id, nombre: ll.nombre, resultado: valor };
        } catch (error: any) {
          logger.error("[agente] Falló una herramienta", { herramienta: ll.nombre });
          // El fallo vuelve al modelo como dato: así puede explicarlo o
          // probar otra cosa, en vez de cortarse el bucle en seco.
          return {
            id: ll.id,
            nombre: ll.nombre,
            resultado: { error: error?.message ?? "Error ejecutando la herramienta." },
          };
        }
      }),
    );

    turnos.push({ rol: "modelo", texto: vuelta.texto || undefined, llamadas: vuelta.llamadas });
    turnos.push({ rol: "usuario", resultados });
  }

  /**
   * El texto final se entrega de golpe cuando quien llama quiere streaming.
   *
   * Emitirlo token a token obligaría a decidir, mientras llegan los trozos,
   * si el modelo está respondiendo o pidiendo otra herramienta; en un bucle
   * con herramientas eso se resuelve al cerrar la respuesta. Es peor
   * experiencia que ver escribir al modelo, pero es correcto: nunca se pinta
   * un texto que luego resulte ser una llamada a función.
   */
  if (p.onToken && respuestaFinal) p.onToken(respuestaFinal);

  return respuestaFinal || "No se pudo generar una respuesta.";
}

export async function ejecutarAgente(p: PeticionAgente): Promise<string> {
  const intentos = await proveedoresDisponibles("analisis");

  if (intentos.length === 0) {
    throw new ErrorIA(
      "No hay ninguna clave de IA configurada. Añade la de Gemini o la de OpenAI en Configuración.",
      "SIN_CLAVE",
    );
  }

  let ultimoFallo: FalloAgente | null = null;

  for (let i = 0; i < intentos.length; i++) {
    const { proveedor, apiKey } = intentos[i];

    try {
      return await ejecutarBucle(p, proveedor, apiKey);
    } catch (error) {
      if (!(error instanceof FalloAgente)) throw error;

      ultimoFallo = error;
      const siguiente = intentos[i + 1];

      if (siguiente && convieneRelevar(error.status, error.cuerpo)) {
        registrarRelevo("analisis", proveedor, siguiente.proveedor, `HTTP ${error.status}`);
        continue;
      }
      break;
    }
  }

  const sinCupo = ultimoFallo && convieneRelevar(ultimoFallo.status, ultimoFallo.cuerpo);

  throw new ErrorIA(
    sinCupo
      ? "Los servicios de IA configurados no tienen crédito disponible."
      : "El servicio de IA no respondió correctamente.",
    sinCupo ? "SIN_CUPO" : "FALLO_SERVICIO",
  );
}
