import { NextResponse } from 'next/server';
import { exigirPermiso } from '@/lib/auth/permisos-ruta';

export const dynamic = 'force-dynamic';

import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  try {
    const auth = await exigirPermiso('agenda.editar' as any);
    if (!auth.ok) return auth.respuesta;
    
    const body = await request.json(); // { texto: string, plantillas_disponibles: any[] }
    
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Falta GEMINI_API_KEY' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Analiza el siguiente texto escrito por un usuario para agendar un evento o reunión.
      Extrae los siguientes datos en formato JSON estricto (no uses markdown \`\`\`json):
      {
        "titulo": "Título inferido para el evento",
        "fecha": "Fecha en formato YYYY-MM-DDTHH:mm (intenta adivinar la más próxima, usa el año actual si no se provee. Hoy es ${new Date().toISOString()})",
        "lugar": "Dirección o barrio si se menciona, si no cadena vacía",
        "recursos": [{"item": "sillas", "cantidad": 200}],
        "no_reconocido": ["cualquier cosa extra que no encaje"]
      }

      Texto del usuario: "${body.texto}"
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().replace(/^```json/g, '').replace(/```$/g, '');
    
    const parsedData = JSON.parse(responseText);

    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error("Error AI:", error);
    return NextResponse.json({ error: 'Error del servidor o de IA' }, { status: 500 });
  }
}
