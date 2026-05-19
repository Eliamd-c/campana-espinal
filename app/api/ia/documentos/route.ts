import { NextRequest, NextResponse } from "next/server";
import { guardarDocumento, listarDocumentos, eliminarDocumento, dividirEnFragmentos } from "@/lib/embeddings";

// GET — Listar todos los documentos
export async function GET() {
  try {
    const docs = await listarDocumentos();
    return NextResponse.json({ data: docs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — Subir y vectorizar un documento nuevo
export async function POST(req: NextRequest) {
  try {
    const { titulo, contenido, categoria, metadata } = await req.json();

    if (!titulo || !contenido) {
      return NextResponse.json({ error: "Faltan título y contenido" }, { status: 400 });
    }

    // Si el documento es largo, lo dividimos en fragmentos
    const LIMITE_FRAGMENTO = 800; // palabras por fragmento
    const palabras = contenido.split(/\s+/).length;
    let idsCreados: number[] = [];

    if (palabras > LIMITE_FRAGMENTO) {
      const fragmentos = dividirEnFragmentos(contenido, LIMITE_FRAGMENTO, 100);
      for (let i = 0; i < fragmentos.length; i++) {
        const id = await guardarDocumento(
          `${titulo} (Parte ${i + 1}/${fragmentos.length})`,
          fragmentos[i],
          categoria || "general",
          { ...metadata, fragmento: i + 1, total_fragmentos: fragmentos.length }
        );
        idsCreados.push(id);
      }
    } else {
      const id = await guardarDocumento(titulo, contenido, categoria || "general", metadata || {});
      idsCreados = [id];
    }

    return NextResponse.json({
      success: true,
      message: `Documento vectorizado en ${idsCreados.length} fragmento(s)`,
      ids: idsCreados
    });
  } catch (error: any) {
    console.error("Error vectorizando documento:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — Eliminar un documento
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Falta el ID" }, { status: 400 });
    await eliminarDocumento(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
