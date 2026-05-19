# 📖 Estándares de Desarrollo - Campaña Espinal

Este documento define los patrones obligatorios para mantener la calidad y seguridad del proyecto tras la Fase 1 del Plan de Mejora.

---

## 1. Validación de Datos (Zod)

**Regla:** Ningún endpoint debe procesar `req.json()` o `searchParams` sin validarlos con un esquema de Zod.

- **Archivo:** `lib/validation.ts`
- **Patrón:**
```typescript
const parsed = MySchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({ error: "Mensaje", details: parsed.error.flatten() }, { status: 400 });
}
const data = parsed.data; // Tipado automáticamente
```

---

## 2. Manejo de Errores

**Regla:** Usar siempre el handler centralizado dentro de bloques `try/catch`. Nunca devolver `500` manualmente con mensajes genéricos.

- **Archivo:** `lib/api/errors.ts`
- **Patrón:**
```typescript
try {
  // logic
} catch (error) {
  return handleError(error, "CONTEXTO_DEL_ERROR");
}
```
*Esto reporta automáticamente a Sentry y loguea en Winston.*

---

## 3. Seguridad y Autenticación

**Regla:** Rutas administrativas o de configuración (como WhatsApp QR) deben estar protegidas por rol.

- **Archivo:** `lib/auth/middleware.ts`
- **Patrón:**
```typescript
export async function GET(req: NextRequest) {
  return requireRole(req, "admin", async (req, session) => {
    // Solo admins llegan aquí
  });
}
```

---

## 4. Logging

**Regla:** Usar `logger` para eventos importantes y `logAPI` para trazabilidad de red.

- **Archivo:** `lib/logger.ts`
- **Uso:**
  - `logger.info("Usuario realizó X", { userId: 123 })`
  - `logger.error("Fallo crítico en Y", error)`

---

## 5. Rate Limiting

**Regla:** Endpoints costosos (IA, OCR, Envíos masivos) deben tener límites activos.

- **Archivo:** `lib/ratelimit.ts`
- **Patrón:**
```typescript
const { success } = await checkRateLimit(rateLimiters.scan, ip);
if (!success) return NextResponse.json({ error: "Límite excedido" }, { status: 429 });
```

---

## 6. Base de Datos (Prisma)

- **Índices:** Siempre agregar `@@index` a campos usados en `where` o `orderBy`.
- **Naming:** Usar `snake_case` para nombres de tablas y campos en la BD (`@@map("nombre_tabla")`).

---

## 7. Testing

- **Ubicación:** `__tests__/api/` o `__tests__/lib/`.
- **Comando:** `npm run test`.
- **Meta:** 70% de cobertura en lógica de negocio.
