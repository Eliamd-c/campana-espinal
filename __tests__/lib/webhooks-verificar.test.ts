import { describe, test, expect, vi, beforeEach } from "vitest";
import { verificarSecretoWebhook, esEventoNuevo } from "../../lib/webhooks/verificar";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../../lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

/**
 * Los webhooks son públicos por necesidad: el middleware los deja pasar y
 * esto es lo único que los separa de cualquiera que conozca la URL. Si algún
 * caso de abajo deja de fallar, se pueden inyectar mensajes falsos y disparar
 * respuestas de IA hacia números arbitrarios.
 */

const SECRETO = "K7x9Qm2vLp4TzR8nWd6JfHc3";
const VARIABLE = "TEST_WEBHOOK_SECRET";

/** Petición mínima con la forma que consume el verificador. */
function peticion(cabeceras: Record<string, string> = {}): any {
  const mapa = new Map(
    Object.entries(cabeceras).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    headers: { get: (n: string) => mapa.get(n.toLowerCase()) ?? null },
    nextUrl: { pathname: "/api/whatsapp/webhook" },
    ip: "127.0.0.1",
  };
}

beforeEach(() => {
  process.env[VARIABLE] = SECRETO;
});

describe("verificación de secreto de webhook", () => {
  test("rechaza una petición sin ninguna cabecera", () => {
    expect(verificarSecretoWebhook(peticion(), VARIABLE).ok).toBe(false);
  });

  test("rechaza un secreto incorrecto", () => {
    const r = verificarSecretoWebhook(peticion({ "x-webhook-secret": "otro" }), VARIABLE);
    expect(r.ok).toBe(false);
  });

  test("rechaza un secreto que solo coincide en el prefijo", () => {
    const r = verificarSecretoWebhook(
      peticion({ "x-webhook-secret": SECRETO.slice(0, -1) }),
      VARIABLE
    );
    expect(r.ok).toBe(false);
  });

  test("rechaza una cabecera vacía", () => {
    expect(verificarSecretoWebhook(peticion({ "x-webhook-secret": "" }), VARIABLE).ok).toBe(false);
  });

  test("rechaza cabeceras duplicadas unidas por coma", () => {
    const r = verificarSecretoWebhook(
      peticion({ "x-webhook-secret": `${SECRETO}, ${SECRETO}` }),
      VARIABLE
    );
    expect(r.ok).toBe(false);
  });

  test("acepta el secreto correcto", () => {
    expect(verificarSecretoWebhook(peticion({ "x-webhook-secret": SECRETO }), VARIABLE).ok).toBe(true);
  });

  test("acepta el secreto en cualquiera de las cabeceras admitidas", () => {
    for (const cabecera of ["x-internal-secret", "apikey", "authorization"]) {
      expect(
        verificarSecretoWebhook(peticion({ [cabecera]: SECRETO }), VARIABLE).ok
      ).toBe(true);
    }
  });

  test("acepta el prefijo Bearer", () => {
    const r = verificarSecretoWebhook(
      peticion({ authorization: `Bearer ${SECRETO}` }),
      VARIABLE
    );
    expect(r.ok).toBe(true);
  });
});

describe("configuración del secreto", () => {
  test("rechaza todo si la variable no está definida", () => {
    delete process.env[VARIABLE];
    const r = verificarSecretoWebhook(peticion({ "x-webhook-secret": SECRETO }), VARIABLE);
    expect(r.ok).toBe(false);
  });

  test("rechaza todo si el secreto configurado es demasiado corto", () => {
    process.env[VARIABLE] = "corto";
    const r = verificarSecretoWebhook(peticion({ "x-webhook-secret": "corto" }), VARIABLE);
    expect(r.ok).toBe(false);
  });

  test("rechaza un secreto configurado que es una frase adivinable", () => {
    process.env[VARIABLE] = "webhook_secreto_campana_espinal_2024";
    const r = verificarSecretoWebhook(
      peticion({ "x-webhook-secret": "webhook_secreto_campana_espinal_2024" }),
      VARIABLE
    );
    expect(r.ok).toBe(false);
  });
});

describe("protección contra reenvío de eventos", () => {
  test("el mismo evento solo se procesa una vez", () => {
    const id = `evento-${Math.random()}`;
    expect(esEventoNuevo(id)).toBe(true);
    expect(esEventoNuevo(id)).toBe(false);
    expect(esEventoNuevo(id)).toBe(false);
  });

  test("eventos distintos pasan todos", () => {
    expect(esEventoNuevo(`a-${Math.random()}`)).toBe(true);
    expect(esEventoNuevo(`b-${Math.random()}`)).toBe(true);
  });

  /**
   * Sin identificador no se puede saber si es repetido. Se deja pasar a
   * propósito: rechazar perdería mensajes legítimos de votantes, que es peor
   * que procesar un duplicado.
   */
  test("sin identificador se deja pasar", () => {
    expect(esEventoNuevo(null)).toBe(true);
    expect(esEventoNuevo(undefined)).toBe(true);
    expect(esEventoNuevo("")).toBe(true);
  });
});
