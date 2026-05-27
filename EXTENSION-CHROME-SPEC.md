# Extensión Chrome para Envío Masivo — Guía Técnica de Implementación

> **Para el desarrollador:** Este documento es la especificación completa para migrar el sistema de envío masivo de WhatsApp desde `whatsapp-web.js` + Redis/BullMQ hacia una extensión Chrome que opera en perfiles reales del navegador. Contiene código completo para cada archivo, cambios exactos al schema de Prisma, y los tres endpoints nuevos de la API.

---

## 0. Resumen Ejecutivo

### Por qué migramos

El sistema actual (`bot/worker-wwebjs.ts`) controla Chrome con Puppeteer desde el servidor. El problema no es técnico sino operativo: mantener 5 instancias de Chrome corriendo estables en el servidor, reconectándolas cuando se caen, sincronizando con Redis, es frágil y difícil de depurar. Además requiere que Redis y un proceso Node.js estén corriendo 24/7 además del servidor Next.js.

### Qué cambia

| Componente | Antes | Después |
|---|---|---|
| Sesiones WhatsApp | `.wwebjs_auth/` en disco, gestionadas por Puppeteer | Perfiles nativos de Chrome, gestionados por Chrome |
| Worker | `bot/worker-wwebjs.ts` corriendo en servidor | Extensión Chrome corriendo en el PC del operador |
| Cola de mensajes | BullMQ + Redis (proceso separado) | Timestamps `enviar_en` en PostgreSQL (sin Redis) |
| Proxy por línea | Pasado a cada instancia Puppeteer | `chrome.proxy` API — todo el tráfico del perfil va por el proxy |
| Reconexión | Código manual en el worker | Chrome la hace solo (como cualquier pestaña) |
| Detección por WhatsApp | Muy baja (wwebjs es bueno) | Cero — es Chrome real |

### Qué NO cambia

- La lógica de round-robin y distribución de mensajes
- Los modos Normal y Calentamiento con sus tiempos
- El límite de 45 mensajes/día por línea
- El jitter anti-spam
- La UI del dashboard (salvo una pantalla de Líneas levemente modificada)
- Los modelos `Campana`, `Mensaje`, `Contacto`, `MensajeError`

---

## 1. Arquitectura del Nuevo Sistema

```
┌─────────────────────────────────────────────────┐
│              Dashboard (Next.js)                │
│                                                 │
│  POST /api/mensajes/enviar                      │
│    → calcula delays (igual que hoy)             │
│    → guarda mensajes en BD con enviar_en        │
│    → NO usa BullMQ ni Redis                     │
│                                                 │
│  GET  /api/extension/poll?lineaId=X&token=T     │
│    → retorna jobs donde enviar_en <= NOW        │
│                                                 │
│  POST /api/extension/register                   │
│    → retorna proxy + config de la línea         │
│                                                 │
│  POST /api/extension/report                     │
│    → recibe resultado: enviado | error          │
└──────────────┬──────────────────────────────────┘
               │ HTTP polling cada 3 segundos
               │ (sin WebSocket, sin Redis)
               ▼
┌─────────────────────────────────────────────────┐
│          Extensión Chrome (Manifest V2)         │
│  Instalada en CADA uno de los 5 perfiles Chrome │
│                                                 │
│  background.js (página persistente)             │
│    • Al arrancar: llama /register               │
│    • Setea chrome.proxy con el proxy asignado   │
│    • Maneja autenticación del proxy             │
│                                                 │
│  content.js (inyectado en web.whatsapp.com)     │
│    • Hace polling a /poll cada 3 segundos       │
│    • Recibe job: { numero, texto, mensajeId }   │
│    • Espera micro-jitter (1–3 segundos)         │
│    • Navega a URL de envío de WhatsApp Web      │
│    • Espera botón Enviar, hace click            │
│    • Reporta resultado a /report                │
│                                                 │
│  popup.html                                     │
│    • Muestra: línea conectada / modo / enviados │
└──────────────┬──────────────────────────────────┘
               │ Chrome real, sesión nativa
               ▼
┌─────────────────────────────────────────────────┐
│         WhatsApp Web (perfil Chrome 1)          │
│   Indistinguible de un humano usando el nav.    │
│   Todo el tráfico pasa por Proxy 1              │
└─────────────────────────────────────────────────┘
```

---

## 2. Cambios en la Base de Datos (Prisma)

### 2.1 Modificar `LineaWhatsapp`

Agregar cuatro campos al modelo existente:

```prisma
model LineaWhatsapp {
  id                    Int       @id @default(autoincrement())
  numero_telefono       String?   @db.VarChar(20)
  nombre                String?   @db.VarChar(80)
  estado                String?   @default("desconectado") @db.VarChar(20)
  qr_actual             String?   @db.Text
  proxyUrl              String?   @db.Text
  limite_diario         Int?      @default(45)
  mensajes_enviados_hoy Int?      @default(0)
  ultimo_reinicio_limite DateTime?
  ultima_conexion       DateTime?
  fecha_creacion        DateTime  @default(now())

  // NUEVOS CAMPOS — extensión Chrome
  token_extension       String?   @db.VarChar(100)  // UUID para autenticar la extensión
  extension_activa      Boolean   @default(false)    // true cuando la extensión está conectada
  extension_ultima_vez  DateTime?                    // última vez que hizo poll (heartbeat)
  modo_envio            String    @default("normal") @db.VarChar(20) // "normal" | "calentamiento"

  mensajes              Mensaje[]

  @@map("lineas_whatsapp")
}
```

### 2.2 Modificar `Mensaje`

Agregar el campo de tiempo programado (reemplaza el delay de BullMQ):

```prisma
model Mensaje {
  id                 Int       @id @default(autoincrement())
  contacto_cedula    String?   @db.VarChar(12)
  campana_id         Int?
  linea_id           Int?
  texto              String?   @db.Text
  instancia_zona     String?   @db.VarChar(40)
  direccion          String?   @db.VarChar(10)
  estado             String?   @default("pendiente") @db.VarChar(10)
  categoria          String?   @db.VarChar(40)
  sentimiento        String?   @db.VarChar(10)
  requiere_respuesta Boolean?  @default(false)
  fecha              DateTime? @default(now())
  es_respuesta       Boolean?  @default(false)
  respondido_en      DateTime?
  requiere_accion    Boolean?  @default(false)
  tipo_accion        String?   @db.VarChar(20)

  // NUEVO CAMPO — reemplaza el delay de BullMQ
  enviar_en          DateTime?  // cuándo debe ejecutarse este mensaje
  intentos           Int        @default(0) // para el retry sin BullMQ

  contacto Contacto?      @relation(fields: [contacto_cedula], references: [cedula])
  campana  Campana?       @relation(fields: [campana_id], references: [id])
  linea    LineaWhatsapp? @relation(fields: [linea_id], references: [id])

  @@index([enviar_en]) // índice crítico para el polling
  @@index([estado, enviar_en, linea_id]) // índice compuesto para el poll

  // ... resto de índices existentes sin cambio
  @@map("mensajes")
}
```

### 2.3 Migración

```bash
npx prisma migrate dev --name extension_chrome
```

Esto genera el SQL automáticamente. Verifica que incluya:
```sql
ALTER TABLE "lineas_whatsapp" 
  ADD COLUMN "token_extension" VARCHAR(100),
  ADD COLUMN "extension_activa" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "extension_ultima_vez" TIMESTAMP(3),
  ADD COLUMN "modo_envio" VARCHAR(20) NOT NULL DEFAULT 'normal';

ALTER TABLE "mensajes"
  ADD COLUMN "enviar_en" TIMESTAMP(3),
  ADD COLUMN "intentos" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "mensajes_enviar_en_idx" ON "mensajes"("enviar_en");
CREATE INDEX "mensajes_estado_enviar_en_linea_id_idx" ON "mensajes"("estado", "enviar_en", "linea_id");
```

---

## 3. Cambios en el Backend (Next.js)

### 3.1 Reemplazar BullMQ con Timestamps en BD

**Archivo:** `lib/whatsapp/queue.ts`

Reemplazar el archivo completo. La lógica de distribución, round-robin, delays y modos es idéntica — solo cambia el destino final: en vez de insertar en BullMQ, escribe `enviar_en` en la BD.

```typescript
// lib/whatsapp/queue.ts — NUEVA VERSIÓN (sin Redis, sin BullMQ)
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';

// ─── Tipos (sin cambio respecto al sistema anterior) ───────────────────────

export interface MensajeParaEncolar {
  id: number;
  texto: string | null;
  contacto_cedula: string | null;
  mediaUrl?: string | null;
  pollOptions?: string[] | null;
  contacto: { telefono: string | null } | null;
}

export interface ResultadoEncolado {
  encolados: number;
  pendientes: number;
}

// ─── Constantes de timing (idénticas al sistema anterior) ──────────────────

const INTER_MSG_NORMAL_MS    = 3 * 60_000;    // 3 min entre mensajes misma línea
const INTER_LINEA_NORMAL_MS  = 20_000;        // 20 seg stagger entre líneas
const JITTER_NORMAL_MS       = 30_000;        // ±30 seg aleatorio

const VENTANA_CALENTAMIENTO_MS = 10 * 60 * 60_000; // 10 horas
const SLOTS_POR_LINEA          = 44;
const INTER_MSG_WARMUP_MS    = Math.floor(VENTANA_CALENTAMIENTO_MS / SLOTS_POR_LINEA); // ~13.6 min
const INTER_LINEA_WARMUP_MS  = 30_000;        // 30 seg stagger
const JITTER_WARMUP_MS       = 60_000;        // ±1 min aleatorio

// ─── Función principal ─────────────────────────────────────────────────────

export async function encolarMensajesMasivos(
  mensajes: MensajeParaEncolar[],
  options?: { lineaId?: number | null; modoCalentamiento?: boolean }
): Promise<ResultadoEncolado> {

  // 1. Líneas conectadas con extensión activa y capacidad disponible
  //    CAMBIO: ahora filtra por extension_activa en lugar de estado "conectado"
  //    El estado "conectado" lo pone la extensión al registrarse.
  const lineasRaw = await prisma.lineaWhatsapp.findMany({
    where: {
      estado: 'conectado',
      extension_activa: true,
      ...(options?.lineaId ? { id: options.lineaId } : {}),
    },
    select: { id: true, limite_diario: true, mensajes_enviados_hoy: true },
    orderBy: { id: 'asc' },
  });

  const lineas = lineasRaw
    .map((l, idx) => ({
      id: l.id,
      posicion: idx,
      capacidadRestante: (l.limite_diario ?? 45) - (l.mensajes_enviados_hoy ?? 0),
      asignados: 0,
    }))
    .filter(l => l.capacidadRestante > 0);

  if (lineas.length === 0) {
    throw new Error('No hay líneas con extensión activa y capacidad disponible hoy.');
  }

  // 2. Distribuir mensajes en round-robin — lógica idéntica al sistema anterior
  const ahora = Date.now();
  const actualizaciones: Array<{ id: number; lineaId: number; enviarEn: Date }> = [];
  let mensajesPendientes = 0;
  let lineaIdx = 0;

  for (const msj of mensajes) {
    const telefono = msj.contacto?.telefono;
    if (!telefono) continue;

    let encontrada = false;
    for (let i = 0; i < lineas.length; i++) {
      const candidata = lineas[(lineaIdx + i) % lineas.length];
      if (candidata.asignados < candidata.capacidadRestante) {
        lineaIdx = (lineaIdx + i) % lineas.length;
        encontrada = true;
        break;
      }
    }

    if (!encontrada) {
      mensajesPendientes++;
      continue;
    }

    const linea = lineas[lineaIdx];
    linea.asignados++;

    const interMsg   = options?.modoCalentamiento ? INTER_MSG_WARMUP_MS   : INTER_MSG_NORMAL_MS;
    const interLinea = options?.modoCalentamiento ? INTER_LINEA_WARMUP_MS : INTER_LINEA_NORMAL_MS;
    const jitterMax  = options?.modoCalentamiento ? JITTER_WARMUP_MS      : JITTER_NORMAL_MS;

    const jitter = Math.floor(Math.random() * jitterMax * 2) - jitterMax;
    const delayMs = Math.max(
      0,
      (linea.asignados - 1) * interMsg + linea.posicion * interLinea + jitter
    );

    actualizaciones.push({
      id: msj.id,
      lineaId: linea.id,
      // CLAVE: en vez de un job en BullMQ, guardamos el timestamp exacto en BD
      enviarEn: new Date(ahora + delayMs),
    });

    lineaIdx = (lineaIdx + 1) % lineas.length;
  }

  // 3. Actualizar BD en lotes por línea
  if (actualizaciones.length > 0) {
    const porLinea = new Map<number, { ids: number[]; enviarEn: Map<number, Date> }>();
    for (const a of actualizaciones) {
      if (!porLinea.has(a.lineaId)) {
        porLinea.set(a.lineaId, { ids: [], enviarEn: new Map() });
      }
      porLinea.get(a.lineaId)!.ids.push(a.id);
      porLinea.get(a.lineaId)!.enviarEn.set(a.id, a.enviarEn);
    }

    // Actualizar cada mensaje individualmente para respetar su enviar_en único
    await Promise.all(
      actualizaciones.map(a =>
        prisma.mensaje.update({
          where: { id: a.id },
          data: {
            estado: 'en_cola',
            linea_id: a.lineaId,
            enviar_en: a.enviarEn,
          },
        })
      )
    );

    logger.info(
      `Encolados ${actualizaciones.length} mensajes en ${lineas.length} línea(s). ` +
      `Pendientes para mañana: ${mensajesPendientes}`
    );
  }

  return { encolados: actualizaciones.length, pendientes: mensajesPendientes };
}

// Exportar vacíos para compatibilidad con imports existentes
export const redisConnection = null;
export const whatsappQueue = null;
```

> **Nota importante:** Buscar en el código cualquier import de `redisConnection` o `whatsappQueue` y eliminar su uso. El worker `bot/worker-wwebjs.ts` queda obsoleto y no debe ejecutarse.

### 3.2 Endpoint 1: Registro de la Extensión

**Archivo:** `app/api/extension/register/route.ts` (crear directorio y archivo)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { randomUUID } from 'crypto';

// La extensión llama a esto al arrancar Chrome.
// Responde con el proxy asignado, la config de la línea, y un token de sesión.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lineaId, deviceId } = body;

    if (!lineaId || !deviceId) {
      return NextResponse.json({ error: 'lineaId y deviceId son requeridos' }, { status: 400 });
    }

    const linea = await prisma.lineaWhatsapp.findUnique({
      where: { id: Number(lineaId) },
    });

    if (!linea) {
      return NextResponse.json({ error: 'Línea no encontrada' }, { status: 404 });
    }

    // Generar un token nuevo para esta sesión (la extensión lo guarda en chrome.storage)
    const token = randomUUID();

    await prisma.lineaWhatsapp.update({
      where: { id: Number(lineaId) },
      data: {
        token_extension: token,
        extension_activa: true,
        extension_ultima_vez: new Date(),
        estado: 'conectado',
        ultima_conexion: new Date(),
      },
    });

    // Parsear el proxy del formato: http://user:pass@ip:port
    let proxyConfig = null;
    if (linea.proxyUrl) {
      try {
        const url = new URL(linea.proxyUrl);
        proxyConfig = {
          host: url.hostname,
          port: parseInt(url.port),
          user: decodeURIComponent(url.username),
          pass: decodeURIComponent(url.password),
        };
      } catch {
        // proxy mal formado, se ignora
      }
    }

    return NextResponse.json({
      token,
      lineaId: linea.id,
      nombre: linea.nombre,
      proxy: proxyConfig,
      modo: linea.modo_envio ?? 'normal',
      limite_diario: linea.limite_diario ?? 45,
      mensajes_enviados_hoy: linea.mensajes_enviados_hoy ?? 0,
    });

  } catch (error: any) {
    console.error('[extension/register]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
```

### 3.3 Endpoint 2: Polling de Jobs

**Archivo:** `app/api/extension/poll/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// La extensión llama a esto cada 3 segundos.
// Devuelve máximo 1 mensaje listo para enviar.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lineaId = searchParams.get('lineaId');
    const token = searchParams.get('token');

    if (!lineaId || !token) {
      return NextResponse.json({ jobs: [] }, { status: 400 });
    }

    // Verificar token
    const linea = await prisma.lineaWhatsapp.findFirst({
      where: {
        id: Number(lineaId),
        token_extension: token,
      },
    });

    if (!linea) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Actualizar heartbeat
    await prisma.lineaWhatsapp.update({
      where: { id: Number(lineaId) },
      data: { extension_ultima_vez: new Date() },
    });

    // Buscar el siguiente mensaje listo para enviar
    const ahora = new Date();
    const mensaje = await prisma.mensaje.findFirst({
      where: {
        linea_id: Number(lineaId),
        estado: 'en_cola',
        enviar_en: { lte: ahora },
      },
      include: {
        contacto: { select: { telefono: true, nombre: true } },
        campana: { select: { estado: true } },
      },
      orderBy: { enviar_en: 'asc' },
    });

    if (!mensaje) {
      return NextResponse.json({ jobs: [] });
    }

    // Si la campaña está pausada o cancelada, omitir silenciosamente
    if (mensaje.campana?.estado === 'pausada' || mensaje.campana?.estado === 'cancelada') {
      await prisma.mensaje.update({
        where: { id: mensaje.id },
        data: { estado: 'cancelado' },
      });
      return NextResponse.json({ jobs: [] });
    }

    // Marcar como "procesando" para evitar que otro poll lo tome
    await prisma.mensaje.update({
      where: { id: mensaje.id },
      data: { estado: 'procesando' },
    });

    const telefono = mensaje.contacto?.telefono ?? '';
    // Formato Colombia: agregar "57" si tiene 10 dígitos
    const numero = telefono.length === 10 ? `57${telefono}` : telefono;

    return NextResponse.json({
      jobs: [{
        mensajeId: mensaje.id,
        numero,
        texto: mensaje.texto ?? '',
        campanaId: mensaje.campana_id,
      }],
    });

  } catch (error: any) {
    console.error('[extension/poll]', error);
    return NextResponse.json({ jobs: [] });
  }
}
```

> **Estado "procesando":** Se agrega al enum de estados de `Mensaje`. Agregar en validaciones y UI donde sea relevante.

### 3.4 Endpoint 3: Reporte de Resultado

**Archivo:** `app/api/extension/report/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

const BACKOFF_SEGUNDOS = [30, 60, 120, 240]; // mismo que BullMQ tenía antes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mensajeId, lineaId, token, estado, errorCode, errorMsg } = body;

    if (!mensajeId || !lineaId || !token) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    // Verificar token
    const linea = await prisma.lineaWhatsapp.findFirst({
      where: { id: Number(lineaId), token_extension: token },
    });

    if (!linea) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const mensaje = await prisma.mensaje.findUnique({
      where: { id: Number(mensajeId) },
    });

    if (!mensaje) {
      return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 });
    }

    if (estado === 'enviado') {
      // Éxito
      await prisma.mensaje.update({
        where: { id: Number(mensajeId) },
        data: {
          estado: 'enviado',
          fecha: new Date(),
          enviar_en: null,
        },
      });

      // Incrementar contador diario de la línea
      await prisma.lineaWhatsapp.update({
        where: { id: Number(lineaId) },
        data: {
          mensajes_enviados_hoy: { increment: 1 },
          ultima_conexion: new Date(),
        },
      });

    } else {
      // Error — aplicar retry con backoff exponencial
      const intentoActual = (mensaje.intentos ?? 0) + 1;

      if (intentoActual >= 5) {
        // Falló definitivamente
        await prisma.mensaje.update({
          where: { id: Number(mensajeId) },
          data: { estado: 'fallido', intentos: intentoActual, enviar_en: null },
        });

        // Registrar en mensajes_errores (igual que el sistema anterior)
        await prisma.mensajeError.create({
          data: {
            mensaje_id: Number(mensajeId),
            campana_id: mensaje.campana_id,
            error_code: errorCode ?? 'ERROR_DESCONOCIDO',
            error_message: mapearDescripcionError(errorCode),
            numero_telefono: body.numero,
            intentos: intentoActual,
            notas_resolucion: errorMsg,
          },
        });

      } else {
        // Reintentar con backoff
        const esperaSegs = BACKOFF_SEGUNDOS[intentoActual - 1] ?? 240;
        const proxIntento = new Date(Date.now() + esperaSegs * 1000);

        await prisma.mensaje.update({
          where: { id: Number(mensajeId) },
          data: {
            estado: 'en_cola',
            intentos: intentoActual,
            enviar_en: proxIntento,
          },
        });
      }
    }

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error('[extension/report]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

function mapearDescripcionError(code?: string): string {
  const mapa: Record<string, string> = {
    NO_WHATSAPP: 'El número no tiene WhatsApp activo',
    TIMEOUT: 'El chat no cargó en el tiempo esperado',
    LINEA_DESCONECTADA: 'WhatsApp Web cerró sesión durante el envío',
    NUMERO_INVALIDO: 'Formato de número de teléfono incorrecto',
  };
  return mapa[code ?? ''] ?? 'Error no categorizado';
}
```

### 3.5 Cron de Heartbeat — Detectar Extensiones Caídas

Agregar a `bot/cron.ts` (o donde ya estén los crons) la tarea que marca como inactivas las extensiones que no han hecho poll en más de 30 segundos:

```typescript
// Ejecutar cada minuto
async function verificarExtensionesActivas() {
  const hace30Segundos = new Date(Date.now() - 30_000);
  await prisma.lineaWhatsapp.updateMany({
    where: {
      extension_activa: true,
      extension_ultima_vez: { lt: hace30Segundos },
    },
    data: {
      extension_activa: false,
      estado: 'desconectado',
    },
  });
}
```

### 3.6 Eliminar Dependencias de Redis/BullMQ

Cuando las líneas que queden funcionen con la extensión, se puede eliminar:
```bash
npm uninstall bullmq ioredis
```

Y borrar los archivos:
- `bot/worker-wwebjs.ts`
- `bot/worker.ts` (el anterior)
- `bot/socket.ts`

Verificar que ningún archivo de Next.js importe de estas dependencias.

---

## 4. La Extensión Chrome — Código Completo

### 4.1 Estructura de Archivos

```
extension/
  manifest.json         ← declaración de permisos y recursos
  config.js             ← constantes: URL del dashboard, lineaId
  background.js         ← página persistente: proxy + auth
  content.js            ← inyectado en WhatsApp Web: polling + envío
  popup.html            ← UI del icono en la barra de Chrome
  popup.js              ← lógica del popup
  icon16.png            ← icono (cualquier PNG 16×16)
  icon48.png            ← icono (cualquier PNG 48×48)
  icon128.png           ← icono (cualquier PNG 128×128)
```

---

### 4.2 `manifest.json`

```json
{
  "manifest_version": 2,
  "name": "Campaña Espinal — Línea WhatsApp",
  "version": "1.0.0",
  "description": "Extensión de envío masivo para el dashboard de campaña",

  "permissions": [
    "proxy",
    "webRequest",
    "webRequestBlocking",
    "storage",
    "tabs",
    "activeTab",
    "<all_urls>"
  ],

  "background": {
    "scripts": ["config.js", "background.js"],
    "persistent": true
  },

  "content_scripts": [
    {
      "matches": ["https://web.whatsapp.com/*"],
      "js": ["config.js", "content.js"],
      "run_at": "document_idle"
    }
  ],

  "browser_action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icon16.png",
      "48": "icon48.png",
      "128": "icon128.png"
    }
  },

  "icons": {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  }
}
```

> **Por qué Manifest V2:** Esta extensión solo se carga en modo desarrollador en un PC específico y no se publica en Chrome Web Store. MV2 tiene páginas de fondo persistentes, lo que simplifica enormemente el manejo de proxies autenticados con `chrome.webRequest`. MV3 requiere service workers que Chrome puede matar, complicando la autenticación de proxies.

---

### 4.3 `config.js`

Este archivo se carga en background.js y content.js. Cada perfil Chrome tiene su propio `lineaId`.

```javascript
// config.js
// INSTRUCCIONES: Cambiar estos valores en cada perfil Chrome.
// Perfil 1 → lineaId: 1
// Perfil 2 → lineaId: 2
// ... y así hasta el perfil 5.

const CONFIG = {
  // URL del dashboard. En desarrollo: "http://localhost:3000"
  // En producción: "https://tu-dominio.com"
  DASHBOARD_URL: "https://tu-dominio.com",

  // ID de esta línea en la base de datos (tabla lineas_whatsapp)
  // CAMBIAR EN CADA PERFIL CHROME
  LINEA_ID: 1,

  // Intervalo de polling en milisegundos (3 segundos)
  POLL_INTERVAL_MS: 3000,

  // Un ID único para este dispositivo (no cambiar después de instalado)
  // Generado una vez y fijo. Ayuda al dashboard a identificar reinstalaciones.
  DEVICE_ID: "perfil-chrome-" + (1), // cambiar el número según el perfil
};
```

---

### 4.4 `background.js`

```javascript
// background.js
// Responsabilidades:
//   1. Al arrancar: registrarse con el dashboard y obtener config + proxy
//   2. Aplicar proxy al perfil Chrome con chrome.proxy API
//   3. Manejar autenticación del proxy (usuario:contraseña)

let proxyCredentials = null; // { host, user, pass }
let sessionToken = null;

// ─── Arranque ────────────────────────────────────────────────────────────────

async function iniciar() {
  console.log(`[Línea ${CONFIG.LINEA_ID}] Registrando con el dashboard...`);

  // Recuperar token de sesión anterior si existe
  const stored = await new Promise(resolve =>
    chrome.storage.local.get(['token', 'proxy'], resolve)
  );

  if (stored.token) {
    sessionToken = stored.token;
    if (stored.proxy) {
      proxyCredentials = stored.proxy;
      aplicarProxy(stored.proxy);
    }
  }

  // Registrar (siempre, para renovar el token)
  try {
    const resp = await fetch(`${CONFIG.DASHBOARD_URL}/api/extension/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineaId: CONFIG.LINEA_ID,
        deviceId: CONFIG.DEVICE_ID,
      }),
    });

    if (!resp.ok) {
      console.error(`[background] Error al registrar: ${resp.status}`);
      return;
    }

    const data = await resp.json();
    sessionToken = data.token;

    // Guardar token para el content script
    await new Promise(resolve =>
      chrome.storage.local.set({ token: data.token, lineaId: CONFIG.LINEA_ID }, resolve)
    );

    // Configurar proxy si viene en la respuesta
    if (data.proxy) {
      proxyCredentials = data.proxy;
      await new Promise(resolve =>
        chrome.storage.local.set({ proxy: data.proxy }, resolve)
      );
      aplicarProxy(data.proxy);
      console.log(`[background] Proxy configurado: ${data.proxy.host}:${data.proxy.port}`);
    } else {
      console.log(`[background] Sin proxy asignado para esta línea`);
    }

    console.log(`[background] Registrado como Línea ${CONFIG.LINEA_ID}. Modo: ${data.modo}`);

  } catch (err) {
    console.error('[background] Error de red al registrar:', err.message);
    // Reintentar en 10 segundos
    setTimeout(iniciar, 10_000);
  }
}

// ─── Aplicar proxy al perfil Chrome ──────────────────────────────────────────

function aplicarProxy(proxy) {
  // proxy = { host, port, user, pass }
  const config = {
    mode: 'fixed_servers',
    rules: {
      singleProxy: {
        scheme: 'http',
        host: proxy.host,
        port: proxy.port,
      },
      bypassList: ['localhost', '127.0.0.1'],
    },
  };

  chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
    if (chrome.runtime.lastError) {
      console.error('[background] Error al aplicar proxy:', chrome.runtime.lastError.message);
    } else {
      console.log(`[background] Proxy activo: ${proxy.host}:${proxy.port}`);
    }
  });
}

// ─── Autenticación del proxy ──────────────────────────────────────────────────

chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    if (proxyCredentials && details.isProxy) {
      callback({
        authCredentials: {
          username: proxyCredentials.user,
          password: proxyCredentials.pass,
        },
      });
    } else {
      callback({ cancel: false });
    }
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// ─── Iniciar ──────────────────────────────────────────────────────────────────

iniciar();
```

---

### 4.5 `content.js`

Este es el archivo más importante. Corre dentro de la pestaña de WhatsApp Web y maneja todo el ciclo de envío.

```javascript
// content.js
// Responsabilidades:
//   1. Hacer polling al dashboard cada 3 segundos
//   2. Cuando hay un job: ejecutar el envío en WhatsApp Web
//   3. Reportar el resultado al dashboard

// ─── Estado local ─────────────────────────────────────────────────────────────

let token = null;
let lineaId = null;
let procesando = false;
let enviados = 0;
let fallidos = 0;

// ─── Utilidades ───────────────────────────────────────────────────────────────

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function esperarElemento(selector, timeoutMs = 15000) {
  return new Promise(resolve => {
    const inicio = Date.now();
    const intervalo = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(intervalo);
        resolve(el);
      } else if (Date.now() - inicio > timeoutMs) {
        clearInterval(intervalo);
        resolve(null);
      }
    }, 300);
  });
}

function microJitter() {
  // 1 a 3 segundos aleatorio — simula comportamiento humano
  const ms = 1000 + Math.floor(Math.random() * 2000);
  return esperar(ms);
}

// ─── Envío de mensaje en WhatsApp Web ────────────────────────────────────────

async function enviarMensaje(numero, texto) {
  // Técnica: navegar a la URL de envío de WhatsApp Web
  // Esto abre el chat con el texto pre-cargado en el input
  const url = `https://web.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(texto)}`;

  // Guardar URL actual para restaurar después si es necesario
  const urlAnterior = window.location.href;

  // Navegar al chat (SPA navigation interna de WhatsApp Web)
  window.location.assign(url);

  // Esperar que cargue la interfaz (hasta 20 segundos)
  // Selector del botón de enviar en WhatsApp Web — verificado en 2025
  // WhatsApp puede cambiar data-testid en actualizaciones
  const SELECTOR_ENVIAR = '[data-testid="send"], span[data-icon="send"]';
  const SELECTOR_ERROR = '[data-testid="popup-contents"]';

  // Dar tiempo al SPA para hacer la navegación
  await esperar(2000);

  const boton = await esperarElemento(SELECTOR_ENVIAR, 18000);

  if (!boton) {
    // Verificar si hay popup de error (número sin WhatsApp)
    const errorEl = document.querySelector(SELECTOR_ERROR);
    if (errorEl) {
      const textoError = errorEl.textContent || '';
      if (textoError.toLowerCase().includes('invalid') || textoError.toLowerCase().includes('inválido')) {
        throw { code: 'NO_WHATSAPP', msg: textoError.trim() };
      }
    }
    throw { code: 'TIMEOUT', msg: 'El botón de enviar no apareció en 18 segundos' };
  }

  // Micro-jitter antes de enviar (humanización)
  await microJitter();

  // Verificar que el botón sea clickeable
  if (boton.disabled || boton.getAttribute('aria-disabled') === 'true') {
    throw { code: 'TIMEOUT', msg: 'El botón de enviar está deshabilitado' };
  }

  // Click en enviar
  boton.click();

  // Breve espera para confirmar que el mensaje se envió (aparece en la lista del chat)
  await esperar(1500);

  return true;
}

// ─── Comunicación con el dashboard ────────────────────────────────────────────

async function pollJobs() {
  if (!token || !lineaId || procesando) return;

  try {
    const resp = await fetch(
      `${CONFIG.DASHBOARD_URL}/api/extension/poll?lineaId=${lineaId}&token=${token}`,
      { cache: 'no-store' }
    );

    if (resp.status === 401) {
      // Token expirado — re-registrar
      console.warn('[content] Token inválido, solicitando re-registro...');
      chrome.runtime.sendMessage({ tipo: 'REREGISTRAR' });
      return;
    }

    if (!resp.ok) return;

    const data = await resp.json();
    if (!data.jobs || data.jobs.length === 0) return;

    const job = data.jobs[0];
    procesando = true;

    console.log(`[Línea ${lineaId}] Procesando mensaje ${job.mensajeId} → ${job.numero}`);

    try {
      await enviarMensaje(job.numero, job.texto);

      // Reportar éxito
      await reportarResultado(job.mensajeId, 'enviado', null, null, job.numero);
      enviados++;
      actualizarBadge();
      console.log(`[Línea ${lineaId}] ✓ Mensaje ${job.mensajeId} enviado`);

    } catch (err) {
      const errorCode = err.code ?? 'ERROR_DESCONOCIDO';
      const errorMsg = err.msg ?? String(err);
      console.error(`[Línea ${lineaId}] ✗ Error en mensaje ${job.mensajeId}:`, errorCode, errorMsg);

      await reportarResultado(job.mensajeId, 'error', errorCode, errorMsg, job.numero);
      fallidos++;
      actualizarBadge();
    }

    procesando = false;

  } catch (err) {
    // Error de red — ignorar, el siguiente poll lo reintentará
    procesando = false;
  }
}

async function reportarResultado(mensajeId, estado, errorCode, errorMsg, numero) {
  try {
    await fetch(`${CONFIG.DASHBOARD_URL}/api/extension/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mensajeId,
        lineaId,
        token,
        estado,
        errorCode,
        errorMsg,
        numero,
      }),
    });
  } catch (err) {
    console.error('[content] Error al reportar resultado:', err.message);
  }
}

// ─── Badge del ícono ──────────────────────────────────────────────────────────

function actualizarBadge() {
  // Enviar al background para que actualice el badge del ícono
  chrome.runtime.sendMessage({
    tipo: 'ACTUALIZAR_BADGE',
    enviados,
    fallidos,
  });
}

// ─── Inicializar ──────────────────────────────────────────────────────────────

async function inicializar() {
  // Leer token y lineaId del storage (lo puso background.js al registrar)
  const stored = await new Promise(resolve =>
    chrome.storage.local.get(['token', 'lineaId'], resolve)
  );

  if (!stored.token || !stored.lineaId) {
    // La extensión aún no se ha registrado — esperar y reintentar
    console.log('[content] Esperando registro del background...');
    setTimeout(inicializar, 3000);
    return;
  }

  token = stored.token;
  lineaId = stored.lineaId;

  console.log(`[Línea ${lineaId}] Content script activo en WhatsApp Web. Iniciando polling...`);

  // Iniciar polling
  setInterval(pollJobs, CONFIG.POLL_INTERVAL_MS);
}

// Esperar a que WhatsApp Web cargue su interfaz antes de inicializar
// (el content script se inyecta en document_idle, pero WhatsApp carga async)
setTimeout(inicializar, 3000);
```

---

### 4.6 `popup.html`

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      width: 280px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 16px;
      margin: 0;
      background: #111;
      color: #eee;
    }
    h2 { margin: 0 0 12px; font-size: 14px; color: #25D366; }
    .fila { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
    .label { color: #888; }
    .valor { font-weight: 600; }
    .conectado { color: #25D366; }
    .desconectado { color: #f44; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-normal { background: #1a3a2a; color: #25D366; }
    .badge-calentamiento { background: #3a2a1a; color: #f90; }
    hr { border: none; border-top: 1px solid #333; margin: 12px 0; }
  </style>
</head>
<body>
  <h2>Campaña Espinal — WhatsApp</h2>
  <div class="fila">
    <span class="label">Línea</span>
    <span class="valor" id="linea-id">—</span>
  </div>
  <div class="fila">
    <span class="label">Estado</span>
    <span class="valor" id="estado">—</span>
  </div>
  <div class="fila">
    <span class="label">Modo</span>
    <span id="modo">—</span>
  </div>
  <hr>
  <div class="fila">
    <span class="label">Enviados hoy</span>
    <span class="valor" id="enviados">—</span>
  </div>
  <div class="fila">
    <span class="label">Fallidos</span>
    <span class="valor" id="fallidos">—</span>
  </div>
  <div class="fila">
    <span class="label">Último poll</span>
    <span class="valor" id="ultimo-poll">—</span>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

---

### 4.7 `popup.js`

```javascript
// popup.js
chrome.storage.local.get(
  ['token', 'lineaId', 'enviados', 'fallidos', 'modo', 'ultimoPoll'],
  (data) => {
    document.getElementById('linea-id').textContent = data.lineaId ?? '—';

    const estadoEl = document.getElementById('estado');
    if (data.token) {
      estadoEl.textContent = 'Conectada';
      estadoEl.className = 'valor conectado';
    } else {
      estadoEl.textContent = 'Sin registrar';
      estadoEl.className = 'valor desconectado';
    }

    const modoEl = document.getElementById('modo');
    const modo = data.modo ?? 'normal';
    modoEl.innerHTML = modo === 'calentamiento'
      ? '<span class="badge badge-calentamiento">Calentamiento</span>'
      : '<span class="badge badge-normal">Normal</span>';

    document.getElementById('enviados').textContent = data.enviados ?? '0';
    document.getElementById('fallidos').textContent = data.fallidos ?? '0';

    if (data.ultimoPoll) {
      const hace = Math.round((Date.now() - data.ultimoPoll) / 1000);
      document.getElementById('ultimo-poll').textContent = `hace ${hace}s`;
    }
  }
);
```

---

## 5. Configuración de los 5 Perfiles Chrome

### Paso 1 — Crear los 5 perfiles

1. Abrir Chrome
2. Hacer clic en el ícono de perfil (arriba a la derecha)
3. Clic en **"Añadir"**
4. Nombre: `Línea 1 WhatsApp` → Sin cuenta Google → Continuar
5. Repetir para `Línea 2 WhatsApp` ... `Línea 5 WhatsApp`

### Paso 2 — Instalar la extensión en cada perfil

En cada perfil Chrome:
1. Abrir `chrome://extensions`
2. Activar **"Modo desarrollador"** (toggle arriba a la derecha)
3. Clic en **"Cargar extensión sin empaquetar"**
4. Seleccionar la carpeta `extension/`
5. La extensión aparece instalada

### Paso 3 — Configurar el `lineaId` en cada perfil

En `config.js`, el campo `LINEA_ID` debe coincidir con el `id` en la tabla `lineas_whatsapp` de la base de datos.

**Problema:** `config.js` es el mismo archivo para todas las instancias.

**Solución:** Usar `chrome.storage.local` para configurar el `lineaId` por perfil, sin modificar el código fuente.

Agregar a `popup.html` un campo de configuración inicial:

```html
<!-- Agregar en popup.html, solo se muestra si no hay lineaId configurado -->
<div id="setup" style="display:none">
  <hr>
  <div class="fila" style="flex-direction:column; gap:8px">
    <label class="label">Configurar línea (solo primera vez)</label>
    <input id="input-linea" type="number" min="1" max="100"
      style="background:#222;border:1px solid #444;color:#eee;padding:6px;border-radius:4px;width:100%;box-sizing:border-box"
      placeholder="ID de la línea (ej: 1)">
    <button id="btn-guardar"
      style="background:#25D366;border:none;color:#111;padding:6px;border-radius:4px;cursor:pointer;font-weight:600">
      Guardar y registrar
    </button>
  </div>
</div>
```

Y en `popup.js`:

```javascript
// Al abrir el popup, mostrar setup si no hay lineaId
chrome.storage.local.get(['lineaId'], (data) => {
  if (!data.lineaId) {
    document.getElementById('setup').style.display = 'block';
  }
});

document.getElementById('btn-guardar')?.addEventListener('click', () => {
  const id = parseInt(document.getElementById('input-linea').value);
  if (id > 0) {
    chrome.storage.local.set({ lineaId: id }, () => {
      // Indicar al background que se re-registre
      chrome.runtime.sendMessage({ tipo: 'REREGISTRAR' });
      window.close();
    });
  }
});
```

De esta forma, la primera vez que se abre el popup en cada perfil, el operador ingresa el ID de la línea (1 al 5) y queda guardado permanentemente en ese perfil.

### Paso 4 — Abrir WhatsApp Web en cada perfil

1. En el perfil `Línea 1`, abrir pestaña: `https://web.whatsapp.com`
2. Escanear QR con el teléfono asignado a la Línea 1
3. Repetir para cada perfil

Las sesiones son permanentes. WhatsApp Web recuerda la sesión como cualquier dispositivo vinculado.

### Paso 5 — Verificar en el dashboard

Después de abrir WhatsApp Web en los 5 perfiles, la tabla `lineas_whatsapp` debe mostrar `extension_activa = true` y `estado = "conectado"` para las 5 líneas. Verificar en la UI de Líneas del dashboard.

---

## 6. Estrategias Anti-ban — Mapeo Completo

### 6.1 Proxy por línea

| Aspecto | Detalle |
|---|---|
| Dónde se configura | `LineaWhatsapp.proxyUrl` (ya existe en BD, formato `http://user:pass@ip:port`) |
| Quién lo aplica | `background.js` → `chrome.proxy.settings.set()` |
| Alcance | **Todo el tráfico de ese perfil Chrome**, no solo WhatsApp — esto es más completo que el sistema anterior donde el proxy solo aplicaba a Puppeteer |
| Autenticación | `chrome.webRequest.onAuthRequired` en `background.js` (devuelve user:pass automáticamente) |
| Asignación | El endpoint `/api/extension/register` lee `linea.proxyUrl` y lo devuelve; la lógica de `obtenerProxyDisponible()` en `lib/whatsapp/proxies.ts` no cambia |

### 6.2 Modo Normal vs Modo Calentamiento

No cambia absolutamente nada en la lógica de cálculo de delays. El `encolarMensajesMasivos()` calcula los timestamps `enviar_en` con la misma fórmula de siempre:

```
Modo Normal:     3 min entre mensajes + 20 seg stagger + ±30 seg jitter
Modo Calentar:  13.6 min entre mensajes + 30 seg stagger + ±1 min jitter
```

La diferencia es solo dónde se almacena el delay resultante: antes en BullMQ, ahora en `Mensaje.enviar_en`.

El campo `LineaWhatsapp.modo_envio` permite cambiar el modo desde la UI sin tocar código.

### 6.3 Micro-jitter por mensaje

Implementado en `content.js` con la función `microJitter()`:

```javascript
// 1 a 3 segundos aleatorio, justo antes del click en Enviar
await microJitter();
boton.click();
```

Equivalente exacto al micro-jitter del sistema anterior.

### 6.4 Round-robin entre líneas

Sin cambio. Implementado en `encolarMensajesMasivos()`. Cada mensaje va a una línea diferente en rotación, respetando la capacidad diaria de cada una.

### 6.5 Límite de 45 mensajes/día

Sin cambio. El endpoint `/report` incrementa `mensajes_enviados_hoy` en cada envío exitoso. El cron de medianoche lo reinicia (ya existe en `bot/cron.ts`).

El endpoint `/poll` solo devuelve mensajes cuyo `linea_id` tiene capacidad — esto se verifica en `encolarMensajesMasivos` al calcular `capacidadRestante`.

### 6.6 Un Chrome por línea (aislamiento total)

Cada perfil Chrome tiene:
- Su propia sesión de WhatsApp (localStorage aislado)
- Su propio proxy (IP diferente)
- Sus propias cookies
- Su propio historial de navegación

WhatsApp no puede correlacionar las 5 cuentas entre sí.

### 6.7 Reintentos automáticos con backoff

El endpoint `/report` maneja los reintentos sin BullMQ:

| Intento | Espera |
|---|---|
| 1 → 2 | 30 segundos |
| 2 → 3 | 60 segundos |
| 3 → 4 | 120 segundos |
| 4 → 5 | 240 segundos |
| 5 (definitivo) | estado → `fallido`, registro en `mensajes_errores` |

El mensaje vuelve a `en_cola` con un nuevo `enviar_en` futuro. La extensión lo tomará cuando llegue ese momento.

---

## 7. Operación Diaria

### Arranque

1. Abrir Chrome (perfil Línea 1)
2. Verificar que la pestaña WhatsApp Web esté abierta y logueada
3. Repetir para perfiles 2, 3, 4, 5
4. El dashboard mostrará las 5 líneas como "Conectada" en segundos

No hay que ejecutar `npm run bot` ni nada por el estilo. El dashboard Next.js ya está corriendo.

### Enviar una campaña

Igual que antes desde la UI: seleccionar contactos → modo → enviar. Los mensajes se distribuyen entre las líneas activas con los delays calculados. La extensión los ejecuta automáticamente.

### Verificar progreso

En la analítica de campaña del dashboard, igual que hoy. Los estados `enviado`, `en_cola`, `fallido` se actualizan en tiempo real conforme la extensión reporta.

### Cerrar Chrome al terminar el día

Simplemente cerrar Chrome. Las sesiones de WhatsApp Web quedan guardadas en los perfiles. Al día siguiente, abrir Chrome de nuevo y todo vuelve a conectar solo.

Si se cierra Chrome con mensajes aún `en_cola`, al reabrir la extensión retoma el poll y los envía en orden.

---

## 8. Diagnóstico de Problemas

| Síntoma | Causa | Solución |
|---|---|---|
| Dashboard muestra línea desconectada | Chrome cerrado o WhatsApp Web deslogueado | Abrir Chrome del perfil correspondiente |
| Extensión no aparece en Chrome | No está cargada | `chrome://extensions` → cargar sin empaquetar |
| Mensajes se quedan `en_cola` sin enviar | WhatsApp Web no tiene foco o el tab está en segundo plano | Verificar que la pestaña WA está abierta, no minimizada |
| `NO_WHATSAPP` en mensajes fallidos | Número sin WhatsApp activo | Depurar la lista de contactos |
| `TIMEOUT` repetido | WhatsApp Web cargó lento o cambió el selector del botón | Revisar `content.js` — puede que WhatsApp actualizó su DOM |
| Proxy no aplica | Error en `background.js` al parsear la URL del proxy | Verificar formato en BD: debe ser `http://user:pass@ip:port` |
| Todos los mensajes quedan `procesando` sin avanzar | La extensión reportó error de red y no limpió el estado | Query manual: `UPDATE mensajes SET estado='en_cola' WHERE estado='procesando'` |
| La extensión pide `lineaId` cada vez | `chrome.storage.local` fue borrado | Configurar de nuevo desde el popup |

### Consulta de diagnóstico rápido en BD

```sql
-- Estado actual de todas las líneas
SELECT id, nombre, estado, extension_activa, extension_ultima_vez,
       mensajes_enviados_hoy, limite_diario
FROM lineas_whatsapp ORDER BY id;

-- Mensajes atascados en "procesando" (deben ser 0 en condiciones normales)
SELECT COUNT(*) FROM mensajes WHERE estado = 'procesando';

-- Cola pendiente por línea
SELECT linea_id, COUNT(*) as en_cola, MIN(enviar_en) as proximo
FROM mensajes
WHERE estado = 'en_cola'
GROUP BY linea_id ORDER BY linea_id;
```

---

## 9. Plan de Implementación por Fases

### Fase 1 — Backend: Schema y Endpoints

**Responsable:** Desarrollador backend  
**Duración estimada:** 2–3 horas

- [ ] Agregar campos a `LineaWhatsapp` en `schema.prisma` (sección 2.1)
- [ ] Agregar campo `enviar_en` e `intentos` a `Mensaje` en `schema.prisma` (sección 2.2)
- [ ] Ejecutar `npx prisma migrate dev --name extension_chrome`
- [ ] Crear `app/api/extension/register/route.ts` (sección 3.2)
- [ ] Crear `app/api/extension/poll/route.ts` (sección 3.3)
- [ ] Crear `app/api/extension/report/route.ts` (sección 3.4)
- [ ] Reemplazar `lib/whatsapp/queue.ts` con la versión sin BullMQ (sección 3.1)
- [ ] Agregar cron de heartbeat en `bot/cron.ts` (sección 3.5)
- [ ] Verificar que `app/api/mensajes/enviar/route.ts` sigue funcionando (no cambia)

### Fase 2 — Extensión Chrome

**Responsable:** Desarrollador frontend/extensiones  
**Duración estimada:** 3–4 horas

- [ ] Crear carpeta `extension/` en la raíz del proyecto
- [ ] Crear `manifest.json` (sección 4.2)
- [ ] Crear `config.js` (sección 4.3)
- [ ] Crear `background.js` (sección 4.4)
- [ ] Crear `content.js` (sección 4.5)
- [ ] Crear `popup.html` con campo de setup de lineaId (sección 4.6)
- [ ] Crear `popup.js` (sección 4.7)
- [ ] Agregar íconos (cualquier PNG verde 16×16, 48×48, 128×128)

### Fase 3 — Perfiles Chrome y Pruebas

**Responsable:** El operador (con guía del desarrollador)  
**Duración estimada:** 1–2 horas

- [ ] Crear 5 perfiles Chrome (sección 5, Paso 1)
- [ ] Cargar extensión en cada perfil (Paso 2)
- [ ] Configurar `lineaId` en el popup de cada perfil (Paso 3)
- [ ] Abrir WhatsApp Web y escanear QR en cada perfil (Paso 4)
- [ ] Verificar en el dashboard que las 5 líneas aparecen como activas

### Fase 4 — Prueba de Envío Real

**Duración estimada:** 1 hora

- [ ] Crear una campaña de prueba con 5 contactos (uno por línea)
- [ ] Verificar que cada extensión toma su mensaje en el orden correcto
- [ ] Verificar que el proxy está activo (ver IP desde `web.whatsapp.com` con extensión de IP checker)
- [ ] Verificar que los mensajes llegan a los teléfonos
- [ ] Verificar que la analítica del dashboard muestra los estados correctos

### Fase 5 — Limpieza (opcional, después de validar)

- [ ] Desinstalar BullMQ e ioredis: `npm uninstall bullmq ioredis`
- [ ] Eliminar `bot/worker-wwebjs.ts`, `bot/worker.ts`, `bot/socket.ts`
- [ ] Eliminar la carpeta `.wwebjs_auth/`
- [ ] Actualizar `.gitignore` (remover referencias a wwebjs)
- [ ] Desactivar Redis en el servidor si no se usa para otra cosa

---

## Apéndice A — Selectores de WhatsApp Web

WhatsApp Web es una SPA React y puede cambiar sus `data-testid` con actualizaciones. Si el envío deja de funcionar, inspeccionar el DOM del botón Enviar en Chrome DevTools y actualizar el selector en `content.js`.

Selectores conocidos (verificar vigencia al implementar):

```javascript
// Botón de enviar (probar en orden hasta encontrar el activo)
'[data-testid="send"]'
'button[data-tab="11"]'
'span[data-icon="send"]'
'[aria-label="Enviar"]'

// Popup de error (número sin WhatsApp)
'[data-testid="popup-contents"]'
'[role="dialog"]'
```

Para verificar cuál selector está activo: abrir WhatsApp Web, ir a un chat, abrir DevTools (`F12`), escribir en la consola:
```javascript
document.querySelector('[data-testid="send"]')
// Si devuelve un elemento, ese selector funciona
```

---

## Apéndice B — Seguridad de los Endpoints

Los 3 endpoints nuevos (`/api/extension/*`) están protegidos por token UUID. No requieren autenticación NextAuth porque los llama la extensión, no el navegador del usuario.

Si en el futuro se necesita más seguridad, agregar una IP allowlist que solo permita requests desde `localhost` o la IP fija del PC donde corren los perfiles Chrome.

---

*Documento generado para el proyecto Campaña Espinal — Sistema de envío masivo v2.0*  
*Fecha: 2026-05-25*
