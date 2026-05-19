import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "API Campaña El Espinal",
      version: "1.0.0",
      description: "API para gestión de campaña política",
    },
    servers: [
      { url: "http://localhost:3000", description: "Desarrollo" },
      { url: "https://campana-espinal.com", description: "Producción" },
    ],
    components: {
      schemas: {
        Contacto: {
          type: "object",
          required: ["cedula"],
          properties: {
            cedula: { type: "string", example: "12345678" },
            nombre: { type: "string", example: "Juan Pérez" },
            telefono: { type: "string", example: "3001234567" },
            barrio: { type: "string", example: "Centro" },
            intencion_voto: {
              type: "string",
              enum: ["positivo", "negativo", "indeciso", "desconocido"],
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
            code: { type: "string" },
            errorId: { type: "string" },
          },
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./app/api/**/*.ts"], // Rutas a escanear para comentarios JSDoc
};

export const spec = swaggerJsdoc(options);
