import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * La configuración vive en base de datos, así que se sustituye por un mapa.
 * Lo que se prueba aquí es la decisión -a quién se llama y en qué orden-, no
 * de dónde salen los valores.
 */
const valores: Record<string, string | null> = {};

vi.mock("@/lib/configuracion", () => ({
  obtenerConfig: async (clave: string) => valores[clave] ?? null,
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: () => {}, info: () => {}, error: () => {} },
}));

const { proveedoresDisponibles, convieneRelevar } = await import("@/lib/ia/proveedor");

beforeEach(() => {
  for (const k of Object.keys(valores)) delete valores[k];
});

describe("proveedoresDisponibles", () => {
  it("pone primero al proveedor por defecto y deja al otro de respaldo", async () => {
    valores.PROVEEDOR_IA = "openai";
    valores.OPENAI_API_KEY = "sk-x";
    valores.GEMINI_API_KEY = "g-x";

    const intentos = await proveedoresDisponibles("ocr");
    expect(intentos.map((i) => i.proveedor)).toEqual(["openai", "gemini"]);
  });

  it("el ajuste del módulo manda sobre el general", async () => {
    valores.PROVEEDOR_IA = "gemini";
    valores.PROVEEDOR_IA_OCR = "openai";
    valores.OPENAI_API_KEY = "sk-x";
    valores.GEMINI_API_KEY = "g-x";

    const intentos = await proveedoresDisponibles("ocr");
    expect(intentos[0].proveedor).toBe("openai");
  });

  it("«auto» en el módulo sigue al general", async () => {
    valores.PROVEEDOR_IA = "openai";
    valores.PROVEEDOR_IA_OCR = "auto";
    valores.OPENAI_API_KEY = "sk-x";
    valores.GEMINI_API_KEY = "g-x";

    const intentos = await proveedoresDisponibles("ocr");
    expect(intentos[0].proveedor).toBe("openai");
  });

  it("descarta al proveedor sin clave en vez de intentarlo igual", async () => {
    valores.PROVEEDOR_IA = "gemini";
    valores.OPENAI_API_KEY = "sk-x";
    // Sin clave de Gemini, aunque sea el preferido.

    const intentos = await proveedoresDisponibles("ocr");
    expect(intentos.map((i) => i.proveedor)).toEqual(["openai"]);
  });

  it("trata «dummy_key» como si no hubiera clave", async () => {
    valores.GEMINI_API_KEY = "dummy_key";
    valores.OPENAI_API_KEY = "sk-x";

    const intentos = await proveedoresDisponibles("agenda");
    expect(intentos.map((i) => i.proveedor)).toEqual(["openai"]);
  });

  it("devuelve vacío si no hay ninguna clave", async () => {
    expect(await proveedoresDisponibles("analisis")).toEqual([]);
  });

  it("cada módulo decide por su cuenta", async () => {
    valores.PROVEEDOR_IA = "gemini";
    valores.PROVEEDOR_IA_OCR = "openai";
    valores.OPENAI_API_KEY = "sk-x";
    valores.GEMINI_API_KEY = "g-x";

    expect((await proveedoresDisponibles("ocr"))[0].proveedor).toBe("openai");
    expect((await proveedoresDisponibles("agenda"))[0].proveedor).toBe("gemini");
  });
});

describe("convieneRelevar", () => {
  it("releva cuando el problema es de cupo, clave o servicio caído", () => {
    for (const status of [429, 401, 403, 500, 503]) {
      expect(convieneRelevar(status)).toBe(true);
    }
  });

  it("reconoce el agotamiento aunque venga en el cuerpo", () => {
    expect(convieneRelevar(400, '{"error":{"status":"RESOURCE_EXHAUSTED"}}')).toBe(true);
    expect(convieneRelevar(400, '{"error":{"code":"insufficient_quota"}}')).toBe(true);
  });

  it("no releva una petición mal construida: fallaría igual en el otro", () => {
    expect(convieneRelevar(400, '{"error":{"message":"invalid image format"}}')).toBe(false);
    expect(convieneRelevar(404)).toBe(false);
  });
});
