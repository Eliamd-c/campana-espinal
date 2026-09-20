import request from "supertest";

/**
 * Apoyo para los tests de integración de la API.
 *
 * Estos tests golpean un servidor real. Desde que existe `middleware.ts`, toda
 * ruta de `/api` exige sesión, así que hay dos clases de comprobación:
 *
 *  - Que la ruta rechaza a quien no ha entrado. Se puede comprobar siempre y
 *    es la que protege el padrón de votantes: si alguna vez devuelve 200, hay
 *    una fuga.
 *  - Que la ruta hace su trabajo para quien sí ha entrado. Necesita un usuario
 *    de prueba en la base, así que se omite si no está configurado.
 *
 * Para ejecutar el segundo grupo: crea un usuario con `npm run usuario:crear`
 * y exporta `TEST_USER` y `TEST_PASSWORD` antes de lanzar los tests.
 */

export const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";

/** `set-cookie` llega como lista, como cadena suelta o ausente segun el caso. */
function normalizarCookies(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor as string[];
  if (typeof valor === "string") return [valor];
  return [];
}

/** ¿Hay un servidor escuchando? Si no, los tests de integración se omiten. */
export async function hayServidor(): Promise<boolean> {
  try {
    await request(baseUrl).get("/api/auth/csrf").timeout(3000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inicia sesión y devuelve la cookie, o `null` si no hay credenciales de
 * prueba configuradas.
 */
export async function cookieDeSesion(): Promise<string | null> {
  const usuario = process.env.TEST_USER;
  const clave = process.env.TEST_PASSWORD;
  if (!usuario || !clave) return null;

  const csrf = await request(baseUrl).get("/api/auth/csrf");
  const cookiesCsrf = normalizarCookies(csrf.headers["set-cookie"]);
  const token = csrf.body?.csrfToken;

  const login = await request(baseUrl)
    .post("/api/auth/callback/credentials")
    .set("Cookie", cookiesCsrf.join("; "))
    .type("form")
    .send({ username: usuario, password: clave, csrfToken: token, json: "true" });

  const cookies = [
    ...cookiesCsrf,
    ...normalizarCookies(login.headers["set-cookie"]),
  ]
    .map((c) => c.split(";")[0])
    .join("; ");

  return cookies.includes("session-token") ? cookies : null;
}
