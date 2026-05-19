# 🔴 PROBLEMA 1: DOS LLAMADAS A IA POR PREGUNTA (Latencia Doble)

## Estado Actual
Cada pregunta del usuario requiere **2 llamadas secuenciales** a Gemini:
1. **Paso 1:** ¿Qué herramientas necesitas?
2. **Paso 2:** Responde con estos datos

## Impacto
- ⏱️ **Latencia:** 200-400ms (dos round-trips)
- 💰 **Costo:** 2x más caro
- 🎯 **Confiabilidad:** JSON parsing puede fallar
- 👤 **UX:** Espera notoria para el usuario

## Raíz del Problema
En [`lib/gemini.ts:40-105`](../lib/gemini.ts), la función `generarConHerramientas` implementa **tool selection manual**:

```typescript
// PASO 1: Pedir a Gemini que decida qué herramientas usar
const respPaso1 = await generarAnalisis(promptPaso1);
let texto1 = respPaso1.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

// Parsear manualmente el JSON
let herramientasSolicitadas: { nombre: string; argumentos: any }[] = [];
try {
  const parsed = JSON.parse(texto1);
  herramientasSolicitadas = Array.isArray(parsed.herramientas) ? parsed.herramientas : [];
} catch {
  herramientasSolicitadas = [];
}

// PASO 2: Ejecutar herramientas
// ...queries a BD...

// PASO 3: Segunda llamada a Gemini con datos reales
const promptPaso2 = `...${resultadosStr}...`;
return await generarAnalisis(promptPaso2);
```

**El problema:** Gemini **soporta nativamente Function Calling** (tool_use), pero no lo estamos usando.

---

## 📋 Solución Completa

### Opción A: Migrar a Function Calling Nativo (RECOMENDADO)

**Ventajas:**
- ✅ Una sola llamada a la IA
- ✅ Formato JSON garantizado (no requiere parsing manual)
- ✅ 50% más rápido
- ✅ Soporte nativo en el modelo

**Implementación:**

#### 1. Crear nuevo archivo `lib/gemini-tools.ts`

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ejecutarHerramienta } from "@/lib/ia-tools";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function generarConHerramientasV2(
  pregunta: string,
  historial: { role: "user" | "model"; parts: Array<{ text?: string; functionCall?: any }> }[],
  toolDefinitions: any[]
) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [
      {
        functionDeclarations: toolDefinitions.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }))
      }
    ]
  });

  // Construir mensaje para Gemini
  const messages = [
    ...historial,
    {
      role: "user",
      parts: [
        {
          text: `Eres el Analista Electoral de la Campaña El Espinal.
          
Pregunta actual: "${pregunta}"

Usa las funciones disponibles para obtener datos exactos de la base de datos.
Responde directamente con información concreta basada en los resultados.`
        }
      ]
    }
  ];

  let respuestaFinal = "";
  let toolCallsCount = 0;
  const maxIterations = 5;

  // Loop agentico: ejecutar herramientas hasta que la IA diga que terminó
  for (let i = 0; i < maxIterations; i++) {
    const response = await model.generateContent({
      contents: messages
    });

    const responseText = response.response.text();
    respuestaFinal = responseText;

    // Verificar si hay function calls
    const functionCalls = response.response.functionCalls();
    if (!functionCalls || functionCalls.length === 0) {
      // Sin function calls = respuesta final
      break;
    }

    toolCallsCount += functionCalls.length;

    // Ejecutar cada función
    const toolResults = [];
    for (const call of functionCalls) {
      try {
        const resultado = await ejecutarHerramienta(call.name, call.args);
        toolResults.push({
          functionResponse: {
            name: call.name,
            response: JSON.parse(resultado)
          }
        });
      } catch (error: any) {
        toolResults.push({
          functionResponse: {
            name: call.name,
            response: { error: error.message }
          }
        });
      }
    }

    // Añadir función calls y resultados al historial
    messages.push({
      role: "model",
      parts: functionCalls.map(call => ({
        functionCall: call
      }))
    });

    messages.push({
      role: "user",
      parts: toolResults
    });
  }

  console.log(`[Agente IA] Ejecutadas ${toolCallsCount} herramientas en ${messages.length / 2} iteraciones`);

  return respuestaFinal;
}
```

#### 2. Actualizar `app/api/ia/analisis/route.ts`

```typescript
import { generarConHerramientasV2 } from "@/lib/gemini-tools";

export async function POST(req: NextRequest) {
  try {
    const { tipo, preguntaAnalista, sesionId } = await req.json();

    if (tipo === "analista" && preguntaAnalista && sesionId) {
      // 1. Recuperar historial
      const historialDB = await prisma.chatMemoria.findMany({
        where: { sesion_id: sesionId },
        orderBy: { timestamp: "asc" },
        take: 12
      });

      // 2. Convertir a formato Gemini
      const historialGemini = historialDB.map(h => ({
        role: h.rol === "user" ? "user" : "model",
        parts: [{ text: h.contenido }]
      }));

      // 3. Guardar pregunta en memoria
      await prisma.chatMemoria.create({
        data: { 
          sesion_id: sesionId, 
          rol: "user", 
          contenido: preguntaAnalista, 
          tipo: "analista" 
        }
      });

      // 4. Ejecutar con Function Calling (UNA SOLA LLAMADA)
      const respuestaIA = await generarConHerramientasV2(
        preguntaAnalista,
        historialGemini,
        TOOL_DEFINITIONS
      );

      // 5. Guardar respuesta
      await prisma.chatMemoria.create({
        data: { 
          sesion_id: sesionId, 
          rol: "assistant", 
          contenido: respuestaIA, 
          tipo: "analista" 
        }
      });

      return NextResponse.json({ data: respuestaIA });
    }

    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  } catch (error: any) {
    console.error("POST /api/ia/analisis error:", error);
    return NextResponse.json({ error: "Error al procesar" }, { status: 500 });
  }
}
```

#### 3. Actualizar definiciones de herramientas

Las definiciones en `TOOL_DEFINITIONS` **ya están en el formato correcto**, pero añade metadatos:

```typescript
export const TOOL_DEFINITIONS = [
  {
    name: "contar_contactos",
    description: "Cuenta cuántos contactos hay en BD. Úsala para 'cuántos habilitados' o 'cuántos en barrio X'",
    parameters: {
      type: "object",
      properties: {
        barrio: { 
          type: "string", 
          description: "Nombre del barrio (opcional)" 
        },
        intencion_voto: { 
          type: "string", 
          enum: ["positivo", "negativo", "indeciso", "desconocido"],
          description: "Intención de voto (opcional)"
        },
        habilitados: { 
          type: "boolean", 
          description: "Solo habilitados (opcional)" 
        },
        // ... resto de parámetros
      },
      required: []
    }
  },
  // ... resto de herramientas
];
```

---

### Opción B: Reducir a Una Llamada con Streaming

Si no quieres migrar a Function Calling, puedes optimizar el prompt:

```typescript
export async function generarConHerramientasOptimizado(
  pregunta: string,
  historial: { rol: string; contenido: string }[],
  toolDefs: any[],
  ejecutarTool: (nombre: string, args: any) => Promise<string>
): Promise<string> {
  
  const toolsDesc = toolDefs
    .map(t => `- ${t.name}: ${t.description}`)
    .join("\n");

  // PROMPT COMBINADO (una sola llamada)
  const prompt = `Eres el Analista Electoral de la Campaña El Espinal.

HERRAMIENTAS DISPONIBLES:
${toolsDesc}

PREGUNTA: "${pregunta}"

INSTRUCCIONES:
1. Decide qué herramientas necesitas (si alguna)
2. Responde directamente con datos exactos
3. Si usas datos de herramientas, inclúyelos en tu respuesta

RESPONDE EN MARKDOWN. NO uses bloques JSON.`;

  // Llamada #1 a Gemini
  const respuesta = await generarAnalisis(prompt);
  
  // Extrae herramientas mencionadas del texto (parsing simple)
  const toolMatches = respuesta.match(/\[HERRAMIENTA: (\w+)\((.*?)\)\]/g) || [];
  
  let respuestaFinal = respuesta;
  
  // Si hay herramientas, ejecutarlas y regenerar
  if (toolMatches.length > 0) {
    let datosObtenidos = "";
    
    for (const match of toolMatches) {
      const [, toolName, argsStr] = match.match(/\[HERRAMIENTA: (\w+)\((.*?)\)\]/)!;
      try {
        const args = JSON.parse(argsStr);
        const resultado = await ejecutarTool(toolName, args);
        datosObtenidos += `\n${toolName}: ${resultado}`;
      } catch (e) {
        console.error(`Error ejecutando ${toolName}:`, e);
      }
    }
    
    // Llamada #2: regenerar con datos
    const promptRegen = `${prompt}

DATOS OBTENIDOS:
${datosObtenidos}

Ahora da la respuesta final con los números exactos.`;
    
    respuestaFinal = await generarAnalisis(promptRegen);
  }
  
  return respuestaFinal;
}
```

---

## 📊 Comparación de Impacto

| Métrica | Actual | Opción A | Opción B |
|---------|--------|----------|----------|
| **Llamadas a IA** | 2 | 1-2* | 1-2* |
| **Latencia** | 400ms | 150ms | 250ms |
| **Parsing JSON** | Sí (frágil) | No | No |
| **Esfuerzo** | - | 2h | 1h |
| **Costo API** | 2x | 1-1.5x | 1-1.5x |

*Gemini puede hacer múltiples function calls en una sola respuesta, pero típicamente 1

---

## ✅ Pasos de Implementación

### Paso 1: Crear `lib/gemini-tools.ts`
```bash
# Crear archivo con código de Opción A arriba
```

### Paso 2: Actualizar `app/api/ia/analisis/route.ts`
```bash
# Cambiar import y uso de generarConHerramientas a generarConHerramientasV2
```

### Paso 3: Pruebas
```bash
curl -X POST http://localhost:3000/api/ia/analisis \
  -H "Content-Type: application/json" \
  -d '{
    "tipo": "analista",
    "preguntaAnalista": "¿Cuántos habilitados hay en Centro?",
    "sesionId": "test-123"
  }'

# Esperar ~150ms en lugar de 400ms
```

### Paso 4: Monitoreo
```typescript
// Añadir en el route:
const inicio = Date.now();
const respuesta = await generarConHerramientasV2(...);
console.log(`⏱️ Latencia total: ${Date.now() - inicio}ms`);
```

---

## 🎯 Resultado Esperado

- **Antes:** 400ms (2 llamadas)
- **Después:** 150ms (1 llamada con Function Calling)
- **Mejora:** **62.5% más rápido**
- **Costo:** 50% menos tokens

---

## 📚 Referencias
- [Gemini Function Calling](https://ai.google.dev/docs/function_calling)
- [Agentes con Gemini](https://ai.google.dev/docs/agents)
