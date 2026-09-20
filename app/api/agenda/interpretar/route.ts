import { NextResponse } from 'next/server';
import { exigirPermiso } from '@/lib/auth/permisos-ruta';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = await exigirPermiso('agenda.editar' as any);
    if (!auth.ok) return auth.respuesta;
    
    const body = await request.json(); // { texto: string }
    
    // IA Mock (Fase 5 basic implementation)
    // Here would be the Gemini integration for real
    
    return NextResponse.json({
      titulo: 'Reunión interpretada',
      fecha: new Date().toISOString(),
      barrio: 'Barrio Reconocido',
      recursos: [{ item: 'sillas', cantidad: 200 }]
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
