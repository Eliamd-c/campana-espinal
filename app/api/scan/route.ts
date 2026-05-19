import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimiters } from "@/lib/ratelimit";
import { ScanSchema } from "@/lib/validation";
import { handleError } from "@/lib/api/errors";

// POST /api/scan
export async function POST(req: NextRequest) {
  try {
    // ✅ Rate Limiting
    const ip = req.ip || "unknown";
    const { success, remaining } = await checkRateLimit(rateLimiters.scan, ip);
    if (!success) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes de escaneo" },
        { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
      );
    }

    const body = await req.json();
    const parsed = ScanSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos de escaneo inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Tesseract se ejecuta en el cliente (browser) por ahora.
    // Este endpoint está preparado para recibir y procesar en el futuro.
    
    return NextResponse.json({
      message: "El OCR se procesa en el cliente. Endpoint listo para escalado server-side.",
      remaining,
    });
  } catch (error) {
    return handleError(error, "POST /api/scan");
  }
}
