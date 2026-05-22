import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nombre, categoria, bloques, descripcion } = body;

    const previewTexto = bloques[0]?.config?.contenido?.substring(0, 100) || "Plantilla sin texto";

    const plantilla = await prisma.messageTemplate.create({
      data: {
        nombre,
        categoria,
        bloques,
        descripcion,
        creada_por: "admin", // O sacar de la sesión si hay auth
        preview_texto: previewTexto,
      },
    });

    return NextResponse.json({ success: true, data: plantilla });
  } catch (error: any) {
    console.error("Error guardando plantilla builder:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const categoria = searchParams.get("categoria");

    const plantillas = await prisma.messageTemplate.findMany({
      where: categoria ? { categoria } : undefined,
      select: { id: true, nombre: true, categoria: true, veces_usada: true, esPublica: true, bloques: true },
      orderBy: { fecha_creada: 'desc' }
    });

    return NextResponse.json({ success: true, data: plantillas });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
