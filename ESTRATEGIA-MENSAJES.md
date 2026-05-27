# Estrategia de Envío Masivo de Mensajes — Campaña Espinal

## Visión general

El sistema envía mensajes de WhatsApp a gran escala sin ser detectado como spam ni exponer las cuentas a baneo. Usa **10 líneas de WhatsApp reales** controladas por Chrome real (no una API no oficial), distribuye los mensajes en el tiempo, y se auto-recupera ante caídas sin intervención manual.

---

## 1. Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                   Next.js (UI)                      │
│   Módulo Mensajes → POST /api/mensajes/enviar       │
└───────────────────────┬─────────────────────────────┘
                        │ HTTP
                        ▼
┌─────────────────────────────────────────────────────┐
│              encolarMensajesMasivos()               │
│         lib/whatsapp/queue.ts                       │
│   • Distribuye mensajes por línea (round-robin)     │
│   • Calcula delays anti-spam                        │
│   • Inserta jobs en BullMQ                          │
└───────────────────────┬─────────────────────────────┘
                        │ BullMQ jobs con delay
                        ▼
┌─────────────────────────────────────────────────────┐
│                  Redis (cola)                       │
│   Cola: "whatsapp-messages"                         │
│   Canal pub/sub: "wwebjs:cmd"                       │
└───────────────────────┬─────────────────────────────┘
                        │ jobs ejecutados según delay
                        ▼
┌─────────────────────────────────────────────────────┐
│           Worker  bot/worker-wwebjs.ts              │
│   • Un proceso Node.js corriendo siempre            │
│   • Mantiene 10 Chrome abiertos (1 por línea)       │
│   • Recibe jobs → busca el Chrome correcto → envía  │
└───────────────────────┬─────────────────────────────┘
                        │ sendMessage()
                        ▼
┌─────────────────────────────────────────────────────┐
│         whatsapp-web.js (Chrome real)               │
│   Puppeteer controlando WhatsApp Web en el browser  │
│   Indistinguible de un humano usando el navegador   │
└─────────────────────────────────────────────────────┘
```

---

## 2. Las 10 líneas de WhatsApp

### Qué es una línea

Cada línea es un número de teléfono con WhatsApp activo que el worker controla como un **dispositivo vinculado** (igual que WhatsApp Web en el computador). El teléfono sigue siendo el dispositivo principal; Chrome es el secundario.

### Sesiones persistentes

Las sesiones se guardan en disco:
```
.wwebjs_auth/
  session-linea_1/   ← sesión del número principal
  session-linea_2/   ← sesión de la línea 2
  ...
  session-linea_10/
```

Al reiniciar el worker, cada Chrome restaura su sesión automáticamente **sin necesitar escanear QR de nuevo**. Solo se necesita QR la primera vez que se vincula una línea nueva.

### Estados de una línea

| Estado | Significado |
|--------|-------------|
| `conectado` | Chrome autenticado, listo para enviar |
| `desconectado` | Sin sesión activa, no puede enviar |
| `qr_listo` | QR generado en BD, esperando escaneo del teléfono |
| `baneado` | Cuenta bloqueada por WhatsApp |

### Límite diario

Cada línea tiene un límite de **45 mensajes por día** (configurable). Un cron job lo reinicia a medianoche.

---

## 3. Cómo se encolan los mensajes

### Distribución round-robin

Los mensajes se reparten en orden rotativo entre las líneas conectadas:

```
Campaña con 90 contactos y 2 líneas:

Línea 1 → Contacto 1, 3, 5, 7, ... (45 mensajes)
Línea 2 → Contacto 2, 4, 6, 8, ... (45 mensajes)
```

Si una línea tiene menos capacidad disponible (ya envió mensajes ese día), se salta y la siguiente absorbe la diferencia.

### Fórmula de delay

Cada job tiene un tiempo de espera antes de ejecutarse. La fórmula:

```
delay = (asignados - 1) × INTER_MSG + posicion × INTER_LINEA + jitter
```

Donde:
- `asignados` = cuántos mensajes ya le tocaron a esa línea en esta campaña
- `posicion` = índice de la línea en la rotación (0, 1, 2...)
- `jitter` = número aleatorio para evitar patrones predecibles

---

## 4. Modos de envío

### Modo Normal

Para campañas a números ya contactados antes.

| Parámetro | Valor |
|-----------|-------|
| Tiempo entre mensajes de la misma línea | 3 minutos |
| Separación entre líneas (mismo turno) | 20 segundos |
| Jitter aleatorio | ±30 segundos |
| Velocidad efectiva | ~20 mensajes/hora por línea |
| Con 10 líneas activas | ~200 mensajes/hora |

### Modo Calentamiento

Para números nuevos que nunca han recibido mensajes de estas cuentas. Distribuye los 45 mensajes del día en una ventana de 10 horas para simular comportamiento humano natural.

| Parámetro | Valor |
|-----------|-------|
| Tiempo entre mensajes de la misma línea | ~13.6 minutos |
| Separación entre líneas (mismo turno) | 30 segundos |
| Jitter aleatorio | ±1 minuto |
| Ventana total | 10 horas |
| Velocidad efectiva | ~4-5 mensajes/hora por línea |

**Cuándo usar cada modo:**

| Situación | Modo recomendado |
|-----------|-----------------|
| Cuenta activa enviando desde hace semanas | Normal |
| Cuenta nueva (menos de 2 semanas) | Calentamiento |
| Después de una restricción temporal | Calentamiento |
| Primer contacto con lista de votantes | Calentamiento |

---

## 5. El worker: ciclo de vida de una línea

### Arranque

```
npm run bot
    │
    ├─ Carga todas las líneas de la BD
    ├─ Crea un Client() de whatsapp-web.js por línea
    ├─ Marca cada línea como "reiniciando" (protección)
    ├─ Llama client.initialize() (5 seg de pausa entre cada una)
    │
    └─ Por cada línea:
           ├─ Si tiene sesión guardada → "authenticated" → "ready" (≈5s)
           └─ Si es nueva → genera QR → guarda en BD → UI muestra QR
```

### Eventos del cliente

```
qr          → Guarda QR en BD, estado = "qr_listo"
authenticated → Log informativo (sesión encontrada)
ready       → listos[id] = true, estado BD = "conectado", limpia reiniciando
disconnected → listos[id] = false, estado BD = "desconectado", agenda reconexión
auth_failure → Limpia reiniciando, agenda reconexión con nuevo QR en 10s
```

### Health check (cada 15 segundos)

El worker verifica el estado real de cada Chrome contra lo que cree saber:

```
Para cada línea:
  ┌─ Chrome dice CONNECTED y listos=false?
  │    → Actualizar BD a "conectado", marcar como lista
  │
  ├─ Chrome no está CONNECTED y listos=true?
  │    → Actualizar BD a "desconectado", agendar reconexión (2s)
  │
  ├─ Chrome no está CONNECTED y listos=false y NO reiniciando?
  │    → Agendar reconexión (1s)
  │
  └─ Chrome no está CONNECTED y lleva >3 min en "reiniciando"?
       → initialize() se colgó → Forzar reset y reconexión
```

### Proceso de reconexión

```
agendarReconexion(lineaId, delay)
    │
    ├─ ¿Ya está reiniciando? → salir (anti-loop)
    ├─ Marcar como reiniciando + guardar timestamp
    │
    └─ Después del delay:
           ├─ ¿Ya conectó (health check se adelantó)? → salir limpio
           ├─ Chrome dice CONNECTED? → marcar lista, salir limpio
           └─ client.destroy()     ← mata Chrome zombie
              + esperar 3s         ← OS libera file locks (Windows)
              + client.initialize() ← nuevo Chrome con sesión en disco
              └─ Si falla → backoff exponencial (máx 5 min)
```

### Comunicación Redis pub/sub

Cuando el usuario hace clic en "Generar QR" en la UI:

```
API  →  redis.publish("wwebjs:cmd", "reconectar:4")
Worker recibe en <1 segundo →  reconecta la línea 4 inmediatamente
```

Sin Redis, el health check actúa en máximo 15 segundos.

---

## 6. Procesamiento de mensajes en el worker

```
Job llega de la cola
    │
    ├─ ¿Línea lista (listos[id] = true)?
    │    NO → Esperar hasta 60 segundos (si la línea está arrancando)
    │         Todavía NO → Lanzar error (job reintentará más tarde)
    │
    ├─ Verificar estado del mensaje en BD
    │    cancelado / campaña pausada → omitir silenciosamente
    │
    ├─ Formatear número (Colombia: agregar "57" si tiene 10 dígitos)
    │
    ├─ Jitter humanizador: esperar 1-3 segundos extra aleatorios
    │
    ├─ Enviar mensaje
    │    ├─ Con media → MessageMedia.fromUrl() + caption
    │    └─ Solo texto → client.sendMessage(chatId, texto)
    │
    └─ Actualizar BD:
           ├─ mensaje.estado = "enviado"
           └─ linea.mensajes_enviados_hoy += 1
```

### Reintentos automáticos

Si el envío falla, BullMQ reintenta automáticamente:

| Intento | Espera antes de reintentar |
|---------|--------------------------|
| 1 → 2 | 30 segundos |
| 2 → 3 | 60 segundos |
| 3 → 4 | 120 segundos |
| 4 → 5 | 240 segundos |

Tiempo total de margen: ~7 minutos. Suficiente para que una línea que se desconectó durante el envío se reconecte sola.

---

## 7. Registro de errores

Cuando un mensaje falla definitivamente (5 intentos), se guarda en `mensajes_errores`:

| Campo | Contenido |
|-------|-----------|
| `error_code` | Código categorizado |
| `error_message` | Descripción legible |
| `notas_resolucion` | Error técnico exacto del cliente |
| `intentos` | Cuántas veces se intentó |

### Códigos de error

| Código | Causa | Acción recomendada |
|--------|-------|-------------------|
| `NO_WHATSAPP` | El número no tiene WhatsApp | Depurar la lista de contactos |
| `LINEA_DESCONECTADA` | La línea se cayó y no reconectó en 7 min | Revisar pantalla Líneas |
| `NUMERO_INVALIDO` | Formato de número incorrecto | Corregir en base de datos |
| `ERROR_RED` | Problemas de internet/proxy | Verificar conexión |
| `RATE_LIMIT` | WhatsApp detectó envío excesivo | Cambiar a Modo Calentamiento |
| `ERROR_DESCONOCIDO` | Error no categorizado | Ver `notas_resolucion` en análitica |

---

## 8. Protecciones anti-detección implementadas

### Por qué whatsapp-web.js es más seguro

WhatsApp no puede distinguir entre un humano abriendo WhatsApp Web en Chrome y el worker haciendo lo mismo. A diferencia de librerías como Baileys o Evolution API que reimplementan el protocolo de WhatsApp (y tienen huella digital identificable), whatsapp-web.js controla un Chrome real — WhatsApp ve exactamente lo mismo que vería con cualquier usuario.

### Medidas activas

1. **Delays variables con jitter**: Nunca se envían dos mensajes en el mismo segundo exacto. El tiempo entre mensajes varía aleatoriamente.

2. **Micro-jitter por mensaje**: Además del delay de cola, cada envío espera 1-3 segundos adicionales aleatorios justo antes de `sendMessage()`.

3. **Distribución en 10 horas** (Modo Calentamiento): Simula que una persona está enviando mensajes durante su jornada laboral, no un bot ejecutando a máxima velocidad.

4. **Proxies por línea**: Cada línea tiene asignado un proxy diferente. WhatsApp ve que cada cuenta accede desde una IP diferente, reduciendo la correlación entre ellas.

5. **Un Chrome por línea**: No se reusan sesiones. Cada número tiene su propio perfil de Chrome aislado en disco.

### Lo que NO se debe hacer

- **Enviar al mismo número desde múltiples líneas en segundos**: WhatsApp puede interpretar esto como ataque coordinado y forzar logout en las cuentas.
- **Enviar más de 45 mensajes/día por línea nueva**: Las cuentas jóvenes (<2 semanas) tienen límites más estrictos.
- **Reiniciar el worker mientras hay una campaña activa**: Los jobs quedan en Redis y se procesarán cuando el worker vuelva, pero si la reconexión tarda, algunos pueden agotar reintentos.

---

## 9. Flujo completo de una campaña

```
1. Crear campaña en UI
   └─ Seleccionar contactos + mensaje + modo (normal/calentamiento)

2. Clic en "Enviar"
   └─ POST /api/mensajes/enviar
      ├─ Valida líneas conectadas con capacidad disponible
      ├─ Distribuye mensajes por round-robin
      ├─ Calcula delay para cada mensaje
      └─ Inserta todos los jobs en Redis con sus delays

3. Redis ejecuta los jobs según el tiempo programado
   └─ Cada job llega al worker en el momento calculado

4. Worker procesa cada job
   ├─ Verifica que la línea esté lista
   ├─ Verifica que el mensaje no esté cancelado
   ├─ Envía el mensaje por Chrome
   └─ Actualiza estado en BD → "enviado"

5. UI muestra progreso en tiempo real
   └─ "Transmisión en Vivo": enviados / fallidos / en cola
```

---

## 10. Comandos operativos

```bash
# Iniciar worker (SOLO UN TERMINAL)
npm run bot

# Verificar estado de las líneas
# → Abrir UI → pestaña "Líneas"

# Forzar reconexión de una línea desde UI
# → Clic en "Generar QR" en la tarjeta de la línea

# Limpiar cola de mensajes atascados
npx tsx scripts/limpiar-cola.ts

# Ver logs del worker en tiempo real
# → El terminal donde corre "npm run bot"
```

---

## 11. Diagnóstico rápido de problemas

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| Línea muestra "Desconectado" en UI | Sesión expiró o teléfono sin internet | Clic en "Generar QR", escanear desde el teléfono |
| Mensajes con `LINEA_DESCONECTADA` | La línea cayó durante la campaña y no reconectó | Esperar (reconecta sola en <3 min) o reiniciar worker |
| `The browser is already running` en terminal | Chrome zombie de un cierre abrupto | El worker destruye y reinicializa solo (fix aplicado) |
| `EBUSY: resource busy` en terminal | Windows tiene el archivo de sesión bloqueado | Ignorar — el worker lo maneja y reintenta con 3s de pausa |
| 2 líneas con `authenticated` + `ready` dobles | Double-init del health check | Fix aplicado: `marcarReiniciando()` en startup |
| Campaña con 0 enviados, todos fallidos | Worker no estaba corriendo o Redis caído | Verificar que `npm run bot` esté activo |
| Mensajes `ERROR_DESCONOCIDO` sin detalle | Ver columna `notas_resolucion` en analítica | Filtrar por "Fallidos" en la vista de la campaña |
