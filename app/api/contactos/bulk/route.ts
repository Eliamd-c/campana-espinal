import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/api/errors";
import { invalidarTodoDashboard } from "@/lib/cache-strategies";

/**
 * Acciones masivas sobre contactos
 * POST /api/contactos/bulk
 * Body: { action: 'delete' | 'update', ids: string[], data?: any }
 */
export async function POST(req: NextRequest) {
  try {
    const { action, ids, data } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No se proporcionaron IDs de contactos" }, { status: 400 });
    }

    if (action === 'delete') {
      const result = await prisma.contacto.deleteMany({
        where: { cedula: { in: ids } }
      });
      
      // Invalidar cache de dashboard de forma reactiva
      await invalidarTodoDashboard();
      
      return NextResponse.json({ message: "Contactos eliminados", count: result.count });
    }

    if (action === 'update') {
      const result = await prisma.contacto.updateMany({
        where: { cedula: { in: ids } },
        data: data
      });
      
      // Invalidar cache de dashboard de forma reactiva
      await invalidarTodoDashboard();
      
      return NextResponse.json({ message: "Contactos actualizados", count: result.count });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });

  } catch (error) {
    return handleError(error, "POST /api/contactos/bulk");
  }
}
