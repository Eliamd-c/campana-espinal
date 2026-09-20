import { NextResponse } from 'next/server';
import { exigirPermiso } from '@/lib/auth/permisos-ruta';

export const dynamic = 'force-dynamic';

import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '@/lib/db';

export async function POST(request: Request) {
  try {
    const auth = await exigirPermiso('agenda.editar' as any);
    if (!auth.ok) return auth.respuesta;
    
    const body = await request.json();
    
    // Obtener configuraciones de la base de datos
    const configs = await prisma.configuracionGlobal.findMany();
    const configMap = configs.reduce((acc: any, curr) => {
      acc[curr.clave] = curr.valor;
      return acc;
    }, {});

    const proveedorIA = configMap['PROVEEDOR_IA'] || 'gemini'; // 'gemini' o 'openai'
    const geminiKey = configMap['GEMINI_API_KEY'] || process.env.GEMINI_API_KEY;
    const openaiKey = configMap['OPENAI_API_KEY'] || process.env.OPENAI_API_KEY;

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

    let parsedData = null;

    if (proveedorIA === 'openai') {
      if (!openaiKey) return NextResponse.json({ error: 'Falta OPENAI_API_KEY' }, { status: 500 });
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      
      const data = await response.json();
      if (!data.choices || !data.choices[0]) throw new Error('Error en OpenAI API');
      const responseText = data.choices[0].message.content.trim().replace(/^```json/g, '').replace(/```$/g, '');
      parsedData = JSON.parse(responseText);
      
    } else {
      if (!geminiKey) return NextResponse.json({ error: 'Falta GEMINI_API_KEY' }, { status: 500 });
      
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim().replace(/^```json/g, '').replace(/```$/g, '');
      parsedData = JSON.parse(responseText);
    }

    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error("Error AI:", error);
    return NextResponse.json({ error: 'Error del servidor o de IA' }, { status: 500 });
  }
}
