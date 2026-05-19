import { describe, it, expect } from "vitest";
import request from "supertest";

const baseUrl = "http://localhost:3000";

describe("API Eventos", () => {
  it("GET /api/eventos debe retornar 200", async () => {
    const response = await request(baseUrl).get("/api/eventos");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("POST /api/eventos debe validar fechas correctamente", async () => {
    const response = await request(baseUrl)
      .post("/api/eventos")
      .send({
        titulo: "Evento Test",
        tipo: "mitin",
        fecha_inicio: "invalid-date",
        fecha_fin: "2026-05-20",
        lugar: "Parque Central"
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Datos de evento inválidos");
  });

  it("POST /api/eventos debe crear evento con datos válidos", async () => {
    const response = await request(baseUrl)
      .post("/api/eventos")
      .send({
        titulo: "Gran Mitin",
        tipo: "mitin",
        fecha_inicio: "2026-06-01T10:00:00Z",
        fecha_fin: "2026-06-01T12:00:00Z",
        lugar: "Plaza Principal",
        asistentes_esperados: 100
      });

    expect(response.status).toBe(201);
    expect(response.body.data.titulo).toBe("Gran Mitin");
  });
});
