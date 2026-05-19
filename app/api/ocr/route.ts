

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const maxDuration = 60; // Set maximum execution time to 60 seconds since OCR might take a while
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    if (!genAI) {
      return NextResponse.json({ error: "La API Key de Gemini no está configurada." }, { status: 500 });
    }

    const { imagenUrl } = await req.json();

    if (!imagenUrl) {
      return NextResponse.json({ error: "No se proporcionó ninguna imagen." }, { status: 400 });
    }

    // El frontend envía la imagen en formato DataURL: "data:image/jpeg;base64,/9j/4AAQ..."
    const matches = imagenUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return NextResponse.json({ error: "Formato de imagen inválido." }, { status: 400 });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const prompt = `
      Actúa como un experto sistema de reconocimiento óptico de caracteres (OCR) diseñado para leer planillas físicas de registro escritas a mano.
      
      Extrae los datos de la tabla que aparece en la imagen proporcionada. La tabla generalmente tiene columnas como Cédula, Nombre, Teléfono y Barrio (o similares).
      Devuelve los resultados estrictamente en formato JSON como un arreglo de objetos.
      
      Reglas:
      1. Ignora los encabezados de la tabla y texto que no sea parte de los registros (ej. títulos de la hoja).
      2. Si algún campo no se puede leer, déjalo como una cadena vacía "".
      3. Solo devuelve registros que tengan al menos la cédula o el nombre identificable.
      4. Asegúrate de limpiar los números (cédula y teléfono) quitando espacios u otros caracteres no numéricos.

      El esquema JSON requerido es:
      [
        {
          "cedula": "string",
          "nombre": "string",
          "telefono": "string",
          "barrio": "string"
        }
      ]
    `;

    const imageParts = [
      {
        inlineData: {
          data: base64Data,
          mimeType
        }
      }
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    let text = response.text();

    // Clean up potential markdown formatting (```json ... ```)
    text = text.replace(/```json\n?|```/g, "").trim();

    // Parse JSON
    const parsedData = JSON.parse(text);

    return NextResponse.json({ data: parsedData });
  } catch (error: any) {
    console.error("Error OCR Gemini:", error);
    return NextResponse.json(
      { error: "Error al procesar la imagen con Gemini: " + error.message },
      { status: 500 }
    );
  }
}
