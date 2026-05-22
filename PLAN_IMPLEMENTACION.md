# Plan de Implementación - Módulo Mensajes 🚀

## Recomendación: "Quick Wins + Fundación Sólida"

Enfoque: Implementar en **2-3 semanas** las capacidades que transforman tu sistema de "enviar mensajes" a "campaña profesional".

---

## FASE 1: FUNDACIÓN (Semana 1) ⚡

### Sprint 1.1: Extensión de Schema & Validaciones (2-3 días)

**Archivos a modificar:**
- `prisma/schema.prisma` - Agregar campos a Mensaje y Campana
- `lib/validation.ts` (crear) - Esquemas Zod para validación

**Cambios:**
```prisma
// schema.prisma

// 1. Ampliar Mensaje
model Mensaje {
  // Existentes...
  id                 Int
  contacto_cedula    String?
  campana_id         Int?
  // ... resto ...
  
  // NUEVOS
  es_respuesta       Boolean?    @default(false)
  respondido_en      DateTime?
  requiere_accion    Boolean?    @default(false)
  tipo_accion        String?     @db.VarChar(20) // responder, investigar, derivar
  
  @@index([es_respuesta])
  @@index([requiere_accion])
  @@index([campana_id, estado])
  @@index([contacto_cedula, direccion])
  @@map("mensajes")
}

// 2. Ampliar Campana
model Campana {
  id           Int       @id @default(autoincrement())
  nombre       String    @db.VarChar(120)
  texto_base   String    @db.Text
  estado       String    @default("creada") // NEW: creada, enviando, pausada, cancelada, finalizada
  // ... resto existente ...
  
  // NUEVOS
  pausada_en        DateTime?
  cancelada_en      DateTime?
  cancelada_por     String?
  razon_cancelacion String? @db.Text
  
  @@map("campanas")
}

// 3. Nueva tabla para errores
model MensajeError {
  id              Int       @id @default(autoincrement())
  mensaje_id      Int
  campana_id      Int?
  error_code      String?   @db.VarChar(50)
  error_message   String?   @db.Text
  numero_telefono String?   @db.VarChar(20)
  intentos        Int       @default(0)
  primer_intento  DateTime  @default(now())
  ultimo_intento  DateTime  @updatedAt
  resuelto        Boolean?  @default(false)
  resuelto_por    String?
  notas_resolucion String? @db.Text
  
  @@index([campana_id])
  @@index([resuelto])
  @@map("mensajes_errores")
}

// 4. Nueva tabla para plantillas
model PlantillaMensaje {
  id          Int       @id @default(autoincrement())
  nombre      String    @db.VarChar(100)
  categoria   String    @db.VarChar(40)
  texto       String    @db.Text
  variables   String[]
  creada_por  String
  fecha_creada DateTime @default(now())
  veces_usada Int      @default(0)
  
  @@index([categoria])
  @@map("plantillas_mensajes")
}
```

**Comando:**
```bash
npx prisma migrate dev --name extend_mensaje_campana
```

**Código a agregar:**
```typescript
// lib/validation.ts
import { z } from "zod";

export const schemaEnviarCampana = z.object({
  nombre_campana: z.string().max(100).optional(),
  texto: z.string().min(10, "Mínimo 10 caracteres").max(4096, "Máximo 4096 caracteres"),
  cedulas: z.array(z.string().length(10)).min(1, "Al menos 1 contacto"),
  mediaUrl: z.string().url().optional().nullable(),
  pollOptions: z.array(z.string()).optional(),
});

export const schemaFiltroContactos = z.object({
  barrio: z.string().optional(),
  intencion_voto: z.enum(["positivo", "negativo", "indeciso", "desconocido"]).optional(),
  puesto_votacion: z.string().optional(),
  q: z.string().optional(),
  fecha_desde: z.string().datetime().optional(),
  fecha_hasta: z.string().datetime().optional(),
});
```

**Tiempo estimado:** 3 horas

---

### Sprint 1.2: Dead Letter Queue Básica (2-3 días)

**Archivos a modificar:**
- `lib/whatsapp/queue.ts` - Agregar handler de errores
- `app/api/mensajes/errores/route.ts` (crear) - Endpoint para consultar errores

**Código:**
```typescript
// lib/whatsapp/queue.ts - Agregar al final

export async function setupErrorHandlers() {
  whatsappQueue.on("failed", async (job, err) => {
    const { mensaje_db_id, campana_id, numero } = job.data;
    
    try {
      await prisma.mensajeError.create({
        data: {
          mensaje_id: mensaje_db_id,
          campana_id,
          numero_telefono: numero,
          error_code: err.name,
          error_message: err.message.substring(0, 500),
          intentos: job.attemptsMade,
        },
      });
      
      // Marcar mensaje como fallido
      await prisma.mensaje.update({
        where: { id: mensaje_db_id },
        data: { estado: "fallido" }
      });
      
      logger.warn(`Mensaje ${mensaje_db_id} falló permanentemente. Error: ${err.message}`);
    } catch (e) {
      logger.error("Error guardando MensajeError:", e);
    }
  });
}

// Llamar en inicialización del servidor
if (!isBuildPhase) {
  setupErrorHandlers();
}
```

```typescript
// app/api/mensajes/errores/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campanaId = searchParams.get("campana_id");
  const resuelto = searchParams.get("resuelto");
  
  const errores = await prisma.mensajeError.findMany({
    where: {
      ...(campanaId && { campana_id: parseInt(campanaId) }),
      ...(resuelto !== null && { resuelto: resuelto === "true" }),
    },
    orderBy: { ultimo_intento: "desc" },
    take: 100,
  });
  
  return NextResponse.json({ data: errores, count: errores.length });
}

export async function POST(req: NextRequest) {
  const { errorId, accion, notas } = await req.json();
  
  if (accion === "resolver") {
    await prisma.mensajeError.update({
      where: { id: errorId },
      data: {
        resuelto: true,
        notas_resolucion: notas,
        resuelto_por: "admin@example.com", // TODO: obtener del usuario actual
      }
    });
  }
  
  if (accion === "reintentar") {
    // Reencolar el mensaje
    const error = await prisma.mensajeError.findUnique({ where: { id: errorId } });
    if (error) {
      const mensaje = await prisma.mensaje.findUnique({
        where: { id: error.mensaje_id },
        include: { contacto: true }
      });
      
      if (mensaje && mensaje.contacto?.telefono) {
        await encolarMensajesMasivos([mensaje]);
      }
    }
  }
  
  return NextResponse.json({ success: true });
}
```

**Tiempo estimado:** 4 horas

---

### Sprint 1.3: Validación en Endpoint + Respuestas Inbound (1-2 días)

**Archivos a modificar:**
- `app/api/mensajes/enviar/route.ts` - Agregar validación
- `app/api/mensajes/respuestas/route.ts` (crear) - Endpoint para consultar respuestas

**Código:**
```typescript
// app/api/mensajes/enviar/route.ts - REEMPLAZAR líneas 8-20

import { schemaEnviarCampana } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    // VALIDACIÓN
    const body = await req.json();
    const parsed = schemaEnviarCampana.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    
    const { cedulas, texto, nombre_campana, mediaUrl, pollOptions } = parsed.data;
    
    // Validar que existe al menos 1 línea activa
    const lineasActivas = await prisma.lineaWhatsapp.findMany({
      where: { estado: "conectado" }
    });
    
    if (lineasActivas.length === 0) {
      return NextResponse.json(
        { error: "No hay líneas de WhatsApp conectadas" },
        { status: 400 }
      );
    }
    
    // Rate limiting
    const ip = req.ip || "unknown";
    const { success } = await checkRateLimit(rateLimiters.sendMessage, ip);
    if (!success) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta en 1 minuto" },
        { status: 429 }
      );
    }
    
    // ... resto del código
  } catch (error: any) {
    return handleError(error, "POST /api/mensajes/enviar");
  }
}
```

```typescript
// app/api/mensajes/respuestas/route.ts (nuevo)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campanaId = searchParams.get("campana_id");
  const estado = searchParams.get("estado") || "sin_leer"; // sin_leer, respondido, etc
  const sentimiento = searchParams.get("sentimiento"); // positivo, negativo, etc
  
  const respuestas = await prisma.mensaje.findMany({
    where: {
      direccion: "recibido",
      ...(campanaId && { campana_id: parseInt(campanaId) }),
      ...(sentimiento && { sentimiento }),
      es_respuesta: true,
    },
    include: {
      contacto: {
        select: { nombre: true, telefono: true, cedula: true }
      },
      campana: {
        select: { nombre: true }
      }
    },
    orderBy: { fecha: "desc" },
    take: 100,
  });
  
  return NextResponse.json({ data: respuestas, count: respuestas.length });
}
```

**Tiempo estimado:** 3 horas

---

## FASE 2: FUNCIONALIDADES CORE (Semana 2) 🎯

### Sprint 2.1: Control de Campañas (Pausar/Cancelar) (1-2 días)

**Archivos:**
- `app/api/campanas/[id]/estado/route.ts` (crear)
- `app/api/campanas/[id]/acciones/route.ts` (crear)

**Código:**
```typescript
// app/api/campanas/[id]/estado/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const campanaId = parseInt(params.id);
  const { accion } = await req.json(); // "pausar", "reanudar", "cancelar"
  
  const campana = await prisma.campana.findUnique({ where: { id: campanaId } });
  if (!campana) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  
  try {
    if (accion === "pausar") {
      await prisma.campana.update({
        where: { id: campanaId },
        data: { estado: "pausada", pausada_en: new Date() }
      });
    } else if (accion === "reanudar") {
      await prisma.campana.update({
        where: { id: campanaId },
        data: { estado: "enviando", pausada_en: null }
      });
    } else if (accion === "cancelar") {
      const { razon } = await req.json();
      
      // Marcar todos los pendientes como cancelados
      await prisma.mensaje.updateMany({
        where: { campana_id: campanaId, estado: "pendiente" },
        data: { estado: "cancelado" }
      });
      
      await prisma.campana.update({
        where: { id: campanaId },
        data: {
          estado: "cancelada",
          cancelada_en: new Date(),
          cancelada_por: "admin@example.com", // TODO: obtener usuario
          razon_cancelacion: razon
        }
      });
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

**Tiempo estimado:** 2 horas

---

### Sprint 2.2: Filtros Avanzados (2-3 días)

**Archivos:**
- `app/api/contactos/filtrar/route.ts` (crear) - Nuevo endpoint flexible
- `lib/whatsapp/filters.ts` (crear) - Lógica de filtros

**Código:**
```typescript
// lib/whatsapp/filters.ts
import { Prisma } from "@prisma/client";

export function buildContactoFilters(params: Record<string, string>): Prisma.ContactoWhereInput {
  const filters: Prisma.ContactoWhereInput = {
    AND: [
      // Barrio
      params.barrio && params.barrio !== "Todos"
        ? { barrio: params.barrio }
        : {},
      
      // Intención de voto
      params.intencion_voto && params.intencion_voto !== "todos"
        ? { intencion_voto: params.intencion_voto }
        : {},
      
      // Búsqueda por nombre/cédula
      params.q
        ? {
            OR: [
              { nombre: { contains: params.q, mode: "insensitive" } },
              { cedula: { contains: params.q } }
            ]
          }
        : {},
      
      // Puesto de votación
      params.puesto_votacion
        ? { puesto_votacion: params.puesto_votacion }
        : {},
      
      // Rango de fechas
      params.fecha_desde || params.fecha_hasta
        ? {
            fecha_registro: {
              ...(params.fecha_desde && { gte: new Date(params.fecha_desde) }),
              ...(params.fecha_hasta && { lte: new Date(params.fecha_hasta) }),
            }
          }
        : {},
      
      // Excluir campanas anteriores
      params.excluir_campana_id
        ? {
            mensajes: {
              none: {
                campana_id: parseInt(params.excluir_campana_id),
                estado: "enviado"
              }
            }
          }
        : {},
    ].filter(f => Object.keys(f).length > 0),
  };
  
  return filters;
}
```

```typescript
// app/api/contactos/filtrar/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { buildContactoFilters } from "@/lib/whatsapp/filters";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = 100;
  
  const filters = buildContactoFilters(Object.fromEntries(searchParams));
  
  const [contactos, total] = await Promise.all([
    prisma.contacto.findMany({
      where: filters,
      select: { cedula: true, nombre: true, telefono: true, barrio: true, intencion_voto: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { fecha_registro: "desc" }
    }),
    prisma.contacto.count({ where: filters })
  ]);
  
  return NextResponse.json({
    data: contactos,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  });
}
```

**Tiempo estimado:** 4-5 horas

---

### Sprint 2.3: Dashboard de Respuestas (2-3 días)

**Archivos:**
- `app/(dashboard)/mensajes/respuestas/page.tsx` (crear)
- `app/api/mensajes/respuestas/estadisticas/route.ts` (crear)

**Funcionalidad principal:**
- Tabla de respuestas por campaña
- Filtros: Sentimiento, Estado, Fecha
- Vista de conversación por contacto
- Opción de marcar como resuelta/respondida

**Tiempo estimado:** 5-6 horas

---

### Sprint 2.4: Plantillas de Mensajes (1-2 días)

**Archivos:**
- `app/api/plantillas/route.ts` (crear)
- Interfaz en Paso 1 para "Usar plantilla"

**Tiempo estimado:** 3 horas

---

## FASE 3: OPTIMIZACIÓN & WEBSOCKET (Semana 3) 🚀

### Sprint 3.1: Reemplazar Polling con WebSocket (2-3 días)

**Archivos:**
- `lib/socket-server.ts` (crear) - Configuración Socket.io
- `app/api/socket/route.ts` (crear) - Handler HTTP
- `lib/whatsapp/queue.ts` - Integrar emits

**Referencia:** Ver RECOMENDACIONES_TECNICAS.md sección 2

**Tiempo estimado:** 6-8 horas

---

### Sprint 3.2: Analytics Dashboard (1-2 días)

**Agregar gráficos al Paso 3:**
- Gráfico de progreso en tiempo real
- Tasa de entrega por línea
- Tasa de respuesta por campaña
- Comparativa entre campañas

**Usar librería:** Recharts o Chart.js

**Tiempo estimado:** 4-5 horas

---

## RESUMEN TIMELINE

```
Semana 1:
  ├─ Lunes: Schema + Validaciones (3h) → Miércoles
  ├─ Miércoles: Dead Letter Queue (4h) → Jueves
  └─ Viernes: Validación + Respuestas Inbound (3h) → Lunes

Semana 2:
  ├─ Lunes: Control de Campañas (2h) → Martes
  ├─ Martes-Miércoles: Filtros Avanzados (5h) → Jueves
  ├─ Jueves-Viernes: Dashboard de Respuestas (5h) → Lunes
  └─ Lunes: Plantillas (3h) → Martes

Semana 3:
  ├─ Lunes-Miércoles: WebSocket (8h) → Jueves
  └─ Jueves-Viernes: Analytics (4h) → Fin

TOTAL: ~45-50 horas (1 dev a tiempo completo, ~2.5 semanas)
```

---

## ORDEN RECOMENDADO (Por Impacto + Facilidad)

### Quick Wins (Hacer PRIMERO)
1. ✅ Schema + Validaciones → **impacto medio, esfuerzo bajo**
2. ✅ Validación en endpoint → **impacto alto, esfuerzo bajo**
3. ✅ Dead Letter Queue → **impacto alto, esfuerzo medio**
4. ✅ Respuestas Inbound UI → **impacto muy alto, esfuerzo medio**
5. ✅ Filtros Avanzados → **impacto alto, esfuerzo medio**

### Luego (Pulir)
6. ✅ Control de campañas (pausar/cancelar)
7. ✅ Plantillas
8. ✅ WebSocket
9. ✅ Analytics

---

## TESTING RECOMENDADO

Para cada sprint:
1. **Unitarios:** Validadores, funciones de filtro
2. **Integración:** Endpoints con BD
3. **E2E:** Flujo completo (redactar → filtrar → enviar → monitorear)

---

## RISKS & MITIGACIÓN

| Risk | Mitigation |
|------|-----------|
| Baileys/WhatsApp bloquea líneas | DLQ + reintentos manuales |
| Polling lento en monitoreo | WebSocket (Fase 3) |
| Errores silenciosos | Logging + MensajeError table |
| Filtros lentos con muchos contactos | Índices + Paginación |
| Campaña cancelada pero mensajes siguen enviándose | Verificar estado en worker |

