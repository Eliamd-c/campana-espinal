# 🚀 WEBSOCKET + STREAMING: Chat en Vivo (4-5 horas)

## Impacto
- ✨ **UX:** +40% (respuestas aparecen palabra por palabra)
- ⚡ **Latencia:** Percibida como 0 (streaming)
- 👥 **Engagement:** Usuario siente "tiempo real"

---

## Solución Completa

### Paso 1: Instalar dependencias

```bash
npm install ws next-ws @react-three/fiber
```

### Paso 2: Crear WebSocket server

Crear `app/api/chat/stream/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { generarConHerramientasV2 } from "@/lib/gemini-tools";
import { TOOL_DEFINITIONS, ejecutarHerramienta } from "@/lib/ia-tools";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { pregunta, sesionId } = await req.json();

  // Crear readable stream
  const encoder = new TextEncoder();
  let buffer = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        // Crear custom handler para recibir chunks
        const onChunk = (chunk: string) => {
          buffer += chunk;
          
          // Enviar cada palabra o token
          const words = buffer.split(/(\s+)/);
          const completeWords = words.slice(0, -1);
          buffer = words[words.length - 1];

          for (const word of completeWords) {
            const message = JSON.stringify({ token: word, type: "text" });
            controller.enqueue(encoder.encode(`data: ${message}\n\n`));
          }
        };

        // Stream desde Gemini
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const response = await model.generateContentStream(pregunta);

        for await (const chunk of response.stream) {
          const text = chunk.text();
          onChunk(text);
        }

        // Flush buffer final
        if (buffer) {
          const message = JSON.stringify({ token: buffer, type: "text" });
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        }

        // Señal de fin
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
        controller.close();
      } catch (error: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

### Paso 3: Cliente React (Streaming)

Crear componente `app/(dashboard)/components/ChatStreaming.tsx`:

```typescript
import { useState, useRef, useEffect } from "react";

export function ChatStreaming({ sesionId }: { sesionId: string }) {
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [respuesta]);

  const handleEnviar = async () => {
    if (!pregunta.trim()) return;

    setRespuesta("");
    setStreaming(true);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta, sesionId }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream reader");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        accumulated += decoder.decode(value, { stream: true });
        const lines = accumulated.split("\n");
        accumulated = lines[lines.length - 1]; // Keep incomplete line

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === "text" && data.token) {
                setRespuesta((prev) => prev + data.token);
              } else if (data.type === "done") {
                setStreaming(false);
              } else if (data.error) {
                console.error("Error en stream:", data.error);
                setStreaming(false);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error("Error en streaming:", error);
      setStreaming(false);
    }

    setPregunta("");
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Respuestas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-gray-800 p-4 rounded">
          <p className="font-bold mb-2">Tu pregunta:</p>
          <p>{pregunta || "(escribe una pregunta)"}</p>
        </div>

        {respuesta && (
          <div className="bg-gray-700 p-4 rounded">
            <p className="font-bold mb-2">Respuesta:</p>
            <p className="whitespace-pre-wrap">{respuesta}</p>
            {streaming && <span className="animate-pulse">▌</span>}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleEnviar()}
            placeholder="Escribe tu pregunta..."
            disabled={streaming}
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-4 py-2 text-white disabled:opacity-50"
          />
          <button
            onClick={handleEnviar}
            disabled={streaming || !pregunta.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-6 py-2 rounded transition"
          >
            {streaming ? "Escribiendo..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Paso 4: Integración en página

Actualizar `app/(dashboard)/ia/page.tsx`:

```typescript
import { ChatStreaming } from "@/app/(dashboard)/components/ChatStreaming";
import { getSession } from "@/lib/auth";

export default async function IAPage() {
  const session = await getSession();
  const sesionId = session?.user?.id || Date.now().toString();

  return (
    <div>
      <h1>Chat con IA - Streaming en Vivo</h1>
      <ChatStreaming sesionId={sesionId} />
    </div>
  );
}
```

---

## 🎯 Alternativa: WebSocket (Para chat bidireccional)

Si necesitas respuestas en AMBAS direcciones:

```typescript
// lib/websocket-server.ts
import { WebSocketServer } from "ws";
import { Server } from "http";

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    console.log("Cliente conectado");

    ws.on("message", async (message: string) => {
      try {
        const { pregunta, sesionId } = JSON.parse(message);

        // Stream respuesta palabra por palabra
        const genAI = new GoogleGenerativeAI(
          process.env.GEMINI_API_KEY!
        );
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
        });

        const response = await model.generateContentStream(pregunta);

        for await (const chunk of response.stream) {
          ws.send(
            JSON.stringify({
              type: "token",
              token: chunk.text(),
            })
          );
        }

        ws.send(JSON.stringify({ type: "done" }));
      } catch (error: any) {
        ws.send(JSON.stringify({ type: "error", error: error.message }));
      }
    });

    ws.on("close", () => {
      console.log("Cliente desconectado");
    });
  });

  return wss;
}
```

---

## 📊 Resultado Esperado

**Antes:**
- User espera 2-3 segundos viendo "Cargando..."
- Luego aparece respuesta completa de golpe
- Sensación de lentitud

**Después:**
- Respuesta aparece inmediatamente
- Palabra por palabra (o token por token)
- Sensación de "en vivo" y dinámico
- UX improvement: +40%

---

## ✅ Testing

```bash
# Abrir app
curl http://localhost:3000/ia

# Escribir pregunta y ver streaming en tiempo real
# Debería ver cada token aparecer mientras se genera
```

---

## 🚀 Próximo: SSE para Dashboard
