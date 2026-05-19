# 📊 DISTRIBUTED TRACING: Observabilidad Total (3-4 horas)

## Impacto
- 🔍 **Ve EXACTAMENTE dónde tarda cada operación**
- 📈 **Debugging 10x más fácil**
- 🚀 **Performance tuning data-driven**

---

## Solución Completa

### Paso 1: Instalar OpenTelemetry

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto \
  @opentelemetry/sdk-trace-node @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/instrumentation-prisma @opentelemetry/instrumentation-http
```

### Paso 2: Configurar en `lib/tracing.ts`

```typescript
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  getNodeAutoInstrumentations,
} from "@opentelemetry/auto-instrumentations-node";
import { AutoLoaderCompat } from "@opentelemetry/instrumentation";

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces",
});

const traceProvider = new NodeTracerProvider();
traceProvider.addSpanProcessor(new BatchSpanProcessor(traceExporter));

traceProvider.register();

const instrumentations = getNodeAutoInstrumentations({
  "@opentelemetry/instrumentation-fs": {
    enabled: false,
  },
});

for (const instrumentation of instrumentations) {
  instrumentation.setTracerProvider(traceProvider);
  instrumentation.enable();
}

export const tracer = traceProvider.getTracer("campana-espinal");
```

### Paso 3: Usar en endpoints críticos

Crear `lib/tracing-helpers.ts`:

```typescript
import { tracer } from "@/lib/tracing";
import { context } from "@opentelemetry/api";

/**
 * Wrapper para trazar operaciones de BD
 */
export async function traceBDOperation<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  const span = tracer.startSpan(name);

  return context.with(
    context.active().with(
      context.active().setValue("span", span)
    ),
    async () => {
      const start = Date.now();
      try {
        const result = await operation();
        const duration = Date.now() - start;
        
        span.setAttributes({
          "db.operation": name,
          "db.duration_ms": duration,
          "db.status": "success",
        });

        return result;
      } catch (error: any) {
        const duration = Date.now() - start;
        
        span.setAttributes({
          "db.operation": name,
          "db.duration_ms": duration,
          "db.status": "error",
          "db.error": error.message,
        });

        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Wrapper para trazar llamadas a IA
 */
export async function traceAICall<T>(
  model: string,
  operation: () => Promise<T>
): Promise<T> {
  const span = tracer.startSpan("ai.call", {
    attributes: { "ai.model": model },
  });

  return context.with(
    context.active().with(
      context.active().setValue("span", span)
    ),
    async () => {
      const start = Date.now();
      try {
        const result = await operation();
        const duration = Date.now() - start;

        span.setAttributes({
          "ai.duration_ms": duration,
          "ai.status": "success",
        });

        return result;
      } catch (error: any) {
        span.recordException(error);
        span.setStatus({ code: 2, message: error.message });
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Wrapper para trazar búsquedas
 */
export async function traceSearch<T>(
  query: string,
  operation: () => Promise<T>
): Promise<T> {
  const span = tracer.startSpan("search", {
    attributes: { "search.query": query },
  });

  const start = Date.now();
  try {
    const result = await operation();
    span.addEvent("search.completed", {
      "search.duration_ms": Date.now() - start,
    });
    return result;
  } catch (error: any) {
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}
```

### Paso 4: Integrar en endpoints

Actualizar `app/api/contactos/route.ts`:

```typescript
import { traceBDOperation } from "@/lib/tracing-helpers";

export async function GET(req: NextRequest) {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = FiltroContactosSchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }

    const { barrio, limit } = parsed.data;

    // Trazar la operación de BD
    const contactos = await traceBDOperation(
      "get_contactos",
      async () => {
        return prisma.contacto.findMany({
          where: barrio ? { barrio } : {},
          select: { cedula: true, nombre: true, telefono: true },
          take: limit,
        });
      }
    );

    const total = await traceBDOperation(
      "count_contactos",
      async () => {
        return prisma.contacto.count({
          where: barrio ? { barrio } : {},
        });
      }
    );

    return NextResponse.json({ data: contactos, meta: { total } });
  } catch (error) {
    return handleError(error, "GET /api/contactos");
  }
}
```

Actualizar `app/api/ia/analisis/route.ts`:

```typescript
import { traceAICall, traceBDOperation } from "@/lib/tracing-helpers";

export async function POST(req: NextRequest) {
  try {
    const { tipo, preguntaAnalista, sesionId } = await req.json();

    if (tipo === "analista" && preguntaAnalista && sesionId) {
      // Trazar obtención del historial
      const historial = await traceBDOperation(
        "get_chat_history",
        async () => {
          return prisma.chatMemoria.findMany({
            where: { sesion_id: sesionId },
            take: 12,
          });
        }
      );

      // Trazar llamada a IA
      const respuestaIA = await traceAICall(
        "gemini-2.5-flash",
        async () => {
          return generarConHerramientas(
            preguntaAnalista,
            historial.map((h) => ({ rol: h.rol, contenido: h.contenido })),
            TOOL_DEFINITIONS,
            ejecutarHerramienta
          );
        }
      );

      // Trazar guardado de respuesta
      await traceBDOperation(
        "save_chat_message",
        async () => {
          return prisma.chatMemoria.create({
            data: {
              sesion_id: sesionId,
              rol: "assistant",
              contenido: respuestaIA,
            },
          });
        }
      );

      return NextResponse.json({ data: respuestaIA });
    }
  } catch (error) {
    return handleError(error, "POST /api/ia/analisis");
  }
}
```

### Paso 5: Dashboard de Observabilidad

Para visualizar traces, usa **Jaeger** (local) o **Grafana Tempo**:

```bash
# Instalar Jaeger localmente
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 4318:4318 \
  -p 16686:16686 \
  jaegertracing/all-in-one:latest

# Luego accede a http://localhost:16686
```

---

## 📊 Ejemplo de Trace

Verías algo como:

```
Request: GET /api/contactos
├─ parse_params (2ms)
├─ get_contactos (45ms)
│  ├─ db.query (40ms)
│  └─ serialize_response (5ms)
├─ count_contactos (50ms)
│  └─ db.count (50ms)
└─ send_response (3ms)
───────────────────────────────
Total: 100ms

Request: POST /api/ia/analisis
├─ parse_body (5ms)
├─ get_chat_history (30ms)
│  └─ db.query (30ms)
├─ ai.call (1200ms)
│  ├─ gemini.api (1100ms)
│  └─ parse_response (100ms)
├─ execute_tools (200ms)
│  ├─ tool_1 (80ms)
│  ├─ tool_2 (90ms)
│  └─ tool_3 (30ms)
├─ save_response (40ms)
│  └─ db.insert (40ms)
└─ send_response (5ms)
───────────────────────────────
Total: 1480ms
```

---

## 💡 Uso Real

Con esta información puedes:

1. **Identificar cuellos de botella:** "¿Por qué IA tarda 1.1s? → Gemini API issue"
2. **Optimizar queries:** "¿Por qué count_contactos tarda 50ms? → Agregar índice"
3. **Monitorear en prod:** "¿Qué endpoints están lentos ahora? → Dashboard te muestra"

---

## 🎯 Resultado

- Antes: "La app está lenta" (sin saber dónde)
- Después: "IA call tarda 1.1s, pero es Gemini API. BD queries son OK"

---

## 📚 Referencias
- [OpenTelemetry](https://opentelemetry.io/)
- [Jaeger](https://www.jaegertracing.io/)
- [Distributed Tracing Best Practices](https://docs.honeycomb.io/getting-data-in/distributed-tracing/)
