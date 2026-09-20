import { describe, it, expect } from "vitest";
import { ImagenPlanillaSchema, MAX_BYTES_IMAGEN_OCR } from "@/lib/validation";

/**
 * Este esquema es lo único que separa a `/api/ocr` de recibir cualquier cosa:
 * antes la ruta aceptaba cualquier data URL, sin tope de tamaño ni lista de
 * formatos. Si estas comprobaciones se aflojan, vuelve el agujero.
 */
describe("ImagenPlanillaSchema", () => {
  const jpeg = (relleno: string) => `data:image/jpeg;base64,${relleno}`;

  it("acepta un JPEG normal", () => {
    expect(ImagenPlanillaSchema.safeParse({ imagenUrl: jpeg("/9j/4AAQSkZJRg==") }).success).toBe(true);
  });

  it("acepta png y webp", () => {
    for (const tipo of ["png", "webp"]) {
      const r = ImagenPlanillaSchema.safeParse({ imagenUrl: `data:image/${tipo};base64,AAAA` });
      expect(r.success).toBe(true);
    }
  });

  it("rechaza formatos que Gemini no lee como imagen", () => {
    for (const url of [
      "data:image/svg+xml;base64,AAAA",
      "data:application/pdf;base64,AAAA",
      "data:text/html;base64,AAAA",
      "https://ejemplo.com/planilla.jpg",
    ]) {
      expect(ImagenPlanillaSchema.safeParse({ imagenUrl: url }).success).toBe(false);
    }
  });

  it("rechaza una imagen por encima del tope de bytes", () => {
    const enorme = jpeg("A".repeat(MAX_BYTES_IMAGEN_OCR));
    expect(ImagenPlanillaSchema.safeParse({ imagenUrl: enorme }).success).toBe(false);
  });

  it("rechaza un cuerpo sin imagen", () => {
    expect(ImagenPlanillaSchema.safeParse({}).success).toBe(false);
    expect(ImagenPlanillaSchema.safeParse(null).success).toBe(false);
  });
});
