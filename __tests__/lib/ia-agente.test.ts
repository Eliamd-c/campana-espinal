import { describe, it, expect } from "vitest";
import { aFormatoGemini, aFormatoOpenAI, type TurnoNeutro } from "@/lib/ia/agente";

/**
 * La conversación se guarda en un formato neutro y se traduce al de cada
 * proveedor justo antes de llamar. Si esa traducción se tuerce, el agente no
 * falla de golpe: pierde el hilo, repite herramientas o responde sin mirar
 * los datos. Por eso se prueba aparte.
 */
const conversacion: TurnoNeutro[] = [
  { rol: "usuario", texto: "cuantos lideres hay" },
  {
    rol: "modelo",
    llamadas: [{ id: "call_1", nombre: "contar_lideres", argumentos: { barrio: "San José" } }],
  },
  {
    rol: "usuario",
    resultados: [{ id: "call_1", nombre: "contar_lideres", resultado: { total: 12 } }],
  },
];

describe("aFormatoGemini", () => {
  it("usa functionCall y devuelve los resultados como turno del usuario", () => {
    const [pregunta, llamada, resultado] = aFormatoGemini(conversacion) as any[];

    expect(pregunta).toEqual({ role: "user", parts: [{ text: "cuantos lideres hay" }] });
    expect(llamada.role).toBe("model");
    expect(llamada.parts[0].functionCall).toEqual({
      name: "contar_lideres",
      args: { barrio: "San José" },
    });
    expect(resultado.role).toBe("user");
    expect(resultado.parts[0].functionResponse).toEqual({
      name: "contar_lideres",
      response: { total: 12 },
    });
  });
});

describe("aFormatoOpenAI", () => {
  it("ata cada resultado a su llamada por id y usa el rol tool", () => {
    const [pregunta, llamada, resultado] = aFormatoOpenAI(conversacion) as any[];

    expect(pregunta).toEqual({ role: "user", content: "cuantos lideres hay" });

    expect(llamada.role).toBe("assistant");
    expect(llamada.tool_calls[0].id).toBe("call_1");
    // OpenAI exige los argumentos como texto JSON, no como objeto.
    expect(llamada.tool_calls[0].function.arguments).toBe('{"barrio":"San José"}');

    expect(resultado.role).toBe("tool");
    expect(resultado.tool_call_id).toBe("call_1");
    expect(resultado.content).toBe('{"total":12}');
  });

  it("saca un mensaje por cada resultado, no uno con todos dentro", () => {
    const mensajes = aFormatoOpenAI([
      {
        rol: "usuario",
        resultados: [
          { id: "a", nombre: "uno", resultado: { x: 1 } },
          { id: "b", nombre: "dos", resultado: { y: 2 } },
        ],
      },
    ]) as any[];

    expect(mensajes).toHaveLength(2);
    expect(mensajes.map((m) => m.tool_call_id)).toEqual(["a", "b"]);
  });

  it("no envuelve en JSON un resultado que ya es texto", () => {
    const [mensaje] = aFormatoOpenAI([
      { rol: "usuario", resultados: [{ id: "a", nombre: "uno", resultado: "12 lideres" }] },
    ]) as any[];

    expect(mensaje.content).toBe("12 lideres");
  });
});
