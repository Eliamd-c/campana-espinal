# Stack 2025-2026 para Mensajería Masiva en WhatsApp con Baileys: Guía Técnica Completa

## TL;DR
- **Construye sobre `baileys` 7.0.0 (la versión 7.0.0-rc12 en npm es la línea de desarrollo actual a mayo 2026, distribuida ya como `baileys` además del paquete legado `@whiskeysockets/baileys`), Node.js 20+ en ESM, una capa Fastify/NestJS, persistencia híbrida Redis (caliente) + PostgreSQL/MongoDB (fría), colas BullMQ y middleware anti-ban (`baileys-antiban` o equivalente).** Es la combinación que mejor refleja los breaking changes de v7 (ESM, LID, `decodeAndHydrate`, `getMessage` obligatorio) y los aprendizajes de las olas de bans 2025-2026.
- **Si tu caso es realmente "envío masivo de marketing", Baileys NO es la elección responsable.** Es ingeniería inversa del protocolo de WhatsApp Web, viola los ToS de Meta, y los reportes de campo muestran vidas útiles típicas de 2–8 semanas en cuentas usadas para broadcast. Para producción comercial migra (o combina) con la WhatsApp Cloud API oficial de Meta (modelo per-message vigente desde el 1 julio 2025).
- **Si aún así sigues con Baileys, las tres palancas que más reducen bans son: (1) auth state propio en SQL/Redis con cifrado en reposo — nunca `useMultiFileAuthState` en producción, (2) rate limiting con jitter gaussiano y warmup de 7 días, y (3) colas con backoff exponencial y multi-número con balanceo.** Plan, presupuestos y umbrales detallados abajo.

## Key Findings

### 1. Estado de Baileys en 2025-2026
- **Repositorio oficial:** `WhiskeySockets/Baileys` (https://github.com/WhiskeySockets/Baileys). El repo original de @adiwajshing fue eliminado; WhiskeySockets es el único fork mantenido por la comunidad, con Rajeh Taher como maintainer principal. Hay docenas de forks "pro" en npm (`baileys-pro`, `baileys-x`, `@fadzzzslebew/baileys`, `@itsliaaa/baileys`, `@blckrose/baileys`, `bails`, `baileys-x`, etc.) — la mayoría agregan parches a corto plazo pero introducen **riesgo de cadena de suministro**. El incidente lotusbail —descubierto por el investigador Tuval Admoni (Koi Security) y divulgado el 22 de diciembre de 2025— mostró que un fork malicioso "anti-ban" llegó a acumular más de 56.000 descargas en seis meses (disponible en npm desde mayo de 2025) exfiltrando tokens de sesión, historial completo de mensajes, lista de contactos y emparejando dispositivos clandestinamente con un código AES hard-codeado. La advisory Snyk SNYK-JS-LOTUSBAIL-14560496 (CVSS 9.3 Critical) confirma el impacto.
- **Versión actual:** `baileys` y `@whiskeysockets/baileys` están en 7.0.0-rc12 (mayo 2026) tras un ciclo de RCs que comenzó en septiembre 2025. La 7.x es un cambio mayor: **ESM only**, libsignal pinneado a npm (Trusted Publishing + Provenance), refactor del manejo de LID, nuevos tipos en `MessageKey`, decodificación con `decodeAndHydrate()`, eliminación de `proto.fromObject()`, paso a Yarn v4/corepack. Performance: el maintainer (Rajeh Taher, WhiskeySockets) declaró en los release notes que «Performat Baileys entering the chat with over 1300 messages per second on Bartender's benchmark mode. That's over 3x the speed of whatsmeow (400-500 on average) and 1.16x the speed of whatsapp-rust. We achieved this using Bun and rust libsignal».
- **Documentación oficial:** la guía nueva está en https://baileys.wiki (en construcción) y el README en npm; la guía oficial declara explícitamente **"As of now, Baileys requires Node 17+"** pero en la práctica la 7.x exige Node 20+ y se desaconseja Bun como runtime productivo por inestabilidad documentada.
- **Comunidad activa:** Discord oficial (https://whiskey.so/discord). Issues abiertos a mayo 2026 oscilan en el rango 2500+, mayoría bugs LID/decryption.

### 2. Stack recomendado (producción 2025-2026)

| Capa | Recomendación principal | Alternativas |
|---|---|---|
| Runtime | **Node.js 20 LTS o 22 LTS**, ESM (`"type": "module"`) | Deno/Bun no recomendado para Baileys productivo |
| Lenguaje | TypeScript 5.x | JavaScript ESM puro |
| Lib WA | `baileys@^7.0.0` | Cloud API oficial (Meta) si volumen real |
| Framework HTTP | **Fastify** (mejor throughput, plugin Pino nativo) o **NestJS** | Express 5 |
| Validación | Zod o `class-validator` (NestJS) | Joi |
| ORM | **Prisma** (mejor DX, soporte Postgres/MySQL) | TypeORM, Drizzle |
| DB primaria | **PostgreSQL 16** | MySQL 8, MongoDB 7 |
| Auth state (Signal keys) | **Redis (hot) + Postgres/Mongo (cold)** vía `@luoarch/baileys-store-core` o auth state propio | `useMultiFileAuthState` SOLO en dev |
| Caché | Redis 7 (con `ioredis`) | Dragonfly (drop-in compatible con BullMQ) |
| Cola de mensajes | **BullMQ** | RabbitMQ, NATS JetStream |
| Dashboard de cola | `@bull-board/express` o `@bull-board/api` | Arena |
| Logger | **Pino** (~10k logs/s, JSON estructurado) | Winston |
| Métricas | `prom-client` + Prometheus + Grafana | Datadog, New Relic, SigNoz/OTEL |
| Tracing | OpenTelemetry → SigNoz/Tempo | — |
| Auth API | JWT + API Key (X-API-Key) + rate limit | Better-auth, Auth.js |
| Storage media | S3 (R2/Wasabi/MinIO) | Cloudinary |
| Process manager | PM2 (modo cluster) o systemd | Docker + supervisord |
| Orquestación | Docker Compose (single host) → Kubernetes (multi número) | Nomad |
| Anti-ban | **`baileys-antiban`** middleware o lógica propia equivalente | — |

### 3. Persistencia de la sesión de Baileys — el punto crítico
La función `useMultiFileAuthState` que aparece en todos los tutoriales tiene un comentario explícito en el código fuente: **"I wouldn't endorse this for any production level use other than perhaps a bot. Would recommend writing an auth state for use with a proper SQL or No-SQL DB"**. El issue #9544 lo amplía: archivos JSON sueltos producen "corrupted sessions, ever inflating CPU/IO usage and even security risks".

Las dos rutas serias en 2025-2026 son:

1. **Auth state propio** sobre Postgres/Redis con `makeCacheableSignalKeyStore` para evitar I/O excesivo (Baileys ya provee la utilidad). Pattern KV: `(sessionId, key, value)`.
2. **Librerías mantenidas:** `@luoarch/baileys-store-core` (Redis hot cache + MongoDB cold storage, circuit breaker, outbox pattern, métricas Prometheus, <5ms lectura), `mongo-baileys`, `baileys-redis-auth` (HSET pattern), `baileys-auth-states`.

**Implementa siempre `getMessage`** en `makeWASocket({ getMessage })` — sin él fallan reintentos, decodificación de polls y mensajes citados.

### 4. Arquitectura de envío masivo (referencia)
```
┌────────────────────────────────────────────────────────────────┐
│ API REST/GraphQL (Fastify/NestJS) ─── JWT + API key + Zod     │
│            │                                                   │
│            ▼                                                   │
│  Producer  ──▶ BullMQ (Redis Streams) ──▶ Workers (concurrency)│
│                       │                          │             │
│                       ▼                          ▼             │
│              Scheduled / Delayed jobs   sock.sendMessage(jid…) │
│                                                  │             │
│         Anti-ban wrapper (rate, jitter, warmup, health)        │
│                                                  │             │
│   ┌──────────────────────────────────────────────┴─────────┐   │
│   │ Baileys 7 socket (1..N por número WhatsApp)            │   │
│   │  Auth state: Redis + Postgres (cifrado AES-256)        │   │
│   │  Store de mensajes: Postgres (con índice por JID/ts)   │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                  │             │
│  Webhooks salientes (HMAC) ◀── Event bus ◀───────┘             │
│  Prometheus /metrics + Pino → Loki/SigNoz                      │
└────────────────────────────────────────────────────────────────┘
```

## Details

### A. Stack técnico actual (2025-2026)

**Versión y forma de instalar.** Tras la fusión del proyecto, el paquete canónico se publica como `baileys` (y aún se replica en `@whiskeysockets/baileys` para retrocompatibilidad). La versión 7.0.0-rc12 era la última publicada al cierre de esta investigación (mayo 2026), con ~520 proyectos npm dependiendo del scoped y 88 del nuevo unscoped. El maintainer indica que las RC10–RC12 incluyen: corrección de >40 vulnerabilidades reportadas por Dependabot, manejo de "ghost sessions", soporte completo para Meta Coexistence, fix de mensajes de Meta Ads, caching de `getBinaryNodeChildren` con WeakMap (~30x speed), tokens TC (Trusted Contact), y mitigación de memory leaks. El cambio a libsignal vía npm registry elimina la necesidad de tener `git` instalado para compilar.

**Node.js.** Mínimo histórico Node 17; la práctica con 7.x es **Node 20 LTS o 22 LTS**, ambos con `require(esm)` ya estable. Bun se desaconseja para producción Baileys (problemas de reconexión y compatibilidad).

**Frameworks web.** 
- **Fastify** es la mejor opción si priorizas throughput y observabilidad: plugin oficial Pino, fastify-metrics para Prometheus, schema validation con Zod/TypeBox. Open-source self-hosted gateways como MultiWA usan precisamente NestJS/Fastify + Baileys + BullMQ + Postgres + Redis con Next.js como dashboard. 
- **NestJS** vale la pena si quieres DI, decoradores, módulos por feature, OpenAPI auto y mejor estructura para equipos. Hay implementaciones de referencia (tutorial "How To Build WhatsApp API Using Baileys (NestJS Framework)" del canal Code Learning de YouTube).
- **Next.js 15** sirve si combinas backend y dashboard (proyecto WA-AKG).

**Bases de datos.**
- **PostgreSQL** se ha vuelto el default razonable para mensajería, contactos, plantillas, segmentos, programación, audit trail y reportes. Con Prisma + Postgres tienes migraciones declarativas, índices parciales para `(status='pending', scheduled_at)`, y soporte JSON nativo para metadata.
- **MongoDB** sigue siendo válida para almacenamiento de historial de mensajes a granel (gran cardinalidad por chat) y para el cold-storage de auth state (mongo-baileys, baileys-store-core híbrido).
- **Redis** es prácticamente obligatorio: (a) backend de BullMQ, (b) caché caliente de Signal keys, (c) rate limit distribuido, (d) deduplicación de eventos.

**Autenticación y seguridad.**
- JWT (RS256) para sesión de usuario del dashboard + API Keys (X-API-Key) para el endpoint de envío programático.
- Multi-tenant: separación lógica por `tenant_id` en cada tabla y por prefijo de Redis (`tenant:{id}:*`).
- RBAC (SUPERADMIN/OWNER/STAFF) como en WA-AKG.
- Helmet, rate-limit (express-rate-limit/@fastify/rate-limit), CORS estricto, validación con Zod en TODOS los inputs.
- Secretos en Vault/Doppler/AWS SSM; nunca en `auth_info_baileys` versionado.

### B. Características funcionales esenciales

**Envío masivo:** producir N jobs en BullMQ con job options `attempts: 5, backoff: { type: 'exponential', delay: 5000 }`, `concurrency` del worker ajustado al número de líneas WA (típicamente 1 worker por número), y un limiter global (`limiter: { max: 8, duration: 60000 }` para ~8 mensajes/min por número como recomienda baileys-antiban).

**Gestión de contactos y segmentación:** tabla `contacts(id, phone E164, lid, opt_in_at, opt_out_at, attributes JSONB)`, `segments(filter JSONB)` y materialización a `segment_members`. Antes de enviar, validar JID con `sock.onWhatsApp([numbers])` y respetar `opt_out`.

**Automatización de flujos:** frameworks reutilizables como **BuilderBot** (`@builderbot/provider-baileys`) o **bot-wa-baileys** dan addKeyword/addAnswer; o construye tu propio motor de flows en JSON (estados → transiciones → handlers).

**Plantillas de mensajes:** persistir en `templates(id, body, variables[], media_url?, locale)`; el render usa Mustache/Handlebars antes de pasarlo a `sock.sendMessage`. NB: WhatsApp Cloud API tiene plantillas aprobadas por Meta — Baileys NO; usar plantillas en Baileys no te exime de la detección de spam.

**Programación:** BullMQ `delay`, `repeat: { pattern: '* 15 3 * * *' }` o repeatable jobs; persiste `scheduled_at` en Postgres para visibilidad y replanificación. Para programaciones largas, el ejemplo del artículo Bun+Hono+BullMQ+whatsapp-web.js (DEV.to abr 2025) muestra el patrón "delay = sendAfter - now" con `concurrency: 1`.

**Media (imágenes, video, documentos):** `sock.sendMessage(jid, { image: { url } })` / `{ video: { url, gifPlayback } }` / `{ document: { url }, mimetype, fileName }`. **Pasa `{ url }` o `{ stream }` en lugar de Buffer** — Baileys encripta como stream para no cargar el archivo entero en memoria. Para descarga: `downloadMediaMessage(message, 'stream', {}, { logger, reuploadRequest: sock.updateMediaMessage })`. Limites del protocolo: inbound 50MB, outbound ~5MB típico. Guarda en S3 y mantén solo refs en Postgres. Para video se requiere ffmpeg local para thumbnails.

**Webhooks e integraciones:** webhook outbound firmado HMAC-SHA256 con secret rotable, payload tipado (`message.upsert`, `connection.update`, `status.update`); reintentos con backoff exponencial; "dead letter" queue cuando supere N intentos. Patrón referencia: WA-AKG expone /webhook configurable por sesión.

### C. Monitoreo, análisis y rate limiting

**Logging:** **Pino** con `pino-pretty` solo en dev, transports a NDJSON archivado / OTel / Loki. Niveles `trace/debug/info/warn/error/fatal`. Child loggers por sessionId/jobId/jid. Para Baileys, configurar `logger: P({ level: 'info' })` en `makeWASocket` (evita 'debug' en prod por verbosidad).

**Métricas (Prometheus):** `prom-client` con counters `wa_messages_sent_total{status,session}`, `wa_messages_failed_total{reason}`, histograms `wa_send_duration_seconds`, gauges `wa_session_state{session}`, `bullmq_queue_active`, `wa_health_score`. Dashboards Grafana con SLO p95 < 2s y tasa de errores <1%.

**Stats de entrega:** consume `messages.update` para `status` (PENDING/SERVER_ACK/DELIVERY_ACK/READ/PLAYED). Persiste y agrega: tasa de entrega (delivered/sent), tasa de lectura (read/delivered).

**Rate limiting & control de flujo:** 
- BullMQ `limiter: { max, duration }` por queue por número.
- Token bucket en Redis para limites multi-instancia.
- **baileys-antiban defaults publicados en su README:** `maxPerMinute: 8, maxPerHour: 200, maxPerDay: 1500, minDelayMs: 1500, maxDelayMs: 5000, newChatDelayMs: 3000, maxIdenticalMessages: 3 (ventana 1 hora), burstAllowance: 3`. Jitter gaussiano (centrado en la media del rango) en vez de uniforme. Simulación de typing ~30ms por carácter.
- **Warmup de 7 días** (también baileys-antiban): día 1: 20, día 2: 36, día 3: 65, día 4: 117, día 5: 210, día 6: 378, día 7: 680, día 8+: sin límite.

**Manejo de errores:** capturar `DisconnectReason` (loggedOut→borrar creds; restartRequired→reconectar; connectionReplaced→un solo socket por número; 408 timeout; 428/429 backoff; 515 restart; 463 reachout timelock; 401). Estrategia: reconexión con backoff exponencial 1s,2s,4s… capado a 60s y un MAX_RECONNECT_RETRIES (~5) tras el cual se notifica a operación.

### D. Seguridad y prevención de bans

**Validación y sanitización:** Zod en frontera; `onWhatsApp([phone])` antes de cualquier envío; lista de bloqueo (segmento opt-out, números corporativos, sandbox); HMAC en webhooks; no permitir HTML/markdown rico en cuerpos generados por usuarios sin escape.

**Manejo de sesiones Baileys:**
- Cifra `creds.json` y los signal keys en reposo con AES-256-GCM (clave en KMS); `@luoarch/baileys-store-core` lo hace nativo con `masterKey` de 64 chars hex.
- `makeCacheableSignalKeyStore(state.keys, logger)` reduce drástic. el I/O.
- Backup periódico cifrado del auth state — re-emparejar es caro y costoso en reputación.
- **Nunca commitees** `auth_info_baileys` ni equivalentes.

**Protección anti-ban (lecciones campo 2025-2026):**
- WhatsApp incrementó bans drásticamente desde octubre 2025 (issue #1869 en el repo de Baileys reportó bans masivos incluso a bots con 3 años de uso).
- ML de WhatsApp pondera fuertemente: **reply-ratio (<10% = alto riesgo), distancia en el grafo de contactos (stranger = alto riesgo), patrones temporales (timing robótico = alto riesgo)** según la investigación citada por baileys-antiban.
- Pally Systems (publicación blog.pallysystems.com, 4 dic 2025) declara textualmente: *«A single WhatsApp number has practical limits (approximately 1000-2000 messages per day for automated systems)»*.
- Pro Sender (prosender.tech/blogs/whatsapp-messaging-limits) basado en su base de >100.000 usuarios publica los rangos: *«Data from 100,000+ Pro Sender users shows: Identical messages = banned after 200-300 messages. Personalized messages = 800+ messages/day safely. Know Your Limits: New account: 200-300/day, Established: 500-800/day, Business: 1,000-1,500/day … Minimum 20 seconds, Optimal 30-60 seconds random»*.
- Kraya-AI estima vida útil 2-8 semanas para automation no oficial agresiva; tipo de errores que indican bloqueo inminente: 403, 401, frecuentes 408/428.
- **Multinúmero con rotación + proxies residenciales** para distribuir carga: la API oficial sube tier 250→1000→10000→100k/día por buena reputación.
- Personalización (variables únicas por destinatario) baja la tasa de banneo: Pro Sender reporta que mensajes idénticos generan ban tras ~200-300 envíos vs. 800+ personalizados.

**Cifrado de datos sensibles:**
- AES-256-GCM (or XChaCha20-Poly1305) para PII en reposo;
- TLS 1.3 obligatorio;
- Tokens API hash + bcrypt o argon2id;
- Secret rotation programada;
- Audit log inmutable (append-only en Postgres con trigger ó pgaudit).

### E. Performance y escalabilidad

**Caching (Redis):** además del auth state, cachea: device list (`userDevicesCache`), JID resolutions (LID↔PN), media uploads (sha256→ref), business profile, group metadata (TTL 5 min).

**Colas (BullMQ):** workers ≥ Node 18, ioredis ≥ 5, `removeOnComplete: 1000`, `removeOnFail: 5000`, `attempts: 5`, `backoff: exponential`. Para multi-tenant, queue por tenant `wa:{tenant}:send`. Bull-Board para inspección visual.

**Balanceo de carga:** 
- Single número → vertical (un proceso por línea + cluster mode para API HTTP).
- Multi número → un microservicio "session-runner" por instancia que mantiene N sockets; routing por consistent hashing `(jid → session)`; Redis pub/sub para coordinar.
- API HTTP detrás de Nginx/Caddy con rate-limit, sticky por API key si la app sostiene SSE/WebSocket para QR.

**Concurrencia:**
- Una sola conexión activa por número (WhatsApp deslogea si abres una segunda).
- Worker concurrency típica: 1 por número (envío secuencial con jitter); concurrencia mayor solo en operaciones de lectura/decryption.
- Backpressure: bloquea producer si `queue.count() > maxPending`.

### F. Alternativas y complementos

| Librería/Servicio | Tipo | Notas 2026 |
|---|---|---|
| **WhatsApp Cloud API (Meta)** | API oficial | Único camino safe a escala. Desde el **1 de julio de 2025 Meta abandonó el modelo de conversación 24h y pasó a per-message pricing (PMP)**: SleekFlow Help (actualizado abril 2026) confirma textualmente *«As of 1 July 2025, conversation-based pricing is no longer applicable. WhatsApp now uses a per-message pricing model»*. Rangos: utility/authentication baratos; marketing internacional puede llegar a $0.24/msg (Chatarmin, chatarmin.com/en/blog/whats-app-api-pricing); replies de servicio dentro de la ventana de 24h iniciada por el cliente siguen siendo gratis. Recomendación firme para marketing/transaccional. |
| `whatsapp-web.js` | Unofficial, Puppeteer | RAM elevada (~500MB extra por instancia Chromium); más simple; abandonado parcialmente. |
| **Evolution API** | Wrapper REST sobre Baileys/whatsmeow + Cloud API | Open-source, Docker; popular en 2026, +6× búsquedas en 12 meses; soporta n8n. |
| **WAHA** | REST API, multi-engine (WEBJS, NOWEB=Baileys, GOWS) | Configurable de un click; multi-cuenta. |
| **Venom-bot / WPPConnect** | Unofficial, Puppeteer | Mantenedor de Venom pide colaboradores; WPPConnect es la base de muchos servers. |
| **Whapi.Cloud / WasenderAPI** | Managed Baileys-like SaaS | $99/mo, mismo riesgo de ban (utilizan Baileys internamente según declaran). |
| **BuilderBot** | Framework de flows multi-provider | Adapta Baileys/Venom/WPPConnect/Meta/Twilio. |
| `baileys-antiban` (kobie3717) | Middleware anti-ban open source | Wrapper de socket, warmup 7 días, jitter gaussiano, health monitor, MIT. Provee mitigación middleware para errores Bad MAC con `jidCanonicalizer`. |
| `@luoarch/baileys-store-core` | Auth state híbrido Redis+Mongo | Circuit breaker, outbox, métricas Prometheus, AES por sesión. |
| `mongo-baileys`, `baileys-redis-auth`, `baileys-auth-states` | Auth state stores | Más ligeros, single-store. |
| `mongo-baileys` `useMongoDBAuthState` | Mongo store | Patrón estable. |
| `@bull-board/express` | UI BullMQ | Dashboard. |
| **PointerSoftware/Baileys-2025-Rest-API** | Boilerplate completo | Express + Prisma + Postgres + Redis + Docker Compose. |
| **WA-AKG** | Self-hosted gateway open source Next.js 15 + Baileys + Prisma | Multi-session, scheduler, auto-reply, webhooks, OpenAPI. |
| **MultiWA** | Open-source gateway, NestJS + adaptadores | Adaptadores Baileys y whatsapp-web.js. |

**Cloud:** AWS (ECS Fargate/EKS + ElastiCache Redis + RDS Postgres + S3), GCP (Cloud Run + Memorystore + Cloud SQL + GCS), Hetzner/DigitalOcean para self-hosted económico, Railway/Render para MVP. Para campañas multi-número, VPS dedicados con IP residencial/4G y proxies por número son la norma.

### G. Documentación y recursos actuales
- **Repo oficial:** https://github.com/WhiskeySockets/Baileys
- **Guía nueva:** https://baileys.wiki (en construcción)
- **Discord:** https://whiskey.so/discord
- **Migración v7:** https://whiskey.so/migrate-latest y https://baileys.wiki/docs/migration/to-v7.0.0/
- **Releases:** https://github.com/WhiskeySockets/Baileys/releases (RC10–RC12 patch notes detallados)
- **Examples comunitarios:** PointerSoftware/Baileys-2025-Rest-API, nizarfadlan/baileys-api, owensdev1/baileys, Alucard0x1/Super-Light-Web-WhatsApp-API-Server
- **Tutoriales recientes (2025-2026):** "Automating WhatsApp with Node.js and Baileys" (Medium, Elvis Gonçalves), "WhatsApp Automation Using Baileys.js: A Complete Guide" (Pally Systems, dic 2025), "Scheduling WhatsApp Messages with Bun + BullMQ" (DEV.to, abril 2025).
- **Mintlify mirror:** https://www.mintlify.com/whiskeysockets/baileys/migration — detalla los cambios v7 (Node 20+, `process()` para eventos, getMessage obligatorio).

## Recommendations

**Etapa 0 (decisión estratégica, semana 1):**
- Si el caso es marketing outbound a contactos no opt-in → **NO uses Baileys**. Ve a Cloud API con BSP económico (Zavu, AiSensy, WhatsAble, respond.io). Umbral de cambio: si tu volumen >500 conversaciones/mes y monetizas → ROI del Cloud API es claro.
- Si es asistente personal, soporte interno, bot a contactos opt-in, integraciones internas, prototipo → Baileys es razonable.

**Etapa 1 (MVP funcional, semanas 2-3):**
1. `npm i baileys@7 fastify zod pino pino-pretty ioredis bullmq @bull-board/api @bull-board/express prisma @prisma/client`
2. Auth state mínimo: Postgres con tabla `(session_id, key, value, updated_at)` y `makeCacheableSignalKeyStore`. No uses `useMultiFileAuthState` ni para dev "que llega a prod".
3. Implementa `getMessage` desde tu store de mensajes (Postgres) — sin él pierdes polls y reintentos.
4. 1 número, queue `wa:send` con `limiter: { max: 8, duration: 60000 }`.
5. Logging Pino + endpoint `/health` y `/metrics`.

**Etapa 2 (producción inicial, semanas 4-8):**
1. Añade `baileys-antiban` o equivalente: wrap del socket, warmup 7 días, jitter gaussiano, health monitor con auto-pausa al cruzar score 60.
2. Webhook outbound firmado HMAC con reintentos.
3. Dashboard básico (Next.js / NestJS Admin) con: estado de sesión (open/connecting/close), QR/pairing code endpoint, lista de campañas, plantillas, contactos, opt-out.
4. Backups cifrados de auth_state y de DB cada 6h.
5. Sentry para errores no controlados + alertas en Slack/Discord vía webhook cuando `lastDisconnect.statusCode = 401 | 408 | 428` o tasa de errores > 5%.

**Etapa 3 (escala, mes 3+):**
1. Multinúmero con consistent hashing y health score por número; rota números bajo umbral 80.
2. Multi-tenant: namespacing en Redis y RLS o `tenant_id` en Postgres.
3. K8s con StatefulSets por session runner (sesiones tienen estado), HPA por queue depth.
4. Prometheus + Grafana + Loki + Tempo (o SigNoz Cloud).
5. Plan de contingencia: capacidad de cambiar a Cloud API (mismo Worker BullMQ, distinto provider) sin tocar capa de negocio.

**Umbrales que cambian las recomendaciones:**
- Volumen >2.000 mensajes/día/número → migra a Cloud API o suma más números.
- Tasa de errores 401/408/428 >3% en 24h → pausa la cola, audita warmup, revisa proxy/IP.
- Block rate (mensajes que el destinatario marca como "block") >5% → marketing está fuera de target, replantea segmentación; este umbral suele preceder ban permanente.
- Reply-ratio <10% sostenido → estás siendo percibido como spam por el ML de Meta.

## Caveats

- **Riesgo legal/ToS:** Baileys es ingeniería inversa de WhatsApp Web; viola los Términos de Servicio de Meta. WhatsApp ha incrementado bans en 2025-2026 incluso contra cuentas con uso de bots de larga data (issue #1869). No hay garantía de continuidad ni soporte oficial.
- **Cadena de suministro:** el incidente lotusbail (descubrimiento Koi Security / Tuval Admoni, divulgación 22 dic 2025; The Hacker News destaca que «the lotusbail npm package has been available for download for six months, and it's especially dangerous because the code works») muestra que forks "anti-ban" con miles de descargas pueden ser maliciosos. **Solo instala forks que verifiques o quédate en `baileys` / `@whiskeysockets/baileys` con provenance verificada.** Activa `npm audit signatures` y revisa `npm view <pkg> dist.attestations`.
- **Estado RC:** 7.0.0-rc12 es RC, no release final. La 7.0.0 estable está prometida tras periodo de pruebas. Espera regresiones en releases candidate y bloquea versión exacta (`"baileys": "7.0.0-rc12"`) durante tu fase crítica.
- **Memoria:** versiones RC tempranas (rc3-rc9) mostraron memory leaks parcialmente resueltos. Monitoriza RSS por proceso y reinicia preventivamente cada 24h hasta release estable.
- **Cifrado libsignal:** mientras se completa el reemplazo Rust, `libsignal` sigue siendo GPLv3 mientras Baileys es MIT — incompatibilidad relevante si distribuyes binarios.
- **Limites publicados por terceros (Pro Sender, baileys-antiban) son heurísticos.** Ningún proveedor unofficial tiene garantía formal; usa ventanas conservadoras y monitoriza obsesivamente.
- **Bun:** a pesar de los benchmarks favorables del maintainer en Bartender (>1300 msg/s), Bun como runtime productivo de Baileys no es recomendable (problemas de reconexión, comportamiento errático documentado por Zenvanriel/OpenClaw). Quédate en Node 20/22.
- **La función `printQRInTerminal` está deprecada** en versiones recientes; usa `connection.update` con la propiedad `qr` y genera el QR con `qrcode-terminal` o `qrcode` (data URL para UI web).
- **Algunos sources usan dates futuras o aspirational** (e.g. el README de baileys-antiban menciona "v3.3", "v3.5", "April 2026 lotusbail" — el incidente real fue diciembre 2025 según Koi Security, Snyk y The Hacker News); valida versiones en npm directamente antes de adoptar.