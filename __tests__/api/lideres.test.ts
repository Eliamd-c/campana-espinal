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

describe("API Lideres", () => {
  it("rechaza a quien no ha iniciado sesion", async () => {
    const r = await request(baseUrl).get("/api/lideres");
    expect(r.status).toBe(401);
  });

  it("no permite crear lideres sin sesion", async () => {
    const r = await request(baseUrl)
      .post("/api/lideres")
      .send({ nombre: "Intruso", telefono: "3000000000", barrio: "Centro" });
    expect(r.status).toBe(401);
  });

  conSesion()("GET /api/lideres devuelve la lista con sesion", async () => {
    const r = await request(baseUrl).get("/api/lideres").set("Cookie", cookie!);
    expect(r.status).toBe(200);
  });

  conSesion()("POST /api/lideres crea un lider con datos validos", async () => {
    const r = await request(baseUrl)
      .post("/api/lideres")
      .set("Cookie", cookie!)
      .send({ nombre: "Lider de Prueba", telefono: "3000000000", barrio: "Centro" });
    expect(r.status).toBe(201);
    expect(r.body.data.nombre).toBe("Lider de Prueba");
  });

  conSesion()("POST /api/lideres falla si falta el telefono", async () => {
    const r = await request(baseUrl)
      .post("/api/lideres")
      .set("Cookie", cookie!)
      .send({ nombre: "Incompleto" });
    expect(r.status).toBe(400);
  });
});
