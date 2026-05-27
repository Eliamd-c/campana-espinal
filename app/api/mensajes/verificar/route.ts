import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * POST /api/mensajes/verificar
 *
 * Recibe la lista de cédulas + manuales y devuelve cuántos ya fueron
 * contactados exitosamente en campañas anteriores.
 *
 * Body: { cedulas: string[], manuales: [{ telefono: string }] }
 * Response: { total, ya_contactados, sin_contactar }
 */
export async function POST(req: NextRequest) {
  try {
    const { cedulas = [], manuales = [] } = await req.json();

    // Calcular cédulas de los contactos manuales (igual que en /api/mensajes/enviar)
    const cedulasManuales: string[] = (manuales as { telefono: string }[]).map(m => {
      const telLimpio = m.telefono.replace(/\D/g, "");
      return `M-${telLimpio.slice(-10)}`;
    });

    const todasCedulas: string[] = [...cedulas, ...cedulasManuales];

    if (todasCedulas.length === 0) {
      return NextResponse.json({ total: 0, ya_contactados: 0, sin_contactar: 0 });
    }

    // Buscar cuáles ya recibieron un mensaje exitoso en cualquier campaña anterior
    const yaContactados = await prisma.mensaje.findMany({
      where: {
        contacto_cedula: { in: todasCedulas },
        estado: { in: ["enviado", "entregado", "leido"] },
      },
      select: { contacto_cedula: true },
      distinct: ["contacto_cedula"],
    });

    const contactados = yaContactados.length;

    return NextResponse.json({
      total:          todasCedulas.length,
      ya_contactados: contactados,
      sin_contactar:  todasCedulas.length - contactados,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
