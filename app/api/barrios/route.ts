import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const contactos = await prisma.contacto.findMany({
      select: { barrio: true },
      distinct: ['barrio'],
      where: {
        barrio: { not: null, notIn: ["", " "] }
      }
    });

    const barrios = contactos
      .map(c => c.barrio)
      .filter(Boolean)
      .sort();

    return NextResponse.json({ data: barrios });
  } catch (error: any) {
    console.error("[API Barrios] Error:", error.message);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
