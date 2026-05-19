import { describe, it, expect } from "vitest";
import request from "supertest";

const baseUrl = "http://localhost:3000";

describe("API Líderes", () => {
  it("GET /api/lideres debe retornar lista de líderes", async () => {
    const response = await request(baseUrl).get("/api/lideres");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("POST /api/lideres debe crear un líder con datos válidos", async () => {
    const response = await request(baseUrl)
      .post("/api/lideres")
      .send({
        nombre: "Líder de Prueba",
        telefono: "3000000000",
        barrio: "Centro"
      });

    expect(response.status).toBe(201);
    expect(response.body.data.nombre).toBe("Líder de Prueba");
  });

  it("POST /api/lideres debe fallar si falta el teléfono", async () => {
    const response = await request(baseUrl)
      .post("/api/lideres")
      .send({ nombre: "Incompleto" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Datos de líder inválidos");
  });
});
