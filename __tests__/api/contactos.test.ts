import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { baseUrl, cookieDeSesion } from "./helpers";

/**
 * Tests de integracion contra un servidor en marcha.
 *
 * Desde el hallazgo #1, toda ruta de /api exige sesion. Lo primero que se
 * comprueba es justo eso; la logica de negocio solo se ejercita si hay
 * credenciales de prueba (TEST_USER / TEST_PASSWORD).
 */
let cookie: string | null = null;
beforeAll(async () => {
  cookie = await cookieDeSesion();
});
const conSesion = () => (cookie ? it : it.skip);

describe("API Contactos", () => {
  it("rechaza a quien no ha iniciado sesion", async () => {
    const r = await request(baseUrl).get("/api/contactos").query({ limit: 10 });
    expect(r.status).toBe(401);
  });

  it("no filtra datos de votantes sin sesion", async () => {
    const r = await request(baseUrl).get("/api/contactos").query({ limit: 10 });
    expect(r.body?.data).toBeUndefined();
  });

  conSesion()("GET /api/contactos devuelve 200 con sesion", async () => {
    const r = await request(baseUrl)
      .get("/api/contactos")
      .set("Cookie", cookie!)
      .query({ limit: 10 });
    expect(r.status).toBe(200);
    expect(r.body.data).toBeDefined();
  });

  conSesion()("POST /api/contactos valida datos invalidos", async () => {
    const r = await request(baseUrl)
      .post("/api/contactos")
      .set("Cookie", cookie!)
      .send({ cedula: "123" });
    expect(r.status).toBe(400);
  });
});
