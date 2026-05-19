import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { redis } from "@/lib/ratelimit";

const CACHE_TTL = 300; // 5 minutos para resultados frescos de campaña

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q");
    if (!q || q.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const cacheKey = `autocomplete:${q.toLowerCase()}`;
    
    // Consultar caché de Redis
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
      return NextResponse.json({ suggestions: parsed, cached: true });
    }

    // Consultas paralelas de alto rendimiento con Prisma
    const [contactos, barrios, puestos, lideres] = await Promise.all([
      // Contactos por nombre
      prisma.contacto.findMany({
        where: { nombre: { contains: q, mode: "insensitive" } },
        select: { cedula: true, nombre: true, barrio: true },
        take: 5,
      }),

      // Barrios únicos
      prisma.contacto.groupBy({
        by: ["barrio"],
        where: { barrio: { contains: q, mode: "insensitive" } },
        orderBy: { barrio: "asc" },
        take: 5,
      }),

      // Puestos de votación únicos
      prisma.contacto.groupBy({
        by: ["puesto_votacion"],
        where: { puesto_votacion: { contains: q, mode: "insensitive" } },
        orderBy: { puesto_votacion: "asc" },
        take: 5,
      }),

      // Líderes por nombre
      prisma.lider.findMany({
        where: { nombre: { contains: q, mode: "insensitive" }, estado: "activo" },
        select: { id: true, nombre: true, barrio: true },
        take: 5,
      }),
    ]);

    const suggestions = [
      ...contactos.map((c) => ({ type: "contacto" as const, label: c.nombre || "Sin Nombre", meta: c.barrio || "Sin Barrio", id: c.cedula })),
      ...barrios.filter((b: any) => b.barrio).map((b: any) => ({ type: "barrio" as const, label: b.barrio as string, meta: "Barrio de votación" })),
      ...puestos.filter((p: any) => p.puesto_votacion).map((p: any) => ({ type: "puesto" as const, label: p.puesto_votacion as string, meta: "Puesto de votación" })),
      ...lideres.map((l) => ({ type: "lider" as const, label: l.nombre || "Sin Nombre", meta: l.barrio || "Sin Barrio", id: l.id })),
    ];

    // Guardar en caché
    await redis.set(cacheKey, JSON.stringify(suggestions), { ex: CACHE_TTL });

    return NextResponse.json({ suggestions, cached: false });
  } catch (error) {
    console.error("Error en Autocomplete:", error);
    return NextResponse.json({ suggestions: [], error: true });
  }
}
