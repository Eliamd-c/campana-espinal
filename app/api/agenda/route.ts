import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { exigirPermiso } from '@/lib/auth/permisos-ruta';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await exigirPermiso('agenda.ver' as any);
    if (!auth.ok) return auth.respuesta;
    
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');
    const estado = searchParams.get('estado');

    const where: any = {};
    if (desde && hasta) {
      where.fecha_inicio = {
        gte: new Date(desde),
        lte: new Date(hasta)
      };
    }
    if (estado) {
      where.estado = estado;
    }

    const agendamientos = await prisma.agendamiento.findMany({
      where,
      orderBy: { fecha_inicio: 'asc' },
      include: {
        plantilla: {
          select: { nombre: true, color: true, icono: true }
        },
        campos_por_confirmar: true,
        recursos_solicitados: true
      }
    });

    return NextResponse.json(agendamientos);
  } catch (error: any) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await exigirPermiso('agenda.editar' as any);
    if (!auth.ok) return auth.respuesta;
    
    const body = await request.json();
    
    // Nace como borrador o cupo segun lo decida el frontend o el estado enviado
    // Por defecto cupo si no se especifica
    const estadoInicial = body.estado || 'cupo';

    // Obtener la plantilla para congelar reglas
    const plantilla = await prisma.plantillaAgenda.findUnique({
      where: { id: body.plantilla_id }
    });

    if (!plantilla) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
    }

    const agendamiento = await prisma.agendamiento.create({
      data: {
        plantilla_id: body.plantilla_id,
        reglas_congeladas: plantilla.campos,
        titulo: body.titulo,
        fecha_inicio: new Date(body.fecha_inicio),
        fecha_fin: body.fecha_fin ? new Date(body.fecha_fin) : undefined,
        barrio: body.barrio,
        direccion: body.direccion,
        datos: body.datos || {},
        estado: estadoInicial,
        lider_id: body.lider_id,
        responsable: body.responsable,
        asistentes_esperados: body.asistentes_esperados,
        notas: body.notas,
        texto_original: body.texto_original,
        creado_por: auth.quien.usuarioId,
        campos_por_confirmar: body.campos_por_confirmar ? {
          create: body.campos_por_confirmar.map((c: any) => ({
            campo: c.campo,
            marcado_por: auth.quien.usuarioId
          }))
        } : undefined,
        recursos_solicitados: body.recursos_solicitados ? {
          create: body.recursos_solicitados.map((r: any, idx: number) => ({
            item: r.item,
            cantidad_solicitada: r.cantidad_solicitada,
            estado: 'solicitado',
            orden: idx
          }))
        } : undefined
      },
      include: {
        campos_por_confirmar: true,
        recursos_solicitados: true
      }
    });

    return NextResponse.json(agendamiento);
  } catch (error: any) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
