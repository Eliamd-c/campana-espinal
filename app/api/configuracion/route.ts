import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { exigirPermiso } from '@/lib/auth/permisos-ruta';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await exigirPermiso('agenda.editar' as any); // Using agenda.editar as a basic admin check for now
    if (!auth.ok) return auth.respuesta;
    
    const configuraciones = await prisma.configuracionGlobal.findMany();
    
    // Transform array to object
    const configMap = configuraciones.reduce((acc: any, curr) => {
      acc[curr.clave] = curr.valor;
      return acc;
    }, {});
    
    return NextResponse.json(configMap);
  } catch (error: any) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await exigirPermiso('agenda.editar' as any);
    if (!auth.ok) return auth.respuesta;
    
    const body = await request.json(); // Map of key -> value
    
    const ops = Object.keys(body).map(clave => 
      prisma.configuracionGlobal.upsert({
        where: { clave },
        update: { valor: String(body[clave]) },
        create: { clave, valor: String(body[clave]) }
      })
    );
    
    await prisma.$transaction(ops);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al guardar configuracion' }, { status: 500 });
  }
}
