// Comprueba permisos según quién pide: no se puede generar al compilar.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/api/errors";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

type Intencion = "positivo" | "negativo" | "indeciso" | "desconocido";

interface Bloque {
  lideres: number;
  reuniones: number;
  barrios: number;
  personas: number;
  intencion: Record<Intencion, number>;
}

function bloqueVacio(): Bloque {
  return {
    lideres: 0,
    reuniones: 0,
    barrios: 0,
    personas: 0,
    intencion: { positivo: 0, negativo: 0, indeciso: 0, desconocido: 0 },
  };
}

function normalizarIntencion(v: string | null): Intencion {
  if (v === "positivo" || v === "negativo" || v === "indeciso") return v;
  return "desconocido";
}

/**
 * GET /api/concejales/reporte
 *
 * El «trabajo» de cada concejal: cuántos líderes, reuniones, barrios y
 * personas ÚNICAS se le acreditan, y cómo se reparte la intención de voto de
 * esas personas. La atribución sube por contacto -> reunión -> concejal, así
 * que una persona cuenta una sola vez (por su reunión de origen). Se incluye el
 * bloque «del alcalde» (sin concejal) para no perder ese trabajo.
 */
export async function GET() {
  try {
    const permiso = await exigirPermiso(PERMISOS.LIDERES_VER);
    if (!permiso.ok) return permiso.respuesta;

    const concejales = await prisma.concejal.findMany({
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, partido: true, numero_tarjeton: true },
    });

    // Personas e intención de voto, agrupadas por el concejal de su reunión.
    const personas = await prisma.$queryRaw<
      Array<{ concejal_id: number | null; intencion: string | null; total: number }>
    >`
      SELECT r.concejal_id AS concejal_id,
             c.intencion_voto AS intencion,
             COUNT(*)::int AS total
      FROM contactos c
      JOIN reuniones r ON c.reunion_id = r.id
      GROUP BY r.concejal_id, c.intencion_voto
    `;

    // Reuniones y barrios distintos por concejal.
    const reuniones = await prisma.$queryRaw<
      Array<{ concejal_id: number | null; reuniones: number; barrios: number }>
    >`
      SELECT concejal_id,
             COUNT(*)::int AS reuniones,
             COUNT(DISTINCT barrio)::int AS barrios
      FROM reuniones
      GROUP BY concejal_id
    `;

    // Líderes por concejal.
    const lideres = await prisma.lider.groupBy({
      by: ["concejal_id"],
      _count: { _all: true },
    });

    // Se arma un bloque por cada clave (id de concejal o `null` = alcalde).
    const bloques = new Map<number | null, Bloque>();
    const obtener = (k: number | null) => {
      if (!bloques.has(k)) bloques.set(k, bloqueVacio());
      return bloques.get(k)!;
    };

    for (const fila of personas) {
      const b = obtener(fila.concejal_id);
      b.personas += fila.total;
      b.intencion[normalizarIntencion(fila.intencion)] += fila.total;
    }
    for (const fila of reuniones) {
      const b = obtener(fila.concejal_id);
      b.reuniones = fila.reuniones;
      b.barrios = fila.barrios;
    }
    for (const fila of lideres) {
      const b = obtener(fila.concejal_id);
      b.lideres = fila._count._all;
    }

    const data = concejales.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      partido: c.partido,
      numero_tarjeton: c.numero_tarjeton,
      ...(bloques.get(c.id) ?? bloqueVacio()),
    }));

    const sinConcejal = bloques.get(null) ?? bloqueVacio();

    return NextResponse.json({ data, sin_concejal: sinConcejal });
  } catch (error) {
    return handleError(error, "GET /api/concejales/reporte");
  }
}
