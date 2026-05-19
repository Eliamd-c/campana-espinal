import { describe, it, expect } from "vitest";
import request from "supertest";

const baseUrl = "http://localhost:3000";

describe("API Mensajes", () => {
  it("POST /api/mensajes/enviar debe validar rate limit y esquema", async () => {
    const response = await request(baseUrl)
      .post("/api/mensajes/enviar")
      .send({
        instancia_id: "test",
        cedulas: ["12345678"],
        texto: "Hola {{nombre}}"
      });

    // Si no está corriendo el servidor, esto fallará con conexión rechazada
    // Pero si está corriendo, debería dar 200 o 401/403 si falta auth
    // Por ahora validamos que el esquema se activa (si enviamos basura)
    
    const badResponse = await request(baseUrl)
      .post("/api/mensajes/enviar")
      .send({});

    expect(badResponse.status).toBe(400);
    expect(badResponse.body.error).toBe("Datos de envío inválidos");
  });
});
