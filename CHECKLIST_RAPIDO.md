# Checklist Rápido - Qué Falta vs Qué Existe 📍

## Categorías Funcionales

### 1️⃣ ENVÍO DE MENSAJES
| Feature | Status | Nota |
|---------|--------|------|
| Redacción de mensajes | ✅ | Paso 1 completo |
| Personalización ({{nombre}}) | ✅ | Funciona |
| Selección de audiencia | ⚠️ | Solo 2 filtros básicos |
| Confirmación antes de enviar | ✅ | Paso 2 |
| Envío masivo en cola | ✅ | BullMQ + Redis |
| Distribución entre líneas | ✅ | Round-robin |
| Límite diario por línea | ✅ | En el código |

**Qué falta:** Filtros avanzados, validación robusta

---

### 2️⃣ MONITOREO EN TIEMPO REAL
| Feature | Status | Nota |
|---------|--------|------|
| Dashboard con números (total, enviados, pendientes, fallidos) | ✅ | Paso 3 |
| Actualización de estado | ⚠️ | Polling cada 3 seg (ineficiente) |
| Tabla de mensajes en vivo | ✅ | Muestra estado |
| Pausable/cancelable | ❌ | No existe |
| Métricas gráficas | ❌ | Solo números |
| WebSocket | ❌ | No existe |

**Qué falta:** WebSocket (urgente), cancelación, gráficos

---

### 3️⃣ PROCESAMIENTO DE RESPUESTAS
| Feature | Status | Nota |
|---------|--------|------|
| Recibir mensajes inbound | ✅ | Baileys lo capta |
| Análisis con IA (sentimiento, intención) | ✅ | Gemini hace el análisis |
| Guardar análisis en BD | ✅ | Se guarda en Mensaje |
| **VER respuestas en UI** | ❌ | No hay dashboard |
| Conversación por contacto | ❌ | No existe |
| Marcar como respondido | ❌ | No existe |

**Qué falta:** TODO en UI (bandeja de respuestas, conversaciones)

---

### 4️⃣ GESTIÓN DE ERRORES
| Feature | Status | Nota |
|---------|--------|------|
| Reintentos automáticos | ✅ | 3 intentos exponenciales |
| Registro de errores | ❌ | Se descartan silenciosamente |
| Dead Letter Queue | ❌ | No existe |
| Reintentos manuales | ❌ | No existe |
| Notificación de fallo | ❌ | No existe |
| Dashboard de errores | ❌ | No existe |

**Qué falta:** TODO (logging, DLQ, UI)

---

### 5️⃣ CONTROL DE CAMPAÑAS
| Feature | Status | Nota |
|---------|--------|------|
| Crear campaña | ✅ | Funciona |
| Nombrar campaña | ✅ | Campo nombre |
| Listar campañas | ⚠️ | Existe endpoint pero UI limitada |
| **Pausar campaña** | ❌ | No existe |
| **Reanudar campaña** | ❌ | No existe |
| **Cancelar campaña** | ❌ | No existe |
| Duplicar campaña | ❌ | No existe |
| Historial de cambios | ❌ | No existe |

**Qué falta:** Acciones de control (pausar, cancelar, duplicar), auditoría

---

### 6️⃣ FILTROS Y SEGMENTACIÓN
| Feature | Status | Nota |
|---------|--------|------|
| Filtro por barrio | ✅ | Paso 2 |
| Filtro por intención de voto | ✅ | Paso 2 |
| Filtro por fecha | ❌ | No existe |
| Filtro por puesto votación | ❌ | No existe |
| Filtro por problemática | ❌ | No existe |
| Búsqueda por nombre/cédula | ❌ | No existe |
| Excluir campanias previas | ❌ | No existe |
| Audiencias guardadas (presets) | ❌ | No existe |
| Vista previa de audiencia | ⚠️ | Solo primeros 50 |
| Exportar lista | ❌ | No existe |

**Qué falta:** 9 de 10 filtros avanzados

---

### 7️⃣ LÍNEAS WHATSAPP
| Feature | Status | Nota |
|---------|--------|------|
| Modelo en BD | ✅ | LineaWhatsapp table |
| Conectar línea (QR) | ⚠️ | Existe en código, no en UI |
| Ver estado de línea | ❌ | No hay dashboard |
| Ver QR para scanear | ❌ | No accesible desde UI |
| Generar nuevo QR | ❌ | No existe |
| Ver mensajes enviados hoy | ❌ | No existe |
| Cambiar límite diario | ❌ | No existe |
| Historial de desconexiones | ❌ | No existe |
| Rotación automática | ❌ | No existe |

**Qué falta:** UI completa para líneas

---

### 8️⃣ MULTIMEDIA Y ENCUESTAS
| Feature | Status | Nota |
|---------|--------|------|
| Subir imagen/video | ✅ | Por Supabase |
| Validación de tipo | ❌ | No hay validación |
| Compresión | ❌ | No existe |
| Límites de tamaño | ❌ | No validados |
| Vista previa | ⚠️ | Pequeña en mock |
| Encuestas/Polls | ⚠️ | Estructura en BD, no en UI |
| Estadísticas de clicks | ⚠️ | ClicRastreo en BD, no visible |

**Qué falta:** Validación, mejores previsualización, UI para polls

---

### 9️⃣ PLANTILLAS Y REUTILIZACIÓN
| Feature | Status | Nota |
|---------|--------|------|
| Guardar como plantilla | ❌ | No existe |
| Categorizar plantillas | ❌ | No existe |
| Reutilizar plantillas | ❌ | No existe |
| Historial de uso | ❌ | No existe |
| Búsqueda de plantillas | ❌ | No existe |

**Qué falta:** TODO (modelo + endpoints + UI)

---

### 🔟 ANÁLISIS Y REPORTES
| Feature | Status | Nota |
|---------|--------|------|
| Tasa de entrega | ❌ | No calculada |
| Tasa de respuesta | ❌ | No calculada |
| Tasa de clics | ❌ | ClicRastreo existe pero no analizado |
| Comparativa entre campañas | ❌ | No existe |
| Análisis por segmento | ❌ | No existe |
| Gráficos de progreso | ❌ | Solo números |
| Exportar reporte | ❌ | No existe |
| A/B Testing visual | ❌ | Estructura existe, no UI |

**Qué falta:** TODO en analytics (cálculos + gráficos)

---

## Matriz de Importancia

```
CRÍTICO (Hace no funcionar el sistema):
❌ Errores silenciosos
❌ Respuestas invisibles
❌ Filtros inadecuados

MUY IMPORTANTE (Funciona pero incompleto):
❌ Monitoreo poco eficiente (polling)
❌ No puedes controlar campañas
❌ UI de líneas WhatsApp

IMPORTANTE (Mejora UX):
❌ Plantillas
❌ Analytics
❌ Validación robusta

NICE-TO-HAVE (Pulido):
❌ Exportar reportes
❌ Predicciones IA
❌ Integración líderes
```

---

## Archivos a Crear vs Modificar

### CREAR (Nuevos archivos)
```
prisma/migrations/
  → Extensión schema

lib/
  ├─ validation.ts (Zod schemas)
  ├─ socket-server.ts (WebSocket)
  └─ whatsapp/filters.ts (Query builder)

app/api/
  ├─ mensajes/errores/route.ts
  ├─ mensajes/respuestas/route.ts
  ├─ mensajes/respuestas/estadisticas/route.ts
  ├─ plantillas/route.ts
  ├─ contactos/filtrar/route.ts
  ├─ campanas/[id]/estado/route.ts
  ├─ campanas/[id]/acciones/route.ts
  └─ socket/route.ts

app/(dashboard)/
  ├─ mensajes/respuestas/page.tsx
  ├─ mensajes/plantillas/page.tsx
  ├─ mensajes/lineas/page.tsx
  ├─ mensajes/analytics/page.tsx
  └─ mensajes/errores/page.tsx
```

### MODIFICAR (Existing)
```
prisma/schema.prisma
  - Agregar campos a Mensaje y Campana
  - Crear nuevas tablas (MensajeError, PlantillaMensaje)

app/api/mensajes/enviar/route.ts
  - Agregar validación Zod
  - Validar líneas activas

lib/whatsapp/queue.ts
  - Agregar setupErrorHandlers()
  - Emitir a Socket.io

app/(dashboard)/mensajes/page.tsx
  - Integrar filtros dinámicos
  - Reemplazar polling con WebSocket (Fase 3)
```

---

## Estimación Rápida

| Área | Archivos | Horas | Dificultad |
|------|----------|-------|-----------|
| Schema + Validación | 2 modificar, 1 crear | 3 | Fácil |
| Respuestas Inbound | 1 crear + 1 modify | 5 | Media |
| DLQ + Errores | 2 crear, 1 modify | 4 | Media |
| Filtros Avanzados | 2 crear, 1 modify | 5 | Media |
| Control Campañas | 2 crear, 1 modify | 2 | Fácil |
| Plantillas | 2 crear, 1 modify | 3 | Fácil |
| Dashboard Respuestas | 1 crear | 6 | Media |
| Líneas UI | 1 crear, 1 modify | 5 | Media |
| WebSocket | 3 crear, 1 modify | 8 | Difícil |
| Analytics | 1 crear | 4 | Media |

**TOTAL:** ~45 horas

---

## Quick Reference: Por Prioridad

### P0 (ESTA SEMANA)
- [ ] Crear lib/validation.ts
- [ ] Modificar schema (Mensaje, Campana, +2 tablas)
- [ ] Crear app/api/mensajes/errores/route.ts
- [ ] Crear app/api/mensajes/respuestas/route.ts
- [ ] Modificar app/api/mensajes/enviar/route.ts (agregar validación)
- [ ] Modificar lib/whatsapp/queue.ts (agregar error handler)

### P1 (SEMANA SIGUIENTE)
- [ ] Crear lib/whatsapp/filters.ts
- [ ] Crear app/api/contactos/filtrar/route.ts
- [ ] Crear app/api/campanas/[id]/estado/route.ts
- [ ] Crear app/(dashboard)/mensajes/respuestas/page.tsx
- [ ] Crear app/api/plantillas/route.ts

### P2 (SEMANA 3+)
- [ ] Crear lib/socket-server.ts
- [ ] Crear app/api/socket/route.ts
- [ ] Crear app/(dashboard)/mensajes/lineas/page.tsx
- [ ] Crear app/(dashboard)/mensajes/analytics/page.tsx
- [ ] Reemplazar polling con WebSocket en page.tsx

---

## Health Check: ¿Está listo para producción?

```
Entrega de mensajes:              ✅ SÍ
Monitoreo en vivo:                ⚠️  CON POLLING
Gestión de errores:               ❌ NO
Visualización de respuestas:       ❌ NO
Segmentación de audiencia:         ⚠️  BÁSICA
Control de campañas:              ❌ NO
Validación de datos:              ⚠️  PARCIAL
Performance:                       ⚠️  MEJORABLE
Auditoría:                         ❌ NO

VEREDICTO: Funcional, pero NO LISTO para operación a escala.
           Recomendado: Implementar P0 antes de escalar.
```

---

## Camino Rápido (Si tienes poco tiempo)

### Mínimo viable (1 semana):
```
1. Schema + Validación (3h)
2. DLQ de errores (4h)
3. Respuestas inbound endpoint (3h)
4. Controlar campaña (2h)
   ≈ 12 horas

Resultado: Sistema confiable, errores registrados.
```

### Profesional (2 semanas):
```
Agregar:
5. Filtros avanzados (5h)
6. Dashboard respuestas (6h)
7. Plantillas (3h)
   ≈ 23 horas más

Resultado: Campaña profesional con análisis.
```

### Escalable (3 semanas):
```
Agregar:
8. WebSocket (8h)
9. Analytics (4h)
10. Líneas UI (5h)
    ≈ 17 horas más

Resultado: Sistema listo para crecer.
```

