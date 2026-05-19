import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/campanas
export async function GET() {
  try {
    const campanas = await prisma.campana.findMany({
      orderBy: { fecha_creado: "desc" },
      include: {
        _count: {
          select: { mensajes: true }
        }
      }
    });

    return NextResponse.json({ data: campanas });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
