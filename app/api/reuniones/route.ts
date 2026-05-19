import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { recalcularScoreLider } from "@/lib/score";

// GET /api/reuniones
export async function GET(req: NextRequest) {
  try {
    const reuniones = await prisma.reunion.findMany({
      orderBy: { fecha: "desc" },
      include: {
        lider: { select: { id: true, nombre: true } },
      },
    });

    return NextResponse.json({ data: reuniones });
  } catch (error) {
    console.error("GET /api/reuniones error:", error);
    return NextResponse.json({ error: "Error al obtener reuniones" }, { status: 500 });
  }
}

// POST /api/reuniones
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { titulo, fecha, lugar, lider_id, asistentes } = body;

    if (!titulo || !lider_id) {
      return NextResponse.json({ error: "Título y líder son obligatorios" }, { status: 400 });
    }

    // Process asistentes array (contains cedula, nombre, telefono, etc.)
    let nuevosUnicos = 0;
    let repetidos = 0;

    for (const asistente of asistentes || []) {
      const { cedula, nombre, telefono, barrio } = asistente;
      if (!cedula) continue;

      const existente = await prisma.contacto.findUnique({ where: { cedula } });

      if (existente) {
        repetidos++;
        await prisma.contacto.update({
          where: { cedula },
          data: {
            fecha_ultimo_contacto: new Date(),
            es_nuevo: false,
          },
        });
      } else {
        nuevosUnicos++;
        await prisma.contacto.create({
          data: {
            cedula,
            nombre,
            telefono,
            barrio,
            lider_id: parseInt(lider_id),
            es_nuevo: true,
          },
        });
      }
    }

    const totalAsistentes = nuevosUnicos + repetidos;
    const porcentajeTrasteo = totalAsistentes > 0 ? (repetidos / totalAsistentes) * 100 : 0;
    const alertaTrasteo = porcentajeTrasteo > 60;

    const reunion = await prisma.reunion.create({
      data: {
        titulo,
        fecha: fecha ? new Date(fecha) : new Date(),
        lugar,
        lider_id: parseInt(lider_id),
        total_asistentes: totalAsistentes,
        nuevos_unicos: nuevosUnicos,
        repetidos: repetidos,
        alerta_trasteo: alertaTrasteo,
      },
    });

    // Recalcular el score del líder al final de la reunión
    await recalcularScoreLider(parseInt(lider_id));

    return NextResponse.json({ data: reunion }, { status: 201 });
  } catch (error) {
    console.error("POST /api/reuniones error:", error);
    return NextResponse.json({ error: "Error al crear reunión" }, { status: 500 });
  }
}
