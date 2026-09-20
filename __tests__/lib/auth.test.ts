import { describe, test, expect, vi, beforeAll } from "vitest";
import bcrypt from "bcryptjs";

/**
 * El control de acceso al panel de campaña. Si alguno de estos tests deja de
 * pasar, hay una vía de entrada al padrón de votantes.
 */

const usuarioDePrueba = {
  id: "u1",
  name: "Coordinadora",
  username: "coordinadora",
  email: null,
  role: "coordinador",
  activo: true,
  passwordHash: bcrypt.hashSync("Clave-Real-2026", 10),
};

const findUnique = vi.fn();
const update = vi.fn().mockResolvedValue({});

vi.mock("../../lib/db", () => ({
  default: { user: { findUnique: (...a: any[]) => findUnique(...a), update: (...a: any[]) => update(...a) } },
}));
vi.mock("@/lib/db", () => ({
  default: { user: { findUnique: (...a: any[]) => findUnique(...a), update: (...a: any[]) => update(...a) } },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../../lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

let autorizar: (c: any) => Promise<any>;

/**
 * Reimporta `lib/auth` saltandose la cache de modulos. El sufijo de query es
 * lo que fuerza la reevaluacion; la ruta se arma en una variable porque
 * TypeScript no resuelve un especificador literal con query.
 */
function reimportarAuth(marca: string): Promise<unknown> {
  const ruta = `../../lib/auth?${marca}`;
  return import(/* @vite-ignore */ ruta);
}

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET = require("crypto").randomBytes(32).toString("base64");
  const { authOptions } = await import("../../lib/auth");
  const proveedor: any = authOptions.providers[0];
  autorizar = (c) => proveedor.options.authorize(c, {} as any);
});

describe("acceso al panel", () => {
  test("rechaza las credenciales que estaban escritas en el código", async () => {
    findUnique.mockResolvedValue(null);
    expect(await autorizar({ username: "admin", password: "admin123" })).toBeNull();
    expect(await autorizar({ username: "coordinador", password: "coord123" })).toBeNull();
  });

  test("rechaza a un usuario inexistente", async () => {
    findUnique.mockResolvedValue(null);
    expect(await autorizar({ username: "quienquiera", password: "loquesea" })).toBeNull();
  });

  test("rechaza una contraseña incorrecta", async () => {
    findUnique.mockResolvedValue(usuarioDePrueba);
    expect(await autorizar({ username: "coordinadora", password: "otra-cosa" })).toBeNull();
  });

  test("rechaza a un usuario desactivado aunque acierte la contraseña", async () => {
    findUnique.mockResolvedValue({ ...usuarioDePrueba, activo: false });
    expect(await autorizar({ username: "coordinadora", password: "Clave-Real-2026" })).toBeNull();
  });

  test("rechaza a un usuario sin contraseña asignada", async () => {
    findUnique.mockResolvedValue({ ...usuarioDePrueba, passwordHash: null });
    expect(await autorizar({ username: "coordinadora", password: "" })).toBeNull();
  });

  test("rechaza credenciales vacías", async () => {
    findUnique.mockResolvedValue(usuarioDePrueba);
    expect(await autorizar({ username: "", password: "" })).toBeNull();
    expect(await autorizar({})).toBeNull();
  });

  test("acepta las credenciales correctas y devuelve el rol de la base", async () => {
    findUnique.mockResolvedValue(usuarioDePrueba);
    const r = await autorizar({ username: "coordinadora", password: "Clave-Real-2026" });
    expect(r).toMatchObject({ id: "u1", role: "coordinador" });
  });

  test("no devuelve el hash de la contraseña en la sesión", async () => {
    findUnique.mockResolvedValue(usuarioDePrueba);
    const r = await autorizar({ username: "coordinadora", password: "Clave-Real-2026" });
    expect(JSON.stringify(r)).not.toContain("$2a$");
  });
});

describe("secreto de firma de sesión", () => {
  test("la aplicación no arranca sin NEXTAUTH_SECRET", async () => {
    vi.resetModules();
    const previo = process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    await expect(reimportarAuth("sin-secreto")).rejects.toThrow(/NEXTAUTH_SECRET/);
    process.env.NEXTAUTH_SECRET = previo;
  });

  test("rechaza un secreto demasiado corto para ser seguro", async () => {
    vi.resetModules();
    const previo = process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_SECRET = "corto";
    await expect(reimportarAuth("secreto-corto")).rejects.toThrow(/NEXTAUTH_SECRET/);
    process.env.NEXTAUTH_SECRET = previo;
  });

  test("rechaza una frase escrita a mano aunque sea larga", async () => {
    vi.resetModules();
    const previo = process.env.NEXTAUTH_SECRET;
    // 37 caracteres, pero solo 20 distintos: se rompe fuera de linea.
    process.env.NEXTAUTH_SECRET = "mi_clave_secreta_para_la_campana_2026";
    await expect(reimportarAuth("frase")).rejects.toThrow(/NEXTAUTH_SECRET/);
    process.env.NEXTAUTH_SECRET = previo;
  });

  test("acepta un secreto aleatorio de 32 bytes en base64", async () => {
    vi.resetModules();
    const previo = process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_SECRET = require("crypto").randomBytes(32).toString("base64");
    await expect(reimportarAuth("aleatorio")).resolves.toBeTruthy();
    process.env.NEXTAUTH_SECRET = previo;
  });
});
