import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const lineas = await prisma.lineaWhatsapp.findMany({
      orderBy: { id: "asc" }
    });
    return NextResponse.json({ success: true, data: lineas });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { nombre } = await req.json();
    const nuevaLinea = await prisma.lineaWhatsapp.create({
      data: { nombre }
    });

    // Notificar al bot local para que inicie esta línea
    try {
      await fetch("http://localhost:3002/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineaId: nuevaLinea.id })
      });
    } catch (e) {
      console.warn("No se pudo sincronizar con el bot. Asegúrate de que npm run bot está corriendo.");
    }

    return NextResponse.json({ success: true, data: nuevaLinea });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
