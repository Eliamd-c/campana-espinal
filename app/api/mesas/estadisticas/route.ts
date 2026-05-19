import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/api/errors";

export async function GET(req: NextRequest) {
  try {
    // Agrupar contactos por puesto y mesa
    const stats = await prisma.contacto.groupBy({
      by: ["puesto_votacion", "mesa_numero"],
      _count: {
        _all: true
      },
      where: {
        puesto_votacion: { not: null, notIn: ["ERROR", "FALLECIDO", "EN_PROCESO"] },
        mesa_numero: { not: null, notIn: ["ERR"] },
        OR: [
          { municipio: { in: ["El Espinal", "Espinal"], mode: "insensitive" } },
          { municipio: null }
        ]
      }
    });

    // Organizar los datos en una estructura jerárquica
    const puestosMap: Record<string, any> = {};

    stats.forEach(stat => {
      const puesto = stat.puesto_votacion || "No asignado";
      const mesa = stat.mesa_numero || "N/A";
      const count = stat._count._all;

      if (!puestosMap[puesto]) {
        puestosMap[puesto] = {
          nombre: puesto,
          direccion: "Dirección cargada por Registraduría", // En el futuro esto vendría de una tabla Puestos
          mesas: []
        };
      }

      puestosMap[puesto].mesas.push({
        numero: mesa,
        contactos: count,
        meta: 50 // Meta arbitraria por mesa para visualización
      });
    });

    const data = Object.values(puestosMap).sort((a, b) => a.nombre.localeCompare(b.nombre));

    return NextResponse.json({ data });
  } catch (error) {
    return handleError(error, "GET /api/mesas/estadisticas");
  }
}
