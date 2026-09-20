import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { exigirPermiso } from '@/lib/auth/permisos-ruta';
import { PERMISOS } from '@/lib/permisos';
import { evaluar, CampoPlantilla, CampoPorConfirmar } from '@/lib/agenda/reglas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await exigirPermiso(PERMISOS.AGENDA_EDITAR);
    if (!auth.ok) return auth.respuesta;
    
    const id = params.id;
    
    const agendamiento = await prisma.agendamiento.findUnique({
      where: { id },
      include: { campos_por_confirmar: true }
    });

    if (!agendamiento) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }

    if (agendamiento.estado === 'confirmado') {
      return NextResponse.json({ error: 'Ya está confirmado' }, { status: 400 });
    }

    const reglas = agendamiento.reglas_congeladas as unknown as CampoPlantilla[];
    const datos = agendamiento.datos as Record<string, any>;
    const pc = agendamiento.campos_por_confirmar.filter(c => !c.resuelto).map(c => ({
      campo: c.campo,
      marcadoPor: c.marcado_por,
      fecha: c.fecha_marcado
    }));

    const resultado = evaluar(reglas, datos, pc);

    if (!resultado.puedeConfirmar) {
      return NextResponse.json({ 
        error: 'No se puede confirmar', 
        faltantes: resultado.faltantes,
        porConfirmar: resultado.porConfirmar
      }, { status: 422 });
    }

    const confirmado = await prisma.agendamiento.update({
      where: { id },
      data: {
        estado: 'confirmado',
        confirmado_por: auth.quien.usuarioId,
        fecha_confirmado: new Date()
      }
    });

    return NextResponse.json(confirmado);
  } catch (error: any) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
