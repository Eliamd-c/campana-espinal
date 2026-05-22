# Recomendaciones Técnicas - Módulo Mensajes 🔧

## 1. ARQUITECTURA DE RESPUESTAS INBOUND 📥

### Problema Actual
Las respuestas se procesan en `/api/whatsapp/procesar-mensaje` (IA + análisis), se guardan en BD pero no hay forma de consultarlas o trabajar con ellas.

### Solución Recomendada

#### A. Extensión del Modelo `Mensaje`
```prisma
model Mensaje {
  // Campos existentes...
  
  // Nuevos campos para mejor trazabilidad
  mensaje_padre_id    Int?        // Para threads de conversación
  es_respuesta        Boolean?    @default(false)
  respondido_en       DateTime?
  requiere_accion     Boolean?    @default(false)
  tipo_accion         String?     @db.VarChar(20) // "responder", "investigar", "derivar"
  
  // Para métricas
  fecha_visto         DateTime?   // Cuando un admin lo vio
  visto_por_user_id   String?
  
  mensaje_padre       Mensaje?    @relation("ThreadMensajes", fields: [mensaje_padre_id], references: [id])
  respuestas          Mensaje[]   @relation("ThreadMensajes")
  
  @@index([es_respuesta])
  @@index([requiere_accion])
  @@map("mensajes")
}
```

#### B. Nuevos Endpoints
```
GET  /api/mensajes/respuestas?campana_id=X&estado=sin_leer
GET  /api/mensajes/conversaciones?contacto_cedula=XXXXX
GET  /api/mensajes/reportar?filtro=requiere_accion
POST /api/mensajes/:id/marcar-visto
POST /api/mensajes/:id/asignar-accion
```

#### C. UI: "Bandeja de Respuestas"
```
┌─────────────────────────────────────────────┐
│ Respuestas de Campaña                       │
├─────────────────────────────────────────────┤
│ Filtros: Campaña | Sentimiento | Estado    │
├─────────────────────────────────────────────┤
│ Sin leer: 12  |  Positivos: 45  | Negativos: 8
├─────────────────────────────────────────────┤
│ [Avatar] Juan Pérez      "Cuando es el..."  │
│ Positivo | 2m ago | Ver conversación        │
│                                             │
│ [Avatar] María López     "No coincido..."    │
│ Negativo | 5m ago | Ver conversación        │
└─────────────────────────────────────────────┘
```

---

## 2. IMPLEMENTAR WEBSOKET PARA MONITOREO EN VIVO 🔌

### Problema Actual
Polling cada 3 segundos desde frontend consume recursos, es ineficiente y genera latencia.

### Solución Recomendada: Socket.io + Servidor Node

#### Estructura
```
lib/
  socket-server.ts          // Instancia Socket.io
  socket-namespaces.ts      // Handlers por contexto
  
app/api/
  socket/
    route.ts                // Socket.io HTTP handler
```

#### Implementación Básica
```typescript
// lib/socket-server.ts
import { Server } from "socket.io";
import { createServer } from "http";

export const getIO = () => {
  // Singleton en desarrollo
  const globalForSocket = global as any;
  if (!globalForSocket.io) {
    globalForSocket.io = new Server({
      cors: { origin: "*" },
      transports: ["websocket", "polling"],
    });
  }
  return globalForSocket.io;
};

export const emitCampanaUpdate = (campanaId: number, stats: any) => {
  const io = getIO();
  io.to(`campana:${campanaId}`).emit("stats_update", stats);
};
```

#### En la Cola (BullMQ)
```typescript
// Cuando actualizar estado de mensaje
whatsappQueue.on("progress", (job, progress) => {
  // Emitir update por socket
  emitCampanaUpdate(job.data.campana_id, {
    mensaje_id: job.data.mensaje_db_id,
    estado: "enviado",
    timestamp: new Date(),
  });
});
```

#### En Frontend
```typescript
// useEffect en Paso 3 (Monitoreo)
useEffect(() => {
  if (!socket) return;
  
  socket.emit("join", `campana:${activeCampanaId}`);
  socket.on("stats_update", (data) => {
    setLiveStats(prev => ({ ...prev, ...data }));
  });
  
  return () => {
    socket.emit("leave", `campana:${activeCampanaId}`);
  };
}, [activeCampanaId, socket]);
```

**Ventajas:**
- Sin polling, updates instantáneos
- Escalable (Socket.io maneja 1M+ conexiones)
- Reduce carga de BD
- Mejor UX

---

## 3. DEAD LETTER QUEUE PARA ERRORES 🗑️

### Problema Actual
Si un mensaje falla 3 veces en la cola, se descarta silenciosamente. No sabes por qué falló o quién no recibió nada.

### Solución Recomendada

#### Modelo en BD
```prisma
model MensajeError {
  id                Int       @id @default(autoincrement())
  mensaje_id        Int
  campana_id        Int?
  error_code        String?   @db.VarChar(50)
  error_message     String?   @db.Text
  numero_telefono   String?   @db.VarChar(20)
  intentos          Int       @default(0)
  primer_intento    DateTime  @default(now())
  ultimo_intento    DateTime  @updatedAt
  resuelto          Boolean?  @default(false)
  resuelto_por      String?
  notas_resolucion  String?   @db.Text
  
  @@index([campana_id])
  @@index([resuelto])
  @@map("mensajes_errores")
}
```

#### Implementación en Queue
```typescript
// lib/whatsapp/queue.ts
whatsappQueue.on("failed", async (job, err) => {
  const { mensaje_db_id, campana_id, numero } = job.data;
  
  await prisma.mensajeError.create({
    data: {
      mensaje_id: mensaje_db_id,
      campana_id,
      numero_telefono: numero,
      error_code: err.name,
      error_message: err.message,
      intentos: job.attemptsMade,
    },
  });
  
  // Notificar admin por webhook/email
  fetch(`${process.env.ADMIN_WEBHOOK_URL}`, {
    method: "POST",
    body: JSON.stringify({
      tipo: "mensaje_fallido",
      mensaje_id: mensaje_db_id,
      error: err.message,
      intentos: job.attemptsMade,
    }),
  });
});
```

#### UI: Dashboard de Errores
```
GET /api/mensajes/errores?campana_id=X&resuelto=false
POST /api/mensajes/errores/:id/resolver
POST /api/mensajes/errores/:id/reintentar
```

---

## 4. FILTROS AVANZADOS CON QUERY BUILDER 🔍

### Problema Actual
Solo tienes 2 filtros hardcodeados. Para algo flexible, necesitas un query builder.

### Solución Recomendada

#### Endpoint Unificado
```typescript
// GET /api/contactos/filter
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  
  const filters: Prisma.ContactoWhereInput = {
    AND: [
      // Barrio
      searchParams.get("barrio") && searchParams.get("barrio") !== "Todos"
        ? { barrio: searchParams.get("barrio") }
        : {},
      
      // Rango de fechas
      searchParams.has("fecha_desde") || searchParams.has("fecha_hasta")
        ? {
            fecha_registro: {
              ...(searchParams.get("fecha_desde") && {
                gte: new Date(searchParams.get("fecha_desde")!),
              }),
              ...(searchParams.get("fecha_hasta") && {
                lte: new Date(searchParams.get("fecha_hasta")!),
              }),
            },
          }
        : {},
      
      // Intención de voto
      searchParams.get("intencion_voto") && searchParams.get("intencion_voto") !== "todos"
        ? { intencion_voto: searchParams.get("intencion_voto") }
        : {},
      
      // Búsqueda por nombre/cédula
      searchParams.get("q")
        ? {
            OR: [
              { nombre: { contains: searchParams.get("q"), mode: "insensitive" } },
              { cedula: { contains: searchParams.get("q") } },
            ],
          }
        : {},
      
      // Puesto de votación
      searchParams.get("puesto_votacion")
        ? { puesto_votacion: searchParams.get("puesto_votacion") }
        : {},
    ],
  };
  
  const contactos = await prisma.contacto.findMany({
    where: filters,
    select: { cedula: true, nombre: true, telefono: true, barrio: true },
    take: 5000,
  });
  
  return NextResponse.json({ data: contactos, count: contactos.length });
}
```

#### UI: Filtros Dinámicos
```typescript
// Crear componente reutilizable
<FilterBuilder onChange={(filters) => setActiveFilters(filters)}>
  <FilterField name="barrio" type="select" />
  <FilterField name="intencion_voto" type="select" />
  <FilterField name="fecha_registro" type="daterange" />
  <FilterField name="puesto_votacion" type="select" />
  <FilterField name="q" type="text" placeholder="Nombre o cédula" />
</FilterBuilder>
```

---

## 5. PLANTILLAS DE MENSAJES 📝

### Modelo
```prisma
model PlantillaMensaje {
  id          Int       @id @default(autoincrement())
  nombre      String    @db.VarChar(100)
  categoria   String    @db.VarChar(40) // evento, agradecimiento, llamado_accion, etc
  texto       String    @db.Text
  variables   String[]  // ["{{nombre}}", "{{evento}}"]
  creada_por  String
  fecha_creada DateTime @default(now())
  veces_usada Int      @default(0)
  
  @@index([categoria])
  @@map("plantillas_mensajes")
}
```

### Endpoints
```
POST   /api/plantillas
GET    /api/plantillas?categoria=X
PUT    /api/plantillas/:id
DELETE /api/plantillas/:id
POST   /api/plantillas/:id/usar  // Incrementar contador
```

---

## 6. PAUSA/CANCELACIÓN DE CAMPAÑAS 🛑

### Schema Update
```prisma
model Campana {
  // ... campos existentes
  estado  String  @default("creada") 
          // creada, enviando, pausada, cancelada, finalizada
  pausada_en      DateTime?
  cancelada_en    DateTime?
  cancelada_por   String?
  razon_cancelacion String? @db.Text
}
```

### Endpoints
```
POST /api/campanas/:id/pausar
POST /api/campanas/:id/reanudar
POST /api/campanas/:id/cancelar

// Cuando cancelas, marcar todos pendientes como cancelados
// y guardar auditoría
```

### Lógica en Queue
```typescript
// En el worker que procesa jobs
whatsappQueue.process(async (job) => {
  const { campana_id } = job.data;
  
  // Verificar que campaña no está cancelada
  const campana = await prisma.campana.findUnique({ where: { id: campana_id } });
  
  if (campana?.estado === "cancelada") {
    // Skip job, no procesar
    return;
  }
  
  // ... enviar mensaje
});
```

---

## 7. A/B TESTING (MVP)

### Modelo
```prisma
model CampanaVariacion {
  id         Int      @id @default(autoincrement())
  campana_id Int
  texto      String   @db.Text
  orden      Int      // cual variación recibe qué %
  campana    Campana  @relation(fields: [campana_id], references: [id], onDelete: Cascade)
  
  mensajes   Mensaje[] // relación inversa
  
  @@map("campana_variaciones")
}
```

**Nota:** Ya existe en schema. Solo falta UI para:
1. Crear variaciones al redactar
2. Asignar % de distribución
3. Dashboard comparativo de respuestas

---

## 8. OPTIMIZACIONES DE PERFORMANCE

### 1. Índices en BD
```sql
-- Agregar a Prisma schema
Mensaje:
  @@index([campana_id, estado])
  @@index([contacto_cedula, direccion])
  @@index([fecha])

Contacto:
  @@index([nombre])
  @@index([barrio, intencion_voto])
```

### 2. Caching de Audiencia
```typescript
// Cachear resultados de filtros por 1 minuto
const cacheKey = `audience:${JSON.stringify(filters)}`;
const cached = await redis.get(cacheKey);

if (cached) return JSON.parse(cached);

const result = await fetchContactos(filters);
await redis.setex(cacheKey, 60, JSON.stringify(result));

return result;
```

### 3. Paginación
```typescript
// En lugar de limit: 5000
const page = searchParams.get("page") || "1";
const pageSize = 100;

const [contactos, total] = await Promise.all([
  prisma.contacto.findMany({ skip: (parseInt(page) - 1) * pageSize, take: pageSize }),
  prisma.contacto.count({ where: filters }),
]);

return { data: contactos, total, page, pageSize };
```

---

## 9. VALIDACIONES ROBUSTAS 🛡️

### Crear Validador
```typescript
// lib/validation.ts
import { z } from "zod";

export const schemaEnviarCampana = z.object({
  nombre_campana: z.string().max(100).optional(),
  texto: z.string().min(1).max(4096), // Límite WhatsApp
  cedulas: z.array(z.string().length(10, "Cédula inválida")),
  mediaUrl: z.string().url().optional(),
  pollOptions: z.array(z.string()).optional(),
});
```

### Usar en Endpoint
```typescript
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schemaEnviarCampana.safeParse(body);
  
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten() },
      { status: 400 }
    );
  }
  
  // ... procesar
}
```

---

## 10. AUDITORÍA COMPLETA 📋

### Aprovechar Tabla Existente
```prisma
// Ya existe Auditoria model, usarlo así:

Cuando creas campaña:
  await logAuditoria("campana", campanaId, "CREATE", null, campaña)

Cuando envías:
  await logAuditoria("campana", campaña.id, "UPDATE", 
    { estado: "creada" }, 
    { estado: "enviando" })

Cuando cancelas:
  await logAuditoria("campana", campaña.id, "DELETE", {...}, null)
```

### Dashboard de Auditoría
```
GET /api/auditoria?tabla=campana&registro_id=X
```

---

## RESUMEN DE CAMBIOS A SCHEMA

```prisma
// Agregar/Modificar

1. Mensaje
   + mensaje_padre_id
   + es_respuesta
   + respondido_en
   + requiere_accion
   + tipo_accion
   + fecha_visto
   + visto_por_user_id

2. Campana
   - Cambiar "estado" enum
   + pausada_en
   + cancelada_en
   + cancelada_por
   + razon_cancelacion

3. Nuevas tablas
   + MensajeError
   + PlantillaMensaje
   + CampanaVariacion (ya existe, pero completar)

4. Índices mejorados
   + Varios para performance
```

