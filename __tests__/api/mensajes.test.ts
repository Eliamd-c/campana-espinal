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

describe("API Mensajes", () => {
  it("no permite enviar mensajes masivos sin sesion", async () => {
    const r = await request(baseUrl)
      .post("/api/mensajes/enviar")
      .send({ instancia_id: "test", cedulas: ["12345678"], texto: "Hola {{nombre}}" });
    expect(r.status).toBe(401);
  });

  conSesion()("POST /api/mensajes/enviar valida el esquema con sesion", async () => {
    const r = await request(baseUrl)
      .post("/api/mensajes/enviar")
      .set("Cookie", cookie!)
      .send({});
    expect(r.status).toBe(400);
  });
});
