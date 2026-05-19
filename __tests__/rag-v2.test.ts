/* eslint-disable @typescript-eslint/no-unused-vars */
declare let describe: any;
declare let test: any;
declare let expect: any;

import { buscarDocumentosUltra } from "@/lib/rag-hybrid-search-v2";
import { validarPreguntaRAG } from "@/lib/rag-validator";
import { validarRespuestaRAG } from "@/lib/rag-post-validator";

describe("RAG v2 - Motor de Seguridad 5 Capas", () => {
  // Test 1: Búsqueda funciona
  test("buscarDocumentosUltra maneja búsquedas correctamente", async () => {
    const documentos = await buscarDocumentosUltra(
      "¿Cuál es la propuesta de educación para El Espinal?",
      3
    );

    expect(Array.isArray(documentos)).toBe(true);
    if (documentos.length > 0) {
      expect(documentos[0]).toHaveProperty("titulo");
      expect(documentos[0]).toHaveProperty("relevancia");
      expect(documentos[0]).toHaveProperty("confianza");
    }
  });

  // Test 2: Validación rechaza si no hay docs
  test("validarPreguntaRAG rechaza si la lista de documentos está vacía", async () => {
    const resultado = await validarPreguntaRAG(
      "¿Cosas aleatorias que no existen?",
      []
    );

    expect(resultado.valida).toBe(false);
    expect(resultado.razon).toBe("NO_HAY_DOCUMENTOS");
  });

  // Test 3: Validación post-respuesta
  test("validarRespuestaRAG detecta respuestas sin citas o disclaimer", async () => {
    const respuesta = "La propuesta educativa aumentará los presupuestos a un billón de pesos.";
    const documentos = [
      {
        id: 1,
        titulo: "Propuesta Educación",
        contenido: "La inversión escolar de la alcaldía ascenderá a 500 millones.",
        categoria: "educacion",
        fuente: "Programa de Gobierno",
        fecha_creacion: new Date(),
      },
    ];

    const resultado = await validarRespuestaRAG(respuesta, documentos);

    // Debe penalizar fuertemente por no citar y por inventar números no presentes en el documento
    expect(resultado.score).toBeLessThan(70);
    expect(resultado.valida).toBe(false);
    expect(resultado.problemas.some((p) => p.includes("NO_CITA_DOCUMENTOS") || p.includes("NÚMEROS_NO_VERIFICADOS"))).toBe(true);
  });

  // Test 4: Respuesta válida pasa validación
  test("validarRespuestaRAG aprueba respuestas citadas correctamente con cifras reales", async () => {
    const respuesta = `
      Según [DOCUMENTO 1 - Propuesta Educación], la inversión escolar de la alcaldía ascenderá a 500 millones para el censo de 2026.
      
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      📚 FUENTES CITADAS:
      • [DOCUMENTO 1] - Propuesta Educación
      
      ⭐ NIVEL DE CONFIANZA: ALTA
      Razón: Cifras oficiales citadas de manera explícita.
    `;

    const documentos = [
      {
        id: 1,
        titulo: "Propuesta Educación",
        contenido: "La inversión escolar de la alcaldía ascenderá a 500 millones en 2026.",
        categoria: "educacion",
        fuente: "Programa de Gobierno",
        fecha_creacion: new Date(),
      },
    ];

    const resultado = await validarRespuestaRAG(respuesta, documentos);

    expect(resultado.score).toBeGreaterThanOrEqual(70);
    expect(resultado.problemas.length).toBe(0);
    expect(resultado.valida).toBe(true);
  });
});
