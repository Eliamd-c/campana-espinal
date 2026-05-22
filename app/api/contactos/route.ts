import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/api/errors";
import { Prisma } from "@prisma/client";
import { invalidarCacheAlCrearContacto } from "@/lib/cache-strategies";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ContactoLocalSchema = z.object({
  cedula: z.string().min(4),
  nombre: z.string().optional(),
  telefono: z.string().optional(),
  barrio: z.string().optional(),
  intencion_voto: z.string().optional(),
  problematica: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const barrio = searchParams.get("barrio");
    let intencion_voto = searchParams.get("intencion_voto");
    const puesto = searchParams.get("puesto");
    const search = searchParams.get("search") || searchParams.get("q");
    const limit = Number(searchParams.get("limit")) || 50;
    const cursor = searchParams.get("cursor");

    if (intencion_voto === "todos" || intencion_voto === "Todos los registrados") {
      intencion_voto = null;
    }

    // ✅ Construir where con tipos seguros
    const where: Prisma.ContactoWhereInput = {};

    if (search) {
      const searchTerms = search.trim().split(/\s+/).join(" & ");
      where.OR = [
        { nombre: { search: searchTerms } },
        { barrio: { search: searchTerms } },
        { problematica: { search: searchTerms } },
      ];
    }

    if (barrio && barrio !== "Todos") {
      where.barrio = { contains: barrio, mode: "insensitive" };
    }
    if (intencion_voto) {
      where.intencion_voto = intencion_voto;
    }
    if (puesto) {
      where.puesto_votacion = { contains: puesto, mode: "insensitive" };
    }

    // ✅ Paginación cursor-based
    const contactos = await prisma.contacto.findMany({
      where,
      select: {
        cedula: true,
        nombre: true,
        telefono: true,
        intencion_voto: true,
        barrio: true,
      },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { cedula: cursor } : undefined,
      orderBy: { fecha_registro: 'desc' }
    });

    // ✅ Conteos globales para indicadores
    const [total, locales, externos] = await Promise.all([
      prisma.contacto.count({ where }),
      prisma.contacto.count({
        where: {
          ...where,
          OR: [
            { municipio: { in: ["El Espinal", "Espinal"], mode: "insensitive" } },
            { municipio: null }
          ]
        }
      }),
      prisma.contacto.count({
        where: {
          ...where,
          NOT: {
            OR: [
              { municipio: { in: ["El Espinal", "Espinal"], mode: "insensitive" } },
              { municipio: null }
            ]
          }
        }
      }),
    ]);

    return NextResponse.json({
      data: contactos,
      meta: {
        total,
        locales,
        externos,
        limit,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    return handleError(error, "GET /api/contactos");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ContactoLocalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos de contacto inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { cedula, nombre, telefono, barrio, intencion_voto, problematica } = parsed.data;

    // ✅ Anti-duplicados (Upsert logic)
    const existente = await prisma.contacto.findUnique({ where: { cedula } });

    if (existente) {
      const updated = await prisma.contacto.update({
        where: { cedula },
        data: {
          fecha_ultimo_contacto: new Date(),
          ...(nombre && { nombre }),
          ...(telefono && { telefono }),
          ...(barrio && { barrio }),
          ...(intencion_voto && { intencion_voto }),
          ...(problematica && { problematica }),
        },
      });
      // Invalidar el caché al actualizar la intención de voto o el barrio del contacto
      await invalidarCacheAlCrearContacto(updated.barrio || undefined);
      
      return NextResponse.json({ data: updated, isNew: false });
    } else {
      const created = await prisma.contacto.create({
        data: {
          cedula,
          nombre,
          telefono,
          barrio,
          intencion_voto,
          problematica,
        },
      });
      // Invalidar el caché al crear un nuevo contacto
      await invalidarCacheAlCrearContacto(created.barrio || undefined);
      
      return NextResponse.json({ data: created, isNew: true }, { status: 201 });
    }

  } catch (error) {
    return handleError(error, "POST /api/contactos");
  }
}
