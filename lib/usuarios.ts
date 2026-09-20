import bcrypt from "bcryptjs";
import prisma from "@/lib/db";

/**
 * Reglas de gestión de usuarios del panel.
 *
 * Están aquí y no en las rutas para que la exigencia de contraseña sea la
 * misma venga de donde venga: del script de consola, del cambio de
 * contraseña propio o del alta que hace un administrador.
 */

/** Coste de bcrypt. 12 es el equilibrio habitual hoy entre seguridad y espera. */
export const COSTE_BCRYPT = 12;

export const ROLES = ["admin", "coordinador"] as const;
export type Rol = (typeof ROLES)[number];

/**
 * Comprueba que una contraseña tiene sentido para proteger el padrón
 * electoral. No es una política caprichosa: el login ya tiene freno de fuerza
 * bruta, pero una contraseña adivinable se rompe igual desde otro sitio.
 */
export function revisarFortaleza(clave: string, usuario?: string): string | null {
  if (clave.length < 12) {
    return "Debe tener al menos 12 caracteres.";
  }
  if (clave.length > 200) {
    return "Es demasiado larga.";
  }
  if (!/[a-z]/.test(clave) || !/[A-Z]/.test(clave) || !/\d/.test(clave)) {
    return "Debe combinar minúsculas, mayúsculas y números.";
  }
  if (usuario && clave.toLowerCase().includes(usuario.toLowerCase())) {
    return "No puede contener el nombre de usuario.";
  }
  const evidentes = [
    "admin", "123456", "password", "contrasena", "contraseña",
    "campana", "campaña", "espinal", "qwerty", "iloveyou",
  ];
  if (evidentes.some((p) => clave.toLowerCase().includes(p))) {
    return "No puede contener palabras evidentes como 'admin', 'campaña' o '123456'.";
  }
  /** Una sola letra repetida, o secuencias triviales. */
  if (/^(.)\1+$/.test(clave)) {
    return "No puede ser un mismo carácter repetido.";
  }
  return null;
}

/** Normaliza el nombre de usuario: sin espacios y en minúsculas. */
export function normalizarUsuario(usuario: string): string {
  return usuario.trim().toLowerCase();
}

export function esRolValido(rol: unknown): rol is Rol {
  return typeof rol === "string" && (ROLES as readonly string[]).includes(rol);
}

/** Cambia la contraseña de un usuario, exigiendo la actual. */
export async function cambiarPropiaContrasena(
  idUsuario: string,
  actual: string,
  nueva: string
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const registro = await prisma.user.findUnique({ where: { id: idUsuario } });

  if (!registro || !registro.passwordHash) {
    return { ok: false, motivo: "No se pudo verificar la contraseña actual." };
  }

  /**
   * Se exige la actual aunque haya sesión: si alguien deja el panel abierto,
   * quien pase por delante no puede apropiarse de la cuenta cambiándola.
   */
  const coincide = await bcrypt.compare(actual, registro.passwordHash);
  if (!coincide) {
    return { ok: false, motivo: "La contraseña actual no es correcta." };
  }

  if (actual === nueva) {
    return { ok: false, motivo: "La nueva contraseña debe ser distinta de la actual." };
  }

  const problema = revisarFortaleza(nueva, registro.username ?? undefined);
  if (problema) {
    return { ok: false, motivo: problema };
  }

  await prisma.user.update({
    where: { id: idUsuario },
    data: {
      passwordHash: await bcrypt.hash(nueva, COSTE_BCRYPT),
      // Cambiar la contraseña cierra las sesiones abiertas, incluida la
      // propia: si alguien había robado la cookie, deja de servirle.
      tokenVersion: { increment: 1 },
    },
  });

  return { ok: true };
}
