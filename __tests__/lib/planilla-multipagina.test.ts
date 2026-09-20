import { describe, it, expect } from "vitest";
import { ArchivoPlanillaSchema, MAX_BYTES_PDF_OCR, MAX_BYTES_IMAGEN_OCR } from "@/lib/validation";
import { fusionarRegistros, RegistroEscaneado } from "@/lib/ocr";

const campo = (valor: string, confianza: number) => ({ valor, confianza });

const registro = (
  cedula: string,
  nombre: string,
  confianza = 90
): RegistroEscaneado => ({
  cedula: campo(cedula, confianza),
  nombre: campo(nombre, confianza),
  telefono: campo("", 0),
  barrio: campo("", 0),
});

describe("ArchivoPlanillaSchema", () => {
  it("acepta un PDF de escáner", () => {
    const r = ArchivoPlanillaSchema.safeParse({ imagenUrl: "data:application/pdf;base64,JVBERi0=" });
    expect(r.success).toBe(true);
  });

  it("sigue aceptando imágenes", () => {
    const r = ArchivoPlanillaSchema.safeParse({ imagenUrl: "data:image/jpeg;base64,/9j/4AAQ" });
    expect(r.success).toBe(true);
  });

  it("aplica a cada tipo su propio tope de tamaño", () => {
    // Una imagen del tamaño que se le permite a un PDF debe rechazarse: el
    // margen extra es solo para el PDF, que no se puede reducir en cliente.
    const imagenEnorme = `data:image/jpeg;base64,${"A".repeat(MAX_BYTES_IMAGEN_OCR)}`;
    expect(ArchivoPlanillaSchema.safeParse({ imagenUrl: imagenEnorme }).success).toBe(false);

    const pdfAceptable = `data:application/pdf;base64,${"A".repeat(MAX_BYTES_IMAGEN_OCR)}`;
    expect(ArchivoPlanillaSchema.safeParse({ imagenUrl: pdfAceptable }).success).toBe(true);

    const pdfEnorme = `data:application/pdf;base64,${"A".repeat(MAX_BYTES_PDF_OCR)}`;
    expect(ArchivoPlanillaSchema.safeParse({ imagenUrl: pdfEnorme }).success).toBe(false);
  });

  it("rechaza formatos que no son ni imagen ni PDF", () => {
    for (const url of ["data:text/html;base64,AAAA", "data:application/zip;base64,AAAA"]) {
      expect(ArchivoPlanillaSchema.safeParse({ imagenUrl: url }).success).toBe(false);
    }
  });
});

describe("fusionarRegistros", () => {
  it("junta las páginas en un solo listado", () => {
    const salida = fusionarRegistros([
      [registro("111111", "Ana")],
      [registro("222222", "Beto")],
    ]);
    expect(salida).toHaveLength(2);
  });

  it("descarta la hoja repetida y se queda con la lectura más fiable", () => {
    const salida = fusionarRegistros([
      [registro("111111", "Ana Borrosa", 40)],
      [registro("111111", "Ana Clara", 95)],
    ]);

    expect(salida).toHaveLength(1);
    expect(salida[0].nombre.valor).toBe("Ana Clara");
  });

  it("no agrupa las filas sin cédula, porque no hay con qué identificarlas", () => {
    const salida = fusionarRegistros([
      [registro("", "Sin cédula uno")],
      [registro("", "Sin cédula dos")],
    ]);
    expect(salida).toHaveLength(2);
  });

  it("devuelve vacío si ninguna página trajo registros", () => {
    expect(fusionarRegistros([])).toEqual([]);
    expect(fusionarRegistros([[], []])).toEqual([]);
  });
});
