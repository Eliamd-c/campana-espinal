import { describe, test, expect } from "vitest";
import { reconocerMedio, TAMANO_MAXIMO } from "../../lib/media";

/**
 * El tipo de un archivo subido se decide por su contenido, nunca por la
 * extensión ni por el `Content-Type`: los dos los elige quien sube. Sin esta
 * comprobación, un HTML con JavaScript renombrado a `.png` entraba en el
 * almacenamiento de la campaña y se servía desde su dominio.
 */

function bytes(...valores: number[]): Uint8Array {
  return new Uint8Array(valores);
}

/** Rellena hasta `n` bytes para simular un archivo real. */
function conRelleno(cabecera: number[], n = 64): Uint8Array {
  const b = new Uint8Array(n);
  b.set(cabecera, 0);
  return b;
}

describe("reconocimiento de medios por contenido", () => {
  test("reconoce los formatos admitidos", () => {
    expect(reconocerMedio(conRelleno([0xff, 0xd8, 0xff, 0xe0]))?.tipo).toBe("image/jpeg");
    expect(reconocerMedio(conRelleno([0x89, 0x50, 0x4e, 0x47]))?.tipo).toBe("image/png");
    expect(reconocerMedio(conRelleno([0x47, 0x49, 0x46, 0x38]))?.tipo).toBe("image/gif");
    expect(reconocerMedio(conRelleno([0x1a, 0x45, 0xdf, 0xa3]))?.tipo).toBe("video/webm");
    expect(reconocerMedio(conRelleno([0x4f, 0x67, 0x67, 0x53]))?.tipo).toBe("audio/ogg");
  });

  test("reconoce WEBP y MP4, cuya marca va desplazada", () => {
    const webp = conRelleno([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(reconocerMedio(webp)?.tipo).toBe("image/webp");

    const mp4 = conRelleno([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]);
    expect(reconocerMedio(mp4)?.tipo).toBe("video/mp4");
  });

  test("rechaza un HTML renombrado como si fuera imagen", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(reconocerMedio(html)).toBeNull();
  });

  test("rechaza un script y un ejecutable", () => {
    expect(reconocerMedio(new TextEncoder().encode("#!/bin/sh\nrm -rf /"))).toBeNull();
    // Cabecera de ejecutable de Windows.
    expect(reconocerMedio(conRelleno([0x4d, 0x5a]))).toBeNull();
  });

  test("rechaza un SVG, que puede llevar JavaScript dentro", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(reconocerMedio(svg)).toBeNull();
  });

  test("rechaza un archivo vacío o demasiado corto para tener firma", () => {
    expect(reconocerMedio(bytes())).toBeNull();
    expect(reconocerMedio(bytes(0xff))).toBeNull();
  });

  test("no se deja engañar por una firma que aparece más adelante", () => {
    // PNG válido solo si la firma está al principio.
    const tramposo = new Uint8Array(64);
    tramposo.set([0x89, 0x50, 0x4e, 0x47], 20);
    expect(reconocerMedio(tramposo)).toBeNull();
  });

  test("el tope de tamaño es el mismo que el del bucket", () => {
    expect(TAMANO_MAXIMO).toBe(25 * 1024 * 1024);
  });
});
