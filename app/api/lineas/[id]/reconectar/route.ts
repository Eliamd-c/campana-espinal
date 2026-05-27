import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import Redis from "ioredis";

/**
 * POST /api/lineas/[id]/reconectar
 *
 * 1. Limpia el QR anterior y marca la línea como "desconectado" en BD
 * 2. Publica "reconectar:<id>" en el canal Redis "wwebjs:cmd"
 * 3. El worker-wwebjs.ts lo recibe en <1 segundo y reinicializa el cliente Chrome
 * 4. El cliente genera un nuevo QR → lo guarda en BD → UI lo muestra en 5 seg
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const lineaId = parseInt(params.id, 10);
  if (isNaN(lineaId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    // 1. Limpiar estado en BD
    await prisma.lineaWhatsapp.update({
      where: { id: lineaId },
      data: { estado: "desconectado", qr_actual: null },
    });

    // 2. Señalizar al worker vía Redis pub/sub
    const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });

    await redis.publish("wwebjs:cmd", `reconectar:${lineaId}`);
    await redis.quit();

    return NextResponse.json({
      ok: true,
      message: "Señal enviada al worker. El QR aparecerá en la tarjeta en segundos.",
    });
  } catch (error: any) {
    // Si Redis falla, igual funciona vía health-check del worker (30 seg)
    console.error("[RECONECTAR] Error publicando en Redis:", error.message);
    return NextResponse.json({
      ok: true,
      message: "Reconexión solicitada (sin Redis, usará health-check en 30s).",
    });
  }
}
