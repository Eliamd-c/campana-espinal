import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/lineas
 * Devuelve todas las líneas con su estado actual desde la BD.
 * El worker-wwebjs.ts actualiza el estado directamente cuando conecta/desconecta.
 */
export async function GET() {
  try {
    const lineas = await prisma.lineaWhatsapp.findMany({
      orderBy: { id: "asc" },
    });
    return NextResponse.json({ success: true, data: lineas });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/lineas
 * Crea una nueva línea en la BD.
 * El worker la detectará en el próximo arranque y creará un cliente Chrome para ella.
 */
export async function POST(req: NextRequest) {
  try {
    const { nombre } = await req.json();
    if (!nombre) {
      return NextResponse.json({ success: false, error: "Nombre requerido" }, { status: 400 });
    }

    const nuevaLinea = await prisma.lineaWhatsapp.create({
      data: { nombre, estado: "desconectado" },
    });

    return NextResponse.json({
      success: true,
      data: nuevaLinea,
      message: "Línea creada. Reinicia el worker para que aparezca el QR.",
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/lineas
 * Actualiza el proxy u otros campos de una línea.
 */
export async function PUT(req: NextRequest) {
  try {
    const { id, proxyUrl, nombre, limite_diario } = await req.json();
    if (!id) {
      return NextResponse.json({ success: false, error: "ID requerido" }, { status: 400 });
    }

    const data: any = {};
    if (proxyUrl !== undefined) data.proxyUrl = proxyUrl || null;
    if (nombre !== undefined) data.nombre = nombre;
    if (limite_diario !== undefined) data.limite_diario = limite_diario;

    const linea = await prisma.lineaWhatsapp.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: linea });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
