import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";

// Obtener todos los enlaces con sus métricas
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const enlaces = await prisma.enlaceCorto.findMany({
      include: {
        _count: {
          select: { clics: true }
        }
      },
      orderBy: {
        fecha_creado: 'desc'
      }
    });

    return NextResponse.json({ data: enlaces });
  } catch (error) {
    console.error("Error al obtener enlaces:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// Crear un nuevo enlace corto
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { url_original, codigo_personalizado } = await req.json();

    if (!url_original) {
      return NextResponse.json({ error: "La URL original es requerida" }, { status: 400 });
    }

    // Generar código único de 6 caracteres si no se provee uno personalizado
    let codigo = codigo_personalizado;
    if (!codigo) {
      codigo = Math.random().toString(36).substring(2, 8);
    } else {
      // Limpiar y validar código personalizado (solo alfanuméricos)
      codigo = codigo.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
    }

    // Verificar si el código ya existe
    const existente = await prisma.enlaceCorto.findUnique({
      where: { codigo }
    });

    if (existente) {
      return NextResponse.json({ error: "El código ya está en uso" }, { status: 400 });
    }

    const nuevoEnlace = await prisma.enlaceCorto.create({
      data: {
        codigo,
        url_original
      }
    });

    return NextResponse.json({ data: nuevoEnlace }, { status: 201 });
  } catch (error) {
    console.error("Error al crear enlace:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
