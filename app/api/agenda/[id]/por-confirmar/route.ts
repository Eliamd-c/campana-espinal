import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { exigirPermiso } from '@/lib/auth/permisos-ruta';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await exigirPermiso('agenda.editar' as any);
    if (!auth.ok) return auth.respuesta;
    
    const body = await request.json(); // { campo: string }
    
    const pc = await prisma.campoPorConfirmar.create({
      data: {
        agendamiento_id: params.id,
        campo: body.campo,
        marcado_por: auth.quien.usuarioId
      }
    });

    return NextResponse.json(pc);
  } catch (error: any) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await exigirPermiso('agenda.editar' as any);
    if (!auth.ok) return auth.respuesta;
    
    const body = await request.json(); // { campo: string }
    
    await prisma.campoPorConfirmar.update({
      where: {
        agendamiento_id_campo: {
          agendamiento_id: params.id,
          campo: body.campo
        }
      },
      data: {
        resuelto: true,
        fecha_resuelto: new Date()
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
