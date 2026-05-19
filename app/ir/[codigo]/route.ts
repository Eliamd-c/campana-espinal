import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { codigo: string } }
) {
  const { codigo } = params;

  try {
    // 1. Buscar el enlace corto en la base de datos
    const enlace = await prisma.enlaceCorto.findUnique({
      where: { codigo },
    });

    if (!enlace) {
      // Si el enlace no existe, redirigir al inicio del dashboard o a una página 404
      return NextResponse.redirect(new URL("/", req.url));
    }

    // 2. Extraer parámetros opcionales de rastreo (ej: ?u=123456)
    // El parámetro 'u' contendrá la cédula del contacto a rastrear
    const searchParams = req.nextUrl.searchParams;
    const contactoCedula = searchParams.get("u");

    // 3. Registrar el clic silenciosamente si viene con una cédula válida
    if (contactoCedula) {
      // Usamos una promesa sin await bloqueante fuerte si es posible,
      // o un try/catch para que un error de rastreo no impida la redirección.
      try {
        await prisma.clicRastreo.create({
          data: {
            codigo_enlace: codigo,
            contacto_cedula: contactoCedula,
          },
        });
        
        // Opcional: Podríamos sumar puntos automáticamente al líder o al contacto por interactuar.
      } catch (err) {
        console.error("Error al registrar clic de rastreo:", err);
      }
    }

    // 4. Redirigir instantáneamente a la URL original de Facebook/Youtube
    return NextResponse.redirect(enlace.url_original);
    
  } catch (error) {
    console.error("Error crítico en acortador:", error);
    return NextResponse.redirect(new URL("/", req.url));
  }
}
