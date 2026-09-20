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

describe("API Eventos", () => {
  it("rechaza a quien no ha iniciado sesion", async () => {
    const r = await request(baseUrl).get("/api/eventos");
    expect(r.status).toBe(401);
  });

  conSesion()("GET /api/eventos devuelve 200 con sesion", async () => {
    const r = await request(baseUrl).get("/api/eventos").set("Cookie", cookie!);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
  });

  conSesion()("POST /api/eventos valida las fechas", async () => {
    const r = await request(baseUrl)
      .post("/api/eventos")
      .set("Cookie", cookie!)
      .send({
        titulo: "Evento Test",
        tipo: "mitin",
        fecha_inicio: "invalid-date",
        fecha_fin: "2026-05-20",
        lugar: "Parque Central",
      });
    expect(r.status).toBe(400);
  });

  conSesion()("POST /api/eventos crea un evento con datos validos", async () => {
    const r = await request(baseUrl)
      .post("/api/eventos")
      .set("Cookie", cookie!)
      .send({
        titulo: "Gran Mitin",
        tipo: "mitin",
        fecha_inicio: "2026-06-01T10:00:00Z",
        fecha_fin: "2026-06-01T12:00:00Z",
        lugar: "Plaza Principal",
        asistentes_esperados: 100,
      });
    expect(r.status).toBe(201);
    expect(r.body.data.titulo).toBe("Gran Mitin");
  });
});
