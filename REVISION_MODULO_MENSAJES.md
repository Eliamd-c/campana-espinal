# Revisión Profunda - Módulo de Mensajes 📊

## Estado Actual ✅

### Funcionalidades Existentes
1. **Envío de Mensajes Masivos** - Campañas multi-etapa:
   - Paso 1: Redacción con personalización ({{nombre}})
   - Paso 2: Segmentación por barrio e intención de voto
   - Paso 3: Monitoreo en vivo (polling cada 3 seg)

2. **Almacenamiento de Mensajes** - Schema Prisma:
   - Modelo `Mensaje` con estados: pendiente, enviado, entregado, leído, fallido
   - Dirección: enviado/recibido
   - Categoría, sentimiento, requiere_respuesta

3. **Cola de Distribución** (Redis + BullMQ):
   - `encolarMensajesMasivos()` - Round-Robin entre líneas activas
   - Control de límites diarios por línea
   - Reintentos exponenciales (3 intentos)

4. **Procesamiento Inbound** (IA + Gemini):
   - Análisis de sentimiento (alegre, enojado, neutral, preocupado)
   - Clasificación de intención (positivo, negativo, indeciso, desconocido)
   - Generación automática de respuestas
   - Extracción de concepto para BD

5. **Multimedia & Interactividad**:
   - Soporte para imágenes/videos (Supabase)
   - Encuestas/Polls (estructura en BD, no implementado en frontend)

6. **Líneas WhatsApp**:
   - Múltiples instancias (LineaWhatsapp model)
   - Gestión de QR y estados
   - Rastreo de límites diarios

---

## LO QUE FALTA - Áreas Críticas 🔴

### 1. **GESTIÓN AVANZADA DE CAMPAÑAS** (Criticidad: ALTA)
**Problema:** Las campañas son muy básicas, sin opciones de control real.

**Falta:**
- [ ] Pausar/Reanudar campañas en ejecución
- [ ] Cancelar campañas (y marcar todos los pendientes como cancelados)
- [ ] Duplicar campañas (copiar texto, filtros y configuración)
- [ ] Programación de envíos (scheduled dispatch a fecha/hora específica)
- [ ] A/B Testing: Crear variaciones y medir tasas de entrega vs engagement
- [ ] Estadísticas detalladas por campaña:
  - Tasa de apertura (si está disponible en el proveedor)
  - Tasa de clics en enlaces cortos
  - Tasa de respuesta de ciudadanos
  - Retorno a segmentos: positivo/negativo/indecisos

**Por qué importa:** Las campañas son el corazón de tu aplicación. Sin estas features, es imposible optimizar la comunicación o entender qué funciona.

---

### 2. **FALTA MANEJO ROBUSTO DE ERRORES** (Criticidad: MEDIA)
**Problema:** Los errores no se capturan bien; si falla algo en la cola, se pierde contexto.

**Falta:**
- [ ] Logging detallado de fallos (error_code, error_message, timestamp, retry_count)
- [ ] Dead Letter Queue (DLQ) para mensajes que fallan permanentemente
- [ ] Webhook/notificación cuando falla un lote completo
- [ ] Reintento manual para mensajes fallidos (botón en UI)
- [ ] Auditoría: quién envió qué, cuándo, con qué resultado
- [ ] Registro de cambios en campañas (CRUD audit)

**Por qué importa:** Cuando envías 5000 mensajes y algo falla silenciosamente, no sabes quién no recibió nada.

---

### 3. **FILTROS & SEGMENTACIÓN LIMITADA** (Criticidad: ALTA)
**Problema:** Solo tienes 2 filtros (barrio + intención de voto). Las campañas reales necesitan más precisión.

**Falta:**
- [ ] Filtro por rango de fechas (fecha_último_contacto, fecha_registro)
- [ ] Filtro por problemática/categoría_problematica
- [ ] Filtro por puesto de votación / mesa
- [ ] Filtro por líder/zona asignada
- [ ] Búsqueda por nombre/cédula
- [ ] Excluir contactos que ya recibieron cierta campaña
- [ ] "Audiencias Guardadas" - guardar filtros como presets
- [ ] Vista previa de contactos ANTES de confirmar (hay 50 max ahora)
- [ ] Exportar lista de audiencia (CSV/Excel)

**Por qué importa:** La segmentación diferenciada es crucial para no spamear a gente que ya te apoya o no enviar a quien no puede votar en una zona específica.

---

### 4. **FALTA ANÁLISIS DE RESPUESTAS INBOUND** (Criticidad: ALTA)
**Problema:** Procesas respuestas con IA, pero no hay forma de verlas o trabajar con ellas en la UI.

**Falta:**
- [ ] Dashboard de respuestas por campaña
  - "De la campaña X, ¿cuántos dijeron positivo vs negativo?"
- [ ] Bandeja de entrada de mensajes entrantes (como WhatsApp)
- [ ] Conversaciones por contacto (ver todo el hilo con una persona)
- [ ] Marcado manual de sentimiento/intención (si IA falló)
- [ ] Vista de "Contactos que requieren respuesta" (requiere_respuesta = true)
- [ ] Respuestas automáticas vs manuales (quien respondió manualmente cada uno)
- [ ] Análisis de tendencias: ¿los ciudadanos responden mejor a qué tipo de mensaje?

**Por qué importa:** Si no ves las respuestas, no sabes si tu campaña tuvo impacto o si hay problemas que la gente te reporta.

---

### 5. **MÉTRICAS & ANALYTICS DÉBILES** (Criticidad: MEDIA)
**Problema:** Solo tienes contador de estados. No hay análisis real del impacto.

**Falta:**
- [ ] Tasa de entrega por línea WhatsApp (¿cuál línea funciona mejor?)
- [ ] Tasa de respuesta por campaña
- [ ] Tasa de clics en enlaces (ClicRastreo está en BD, no en UI)
- [ ] Gráficos de progreso en tiempo real (no solo números)
- [ ] Comparación entre campañas (¿cuál generó más respuestas?)
- [ ] Análisis por segmento (¿un barrio respondió mejor que otro?)
- [ ] Tiempo promedio de respuesta
- [ ] Matriz de conversión: mensajes enviados → respuestas → compromisos

**Por qué importa:** Sin métricas, no puedes medir ROI ni optimizar futuras campañas.

---

### 6. **FALTA SINCRONIZACIÓN DE ESTADO** (Criticidad: ALTA)
**Problema:** El estado de los mensajes en la BD no se actualiza en tiempo real. Depende de polling cada 3 seg (ineficiente).

**Falta:**
- [ ] Webhooks/callbacks desde WhatsApp para marcar mensajes como "entregado"
- [ ] WebSocket para push de updates (en lugar de polling)
- [ ] Sincronización de estados de entregas (WhatsApp Status)
- [ ] Manejo de mensajes bloqueados/borrados por receptor
- [ ] Sincronización bidireccional con Baileys (número de read receipts)

**Por qué importa:** Polling cada 3 seg consume recursos. Con WebSocket, ves cambios en tiempo real sin overhead.

---

### 7. **FALTA GESTIÓN DE LÍNEAS WHATSAPP** (Criticidad: MEDIA)
**Problema:** Hay modelo en BD pero sin UI para gestionarlas.

**Falta:**
- [ ] Dashboard de líneas: ver estado, QR, conexión
- [ ] Generar nuevo QR (reconnect)
- [ ] Establecer límite diario por línea
- [ ] Ver mensajes enviados hoy vs límite
- [ ] Cambiar nombre/descripción de línea
- [ ] Historial de desconexiones/reconexiones
- [ ] Rotación automática de líneas (cuando una se satura)
- [ ] Gestión de sesiones de autenticación (WhatsappAuthState)

**Por qué importa:** Sin esto, los admins no pueden diagnosticar por qué fallan los envíos o manejar líneas nuevas.

---

### 8. **FALTA PLANTILLAS DE MENSAJES** (Criticidad: MEDIA)
**Problema:** Escribes cada mensaje desde cero. Las campañas recurrentes son tediosas.

**Falta:**
- [ ] Guardar mensajes como plantillas
- [ ] Categorizar plantillas (Evento, Agradecimiento, Llamado a Acción, etc)
- [ ] Previsualización de plantilla con datos de prueba
- [ ] Historial de usos de plantilla
- [ ] Permiso para que solo el admin edite plantillas
- [ ] Búsqueda de plantillas por keyword

**Por qué importa:** Facilita campañas recurrentes y reduce errores tipográficos.

---

### 9. **FALTA VALIDACIÓN & SANITIZACIÓN** (Criticidad: ALTA)
**Problema:** El formulario permite enviar mensajes sin validar.

**Falta:**
- [ ] Validar que el número de teléfono es válido
- [ ] Sanitizar entrada de usuario (XSS, inyección)
- [ ] Limite de caracteres por mensaje (WhatsApp = 4096)
- [ ] Prevenir envío a líneas desconectadas
- [ ] Validación de mediaUrl (confirmar que es accesible)
- [ ] Prevenir duplicados: si ya enviaste a este contacto hoy, advertir
- [ ] Validar que hay al menos 1 línea activa antes de enviar

**Por qué importa:** Evitas errores costosos (enviar a números inválidos, líneas caídas, etc).

---

### 10. **FALTA HISTORIAL & AUDITORÍA** (Criticidad: MEDIA)
**Problema:** No hay forma de ver qué pasó exactamente con una campaña después de completada.

**Falta:**
- [ ] Historial de campañas (creadas, modificadas, enviadas)
- [ ] Quién envió qué campaña
- [ ] Cuándo se envió, cuánto tardó el envío completo
- [ ] Cambios en campaña (si la editaste después de crear)
- [ ] Log de intentos fallidos y reintentos
- [ ] Exportar reporte de campaña (PDF/CSV)

**Por qué importa:** Compliance y auditoría son críticos en contextos políticos.

---

### 11. **FALTA INTEGRACIÓN CON LÍDERES/EVENTOS** (Criticidad: MEDIA)
**Problema:** Los módulos de Líderes y Eventos existen pero no se conectan con Mensajes.

**Falta:**
- [ ] Enviar campaña a contactos de un líder específico
- [ ] Notificación a líderes cuando un mensaje de su zona requiere respuesta
- [ ] Integración con eventos: "Enviar campaña a asistentes del evento X"
- [ ] Permitir líderes ver respuestas de su zona
- [ ] Mensaje de confirmar asistencia a evento por WhatsApp

**Por qué importa:** Cierra el loop entre movilización (eventos), gestión (líderes) y comunicación (mensajes).

---

### 12. **FALTA MANEJO DE MEDIOS AVANZADO** (Criticidad: BAJA)
**Problema:** Subes imágenes/videos pero no hay validación ni vista previa.

**Falta:**
- [ ] Validar tipo de archivo (no permitir ejecutables, etc)
- [ ] Comprimir imagen antes de enviar
- [ ] Vista previa más grande del media antes de confirmar
- [ ] Límites de tamaño (WhatsApp tiene restricciones)
- [ ] Caché de medios para evitar re-subidas
- [ ] Estadísticas: ¿qué imágenes generan más clics?

**Por qué importa:** Los medios pueden mejorar engagement pero también pueden fallar o no enviarse.

---

## RESUMEN - Priorización 🎯

| **Prioridad** | **Área** | **Impacto** | **Esfuerzo** |
|---|---|---|---|
| 🔴 P0 | Gestión avanzada de campañas | Crítico | Alto |
| 🔴 P0 | Análisis de respuestas inbound | Crítico | Medio |
| 🔴 P0 | Filtros & segmentación mejorada | Crítico | Medio |
| 🔴 P0 | Sincronización de estado (WebSocket) | Crítico | Alto |
| 🟠 P1 | Manejo de líneas WhatsApp (UI) | Alto | Medio |
| 🟠 P1 | Validación robusta | Alto | Bajo |
| 🟠 P1 | Plantillas de mensajes | Alto | Bajo-Medio |
| 🟠 P1 | Manejo de errores & Dead Letter Queue | Alto | Medio |
| 🟡 P2 | Historial & Auditoría | Medio | Bajo-Medio |
| 🟡 P2 | Métricas avanzadas | Medio | Medio |
| 🟡 P2 | Integración con Líderes/Eventos | Medio | Medio |
| 🟡 P2 | Manejo de medios avanzado | Bajo | Bajo |

---

## Recomendación de Enfoque

**Empezar por P0 (las 4 primeras areas):**
1. **Gestión de campañas** - Habilita pausa/cancelación/A/B testing
2. **Respuestas inbound** - Dashboard + bandeja de entrada
3. **Filtros mejorados** - Segmentación real
4. **WebSocket** - Elimina polling, mejora UX

Esto te da un sistema de campaña completo y profesional.

---

## Notas Técnicas

### Deuda Técnica Detectada
1. **Polling**: Cada 3 segundos desde frontend para monitoreo. Usar WebSocket + Server-Sent Events (SSE).
2. **Sin transcontinental**: Las respuestas se guardan pero no hay UI para consultarlas.
3. **Queue sin DLQ**: Mensajes fallidos permanentes no tienen destino claro.
4. **Análisis débil**: Groupby por estado está bien, pero faltan relaciones (por qué falló?, error específico?)
5. **Sin Rate Limiting en envío**: Aunque hay límite diario por línea, falta prevención de burst.

### Dependencias Externas
- **Supabase** (almacenamiento de media) - Funciona bien
- **Redis + BullMQ** (cola) - Funciona bien
- **Gemini 2.5 Flash** (análisis inbound) - Funciona bien
- **Baileys** (WhatsApp) - Inestable (bloques, QR)

