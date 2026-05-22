import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const plantillas = await prisma.plantillaMensaje.findMany({
      orderBy: { fecha_creada: 'desc' }
    });
    return NextResponse.json({ data: plantillas });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    
    // Extraer variables del texto ej. {{nombre}}
    const variables = Array.from(new Set(data.texto.match(/{{([^}]+)}}/g) || []));
    
    const nuevaPlantilla = await prisma.plantillaMensaje.create({
      data: {
        nombre: data.nombre,
        categoria: data.categoria || "general",
        texto: data.texto,
        variables: variables,
        creada_por: "Sistema" // TODO: usar sesión
      }
    });
    
    return NextResponse.json({ data: nuevaPlantilla });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    
    await prisma.plantillaMensaje.delete({
      where: { id: parseInt(id) }
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
