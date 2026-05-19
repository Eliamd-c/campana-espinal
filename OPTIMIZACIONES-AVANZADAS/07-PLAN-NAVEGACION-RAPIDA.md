# ⚡ PLAN: Navegación Rápida (5s → 0.5s)

## 🔴 PROBLEMA IDENTIFICADO

Tu app tarda **más de 5 segundos** al cambiar entre módulos porque:

### **Culpable #1: Layout es Client Component (CRÍTICO)**
```typescript
// app/(dashboard)/layout.tsx - Línea 1
"use client" ❌ Esto causa el problema
```

**¿Por qué es problema?**
- Cada navegación **re-renderiza TODO el layout**
- Sidebar (11 botones × navegación)
- Header con SearchWithAutocomplete
- usePathname(), useSession() se ejecutan
- **Resultado:** 2-3 segundos de re-render

---

### **Culpable #2: Páginas sin Caché (CRÍTICO)**
```typescript
// app/(dashboard)/contactos/page.tsx - Línea 67
const res = await fetch(`/api/contactos?${params}`); ❌ Sin caché
```

**¿Por qué es problema?**
- Cada vez que navega a Contactos, descarga TODO de nuevo
- No hay caché entre navegaciones
- Si lo visitas 3 veces = 3 requests idénticas
- **Resultado:** 1-2 segundos de espera por red

---

### **Culpable #3: Sin Prefetch (CRÍTICO)**
```typescript
// app/(dashboard)/layout.tsx - Línea 46
<Link href={item.href} prefetch={false} ❌ Desactivado
```

**¿Por qué es problema?**
- Cuando haces click en "Contactos", RECIÉN AHORA carga la página
- No preload mientras escribes en SearchWithAutocomplete
- **Resultado:** 1-2 segundos extra esperando a que cargue

---

### **Culpable #4: Datos grandes sin límite (MODERADO)**
```typescript
// app/(dashboard)/contactos/page.tsx - Línea 68
setContactos(json.data || []);  // ¿Cuántos datos?
```

**¿Por qué es problema?**
- Si traes 10,000 contactos, React procesa 10,000 elementos
- El navegador muere renderizando el DOM
- **Resultado:** Congelación mientras React renderiza

---

## ✅ SOLUCIÓN ARQUITECTONICA

```
ANTES (5+ segundos):
Usuario click "Contactos"
    ↓
Layout re-renderiza (useSession, usePathname) = 1-2s
    ↓
SearchWithAutocomplete re-renderiza = 0.5s
    ↓
Página intenta cargar = 1s
    ↓
API responde (sin caché) = 1-2s
    ↓
React renderiza datos = 0.5-1s
    ↓
Total: 5-7 segundos ❌

DESPUÉS (0.5 segundos):
Usuario hover "Contactos" (mientras está en otro módulo)
    ↓
Prefetch: API preload en background
    ↓
Usuario click "Contactos"
    ↓
Datos YA ESTÁN EN CACHÉ = Instantáneo ✅
    ↓
Total: 0.5 segundos ✅
```

---

## 🎯 PLAN DE IMPLEMENTACIÓN (4 FASES)

### **FASE 1: Separar Layout (30 min)**

**PROBLEMA:** Layout es "use client", se re-renderiza con cada navegación

**SOLUCIÓN:** Convertir layout a server component, extraer componentes cliente

**Cambios:**

1. **Crear `app/(dashboard)/DashboardLayoutServer.tsx`** (Server Component)
   - Sidebar estático
   - Header estático
   - Sin estado, sin efectos

2. **Crear `app/(dashboard)/components/DashboardSidebar.tsx`** (Client Component - Memoizado)
   - Solo esto re-renderiza si pathname cambia
   - Envuelto en React.memo()

3. **Crear `app/(dashboard)/components/DashboardHeader.tsx`** (Client Component - Memoizado)
   - SearchWithAutocomplete como hijo
   - Memoizado para evitar re-renders innecesarios

**Resultado:** Layout NO se re-renderiza con cada navegación ✅

---

### **FASE 2: Implementar TanStack Query (1.5 horas)**

**PROBLEMA:** Cada página hace fetch sin caché

**SOLUCIÓN:** Usar `@tanstack/react-query` para caché inteligente

**Cambios:**

1. **Instalar dependencias:**
   ```bash
   npm install @tanstack/react-query @tanstack/react-query-devtools
   ```

2. **Crear `lib/queryClient.ts`:**
   ```typescript
   import { QueryClient } from "@tanstack/react-query";
   
   export const queryClient = new QueryClient({
     defaultOptions: {
       queries: {
         staleTime: 5 * 60 * 1000, // 5 minutos
         gcTime: 10 * 60 * 1000, // 10 minutos (era cacheTime)
         retry: 1,
       },
     },
   });
   ```

3. **Actualizar `components/Providers.tsx`:**
   ```typescript
   "use client";
   
   import { QueryClientProvider } from "@tanstack/react-query";
   import { SessionProvider } from "next-auth/react";
   import { queryClient } from "@/lib/queryClient";
   
   export function Providers({ children }: { children: React.ReactNode }) {
     return (
       <QueryClientProvider client={queryClient}>
         <SessionProvider>{children}</SessionProvider>
       </QueryClientProvider>
     );
   }
   ```

4. **Refactorizar `contactos/page.tsx` para usar Query:**
   ```typescript
   "use client";
   
   import { useQuery } from "@tanstack/react-query";
   
   export default function ContactosPage() {
     const { data, isLoading } = useQuery({
       queryKey: ["contactos", page, filters],
       queryFn: async () => {
         const res = await fetch(`/api/contactos?...`);
         return res.json();
       },
     });
     
     // Componente renderiza con datos en caché
   }
   ```

**Resultado:** 
- Cambias a Contactos → descarga (1s)
- Cambias a Dashboard → instantáneo (caché)
- Vuelves a Contactos → instantáneo (caché)
✅

---

### **FASE 3: Habilitar Prefetch (30 min)**

**PROBLEMA:** Sin prefetch, tienes que esperar a que hagas click

**SOLUCIÓN:** Precargar datos cuando haces hover en los botones

**Cambios:**

1. **Crear `app/(dashboard)/components/NavLink.tsx`:**
   ```typescript
   "use client";
   
   import Link from "next/link";
   import { useQueryClient } from "@tanstack/react-query";
   
   export function NavLink({ href, children, prefetchFn }: Props) {
     const queryClient = useQueryClient();
     
     const handleMouseEnter = async () => {
       // Prefetch al hacer hover
       if (prefetchFn) {
         queryClient.prefetchQuery(prefetchFn());
       }
     };
     
     return (
       <Link
         href={href}
         onMouseEnter={handleMouseEnter}
         className="..."
       >
         {children}
       </Link>
     );
   }
   ```

2. **Actualizar sidebar:**
   ```typescript
   const prefetchContactos = () => ({
     queryKey: ["contactos", 1, {}],
     queryFn: () => fetch("/api/contactos?page=1&limit=50").then(r => r.json()),
   });
   
   <NavLink href="/contactos" prefetchFn={prefetchContactos}>
     👥 Contactos
   </NavLink>
   ```

**Resultado:**
- Hover en "Contactos" → prefetch en background
- Click en "Contactos" → datos YA ESTÁN ✅

---

### **FASE 4: Optimizaciones Finales (1 hora)**

#### **4.1: Memoización de Componentes**

```typescript
// app/(dashboard)/components/DashboardSidebar.tsx
import { memo } from "react";

export const DashboardSidebar = memo(function Sidebar(props) {
  return (
    // ... sidebar content
  );
}, (prevProps, nextProps) => {
  // Solo re-render si pathname cambia
  return prevProps.pathname === nextProps.pathname;
});
```

#### **4.2: Lazy Loading de Módulos**

```typescript
// app/(dashboard)/layout.tsx
import dynamic from "next/dynamic";

const DashboardContent = dynamic(
  () => import("./content"),
  { loading: () => <div>Cargando...</div> }
);
```

#### **4.3: Pagination en Contactos**

```typescript
// app/(dashboard)/contactos/page.tsx

// ANTES
const [contactos, setContactos] = useState<Contacto[]>([]); // ¿5000 items?

// DESPUÉS
const [page, setPage] = useState(1);
const itemsPerPage = 50;

// API solo devuelve 50 items
// Lazy load más cuando haces scroll
```

#### **4.4: Streaming de Datos**

```typescript
// app/(dashboard)/dashboard/page.tsx
export default async function DashboardPage() {
  return (
    <>
      <Suspense fallback={<SkeletonMetricas />}>
        <MetricasSection />
      </Suspense>
      
      <Suspense fallback={<SkeletonChat />}>
        <ChatSection />
      </Suspense>
    </>
  );
}
```

---

## 📊 IMPACTO ESPERADO

| Fase | Cambio | Mejora | Tiempo Total |
|------|--------|--------|---|
| Actual | Ninguno | - | 5-7s |
| + Fase 1 | Layout + Memoización | -40% | 3-4s |
| + Fase 2 | TanStack Query | -60% | 1-2s |
| + Fase 3 | Prefetch | -80% | 0.5-1s |
| + Fase 4 | Optimizaciones | -95% | **0.5s** |

---

## 📋 CHECKLIST DE IMPLEMENTACIÓN

### FASE 1: Separar Layout (30 min)
- [ ] Leer `app/(dashboard)/layout.tsx` actual
- [ ] Crear `app/(dashboard)/DashboardLayoutServer.tsx` como Server Component
- [ ] Crear `components/DashboardSidebar.tsx` con React.memo()
- [ ] Crear `components/DashboardHeader.tsx` con React.memo()
- [ ] Actualizar `app/(dashboard)/layout.tsx` para usar nuevos componentes
- [ ] Probar navegación entre módulos
- [ ] Verificar que el tiempo bajó a 3-4s

### FASE 2: TanStack Query (1.5 horas)
- [ ] `npm install @tanstack/react-query`
- [ ] Crear `lib/queryClient.ts`
- [ ] Actualizar `components/Providers.tsx`
- [ ] Refactorizar `contactos/page.tsx` para usar `useQuery`
- [ ] Refactorizar `dashboard/page.tsx` para usar `useQuery`
- [ ] Refactorizar `lideres/page.tsx` para usar `useQuery`
- [ ] Probar navegación con DevTools de React Query
- [ ] Verificar que el tiempo bajó a 1-2s

### FASE 3: Prefetch (30 min)
- [ ] Crear `components/NavLink.tsx` con prefetch
- [ ] Actualizar sidebar para usar `NavLink`
- [ ] Probar hover + click (debería ser instantáneo)
- [ ] Verificar que el tiempo bajó a 0.5-1s

### FASE 4: Optimizaciones (1 hora)
- [ ] Envolver componentes en React.memo()
- [ ] Implementar Suspense + Skeleton loaders
- [ ] Agregar pagination a Contactos
- [ ] Probar con DevTools de React
- [ ] Verificar que el tiempo es 0.5s

---

## 🚨 COSAS IMPORTANTES

### **¿Local o Producción?**
- Este problema ocurre **en AMBOS** (local + producción)
- Es puramente un problema de JavaScript/React, no de red
- La solución sirve en ambos casos

### **¿Perderé funcionalidad?**
- **NO** - Solo reorganizamos el código
- Seguirá funcionando igual
- Pero 10x más rápido

### **¿Cuándo notar cambios?**
- **Fase 1:** Cambio pequeño (puede no notarse)
- **Fase 2:** Cambio notorio (1-2s)
- **Fase 3:** Muy notorio (instantáneo en second click)
- **Fase 4:** Increíblemente rápido (siempre instantáneo)

---

## 💡 PRÓXIMOS PASOS

**Opción A:** Implemento todas las fases ahora
**Opción B:** Empezamos con Fase 1 + 2 (las más importantes)
**Opción C:** Quieres que profundice en alguna parte

¿Cuál prefieres? 🎯

---

## 📞 INFORMACIÓN ADICIONAL

### **Si quieres entender más:**
- **Culpable 1:** `app/(dashboard)/layout.tsx` línea 1 (`"use client"`)
- **Culpable 2:** `app/(dashboard)/contactos/page.tsx` línea 67 (fetch sin caché)
- **Culpable 3:** `app/(dashboard)/layout.tsx` línea 46 (`prefetch={false}`)

### **Archivos que cambiarán:**
```
app/
├── layout.tsx (raíz) ← mínimos cambios
├── (dashboard)/
│   ├── layout.tsx ← REFACTOR COMPLETO
│   ├── DashboardLayoutServer.tsx ← NUEVO
│   ├── components/
│   │   ├── DashboardSidebar.tsx ← NUEVO
│   │   ├── DashboardHeader.tsx ← NUEVO
│   │   ├── NavLink.tsx ← NUEVO
│   │   └── SearchWithAutocomplete.tsx ← refactor
│   ├── contactos/page.tsx ← refactor
│   ├── dashboard/page.tsx ← refactor
│   └── ... otros módulos ← refactor similar
├── components/
│   └── Providers.tsx ← ACTUALIZAR
└── lib/
    └── queryClient.ts ← NUEVO
```

### **Dependencias nuevas:**
```bash
npm install @tanstack/react-query
```

---

**¿Listo para implementar?** 🚀
