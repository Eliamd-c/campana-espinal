import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { exigirPermiso } from '@/lib/auth/permisos-ruta';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await exigirPermiso('agenda.ver' as any);
    if (!auth.ok) return auth.respuesta;
    
    // Lista plantillas activas
    const plantillas = await prisma.plantillaAgenda.findMany({
      where: { activa: true },
      orderBy: { veces_usada: 'desc' }
    });

    return NextResponse.json(plantillas);
  } catch (error: any) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await exigirPermiso('agenda.plantillas' as any);
    if (!auth.ok) return auth.respuesta;
    
    const body = await request.json();
    
    const plantilla = await prisma.plantillaAgenda.create({
      data: {
        nombre: body.nombre,
        descripcion: body.descripcion,
        icono: body.icono,
        color: body.color,
        campos: body.campos,
        recursos_sugeridos: body.recursos_sugeridos || [],
        requiere_aprobacion: body.requiere_aprobacion || false,
        duracion_default_min: body.duracion_default_min,
        creada_por: auth.quien.usuarioId
      }
    });

    return NextResponse.json(plantilla);
  } catch (error: any) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
