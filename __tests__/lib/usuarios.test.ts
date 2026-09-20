import { describe, test, expect } from "vitest";
import { revisarFortaleza, normalizarUsuario, esRolValido } from "../../lib/usuarios";

/**
 * Estas reglas son la puerta del panel que muestra 5.985 cédulas. Valen lo
 * mismo desde el script de consola que desde la pantalla de administración,
 * porque ambas llaman aquí.
 */

describe("fortaleza de la contraseña", () => {
  test("rechaza las que son demasiado cortas", () => {
    expect(revisarFortaleza("Corta123")).not.toBeNull();
  });

  test("exige mezclar mayúsculas, minúsculas y números", () => {
    expect(revisarFortaleza("todominusculas")).not.toBeNull();
    expect(revisarFortaleza("TODOMAYUSCULAS")).not.toBeNull();
    expect(revisarFortaleza("SinNumerosAqui")).not.toBeNull();
  });

  test("rechaza las palabras evidentes del contexto de la campaña", () => {
    for (const mala of [
      "Admin12345678",
      "CampanaEspinal2026",
      "Password123456",
      "Contrasena12345",
    ]) {
      expect(revisarFortaleza(mala)).not.toBeNull();
    }
  });

  test("rechaza que la contraseña contenga el propio usuario", () => {
    expect(revisarFortaleza("Coordinadora2026X", "coordinadora")).not.toBeNull();
  });

  test("rechaza un solo carácter repetido", () => {
    expect(revisarFortaleza("aaaaaaaaaaaaaaa")).not.toBeNull();
  });

  test("acepta una contraseña razonable", () => {
    expect(revisarFortaleza("Tolima7Rondon4Sol", "coordinadora")).toBeNull();
  });
});

describe("normalización del nombre de usuario", () => {
  /**
   * Sin normalizar, `Admin` y `admin` serían cuentas distintas: revocar una
   * dejaría la otra viva, que es justo lo que no puede pasar cuando alguien
   * deja el equipo.
   */
  test("iguala mayúsculas y espacios", () => {
    expect(normalizarUsuario("  Admin ")).toBe("admin");
    expect(normalizarUsuario("Coordinadora")).toBe("coordinadora");
  });
});

describe("roles", () => {
  test("solo admite los dos roles previstos", () => {
    expect(esRolValido("admin")).toBe(true);
    expect(esRolValido("coordinador")).toBe(true);
    expect(esRolValido("superadmin")).toBe(false);
    expect(esRolValido("")).toBe(false);
    expect(esRolValido(null)).toBe(false);
  });
});
