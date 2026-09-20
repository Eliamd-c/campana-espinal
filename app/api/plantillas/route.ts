import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/api/errors";
import { PlantillaSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  try {
    const plantillas = await prisma.plantillaMensaje.findMany({
      orderBy: { fecha_creada: 'desc' }
    });
    return NextResponse.json({ data: plantillas });
  } catch (error) {
    return handleError(error, "/api/plantillas");
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = PlantillaSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos de plantilla invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Extraer variables del texto ej. {{nombre}}
    const variables: string[] = Array.from(
      new Set(data.texto.match(/{{([^}]+)}}/g) ?? [])
    );
    
    const nuevaPlantilla = await prisma.plantillaMensaje.create({
      data: {
        nombre: data.nombre,
        categoria: data.categoria,
        texto: data.texto,
        variables: variables,
        creada_por: "Sistema" // TODO: usar sesión
      }
    });
    
    return NextResponse.json({ data: nuevaPlantilla });
  } catch (error) {
    // El mensaje de Postgres revela nombres de columnas y restricciones: se
    // registra en el servidor y al cliente se le da algo genérico.
    return handleError(error, "POST /api/plantillas");
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
  } catch (error) {
    return handleError(error, "/api/plantillas");
  }
}
