import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";

// Usamos el puerto por defecto de Next.js en desarrollo
const baseUrl = "http://localhost:3000";

describe("API Contactos", () => {
  it("GET /api/contactos debe retornar 200", async () => {
    // Nota: El servidor debe estar corriendo para este test
    // O podemos mockear el handler, pero por ahora probamos conectividad básica
    const response = await request(baseUrl)
      .get("/api/contactos")
      .query({ limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.data).toBeDefined();
  });

  it("POST /api/contactos debe validar datos inválidos", async () => {
    const response = await request(baseUrl)
      .post("/api/contactos")
      .send({ cedula: "123" }); // Cédula muy corta según validation.ts

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Datos de contacto inválidos");
  });
});
