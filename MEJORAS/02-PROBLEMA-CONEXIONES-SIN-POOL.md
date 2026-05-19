# 🔴 PROBLEMA 2: CONEXIONES A BD SIN POOL (Overhead de Conexión)

## Estado Actual
En [`lib/embeddings.ts`](../lib/embeddings.ts), cada operación abre/cierra conexión individual:

```typescript
function getDbClient() {
  return new Client({ connectionString: process.env.DATABASE_URL });
  // ↑ Nueva conexión TCP cada vez
}

// Cada embedding:
export async function generarEmbedding(texto: string) {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(texto);
  return result.embedding.values;
}

export async function guardarDocumento(...) {
  const embedding = await generarEmbedding(contenido);
  
  const client = getDbClient();
  await client.connect();    // ← TCP handshake + SSL setup (50-100ms)
  const result = await client.query(...);
  await client.end();        // ← Close connection (10-20ms)
  
  return result.rows[0].id;
}

export async function buscarDocumentosSimilares(...) {
  const embedding = await generarEmbedding(pregunta);
  
  const client = getDbClient();
  await client.connect();    // ← TCP handshake + SSL setup (50-100ms)
  const result = await client.query(...);
  await client.end();        // ← Close connection (10-20ms)
  
  return result.rows;
}
```

## Impacto
- ⏱️ **Latencia por conexión:** 50-100ms (handshake + SSL)
- 📊 **Si hay 5 embeddings:** 250-500ms solo en conexiones
- 💾 **Desperdicio:** Restableciendo conexiones cuando Prisma ya tiene pool
- 🔧 **Inconsistencia:** Prisma en otros archivos usa pool, embeddings no

---

## 📋 Solución Completa

### Opción A: Usar Prisma para TODO (RECOMENDADO)

Prisma **ya tiene pool de conexiones configurado**. Úsalo para embeddings también.

#### 1. Crear tabla en schema si no existe

Añade a `prisma/schema.prisma`:

```prisma
model DocumentoCampana {
  id            Int      @id @default(autoincrement())
  titulo        String   @db.VarChar(200)
  categoria     String   @db.VarChar(40)
  contenido     String   @db.Text
  embedding     String   @db.Text  // JSON array como string
  metadata      Json?
  fecha_creado  DateTime @default(now())

  @@index([categoria])
  @@map("documentos_campana")
}
```

Luego: `npx prisma migrate dev`

#### 2. Reescribir `lib/embeddings.ts` con Prisma

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "@/lib/db";

const EMBEDDING_MODEL = "gemini-embedding-001";

function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY no configurada");
  return new GoogleGenerativeAI(key);
}

// ═══════════════════════════════════════════════════════
// Convertir texto en vector
// ═══════════════════════════════════════════════════════
export async function generarEmbedding(texto: string): Promise<number[]> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(texto);
  return result.embedding.values;
}

// ═══════════════════════════════════════════════════════
// Guardar documento vectorizado
// USA PRISMA CON POOL
// ═══════════════════════════════════════════════════════
export async function guardarDocumento(
  titulo: string,
  contenido: string,
  categoria: string = "general",
  metadata: Record<string, any> = {}
): Promise<number> {
  try {
    const embedding = await generarEmbedding(contenido);
    
    // Prisma reutiliza conexión del pool
    const doc = await prisma.documentoCampana.create({
      data: {
        titulo,
        categoria,
        contenido,
        embedding: JSON.stringify(embedding),
        metadata
      }
    });
    
    return doc.id;
  } catch (error) {
    console.error("Error guardando documento:", error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════
// Buscar documentos similares POR SEMÁNTICA
// USA PRISMA CON POOL + RAW QUERY PARA PGVECTOR
// ═══════════════════════════════════════════════════════
export async function buscarDocumentosSimilares(
  pregunta: string,
  limite: number = 4,
  umbral: number = 0.4
): Promise<
  { id: number; titulo: string; categoria: string; contenido: string; similarity: number }[]
> {
  try {
    const embedding = await generarEmbedding(pregunta);
    const embeddingStr = `[${embedding.join(",")}]`;
    
    // Usar Prisma $queryRaw en lugar de cliente nuevo
    const resultados = await prisma.$queryRaw<
      { id: number; titulo: string; categoria: string; contenido: string; similarity: number }[]
    >`
      SELECT 
        id,
        titulo,
        categoria,
        contenido,
        (1 - (embedding::vector <=> ${embeddingStr}::vector)) as similarity
      FROM documentos_campana
      WHERE (1 - (embedding::vector <=> ${embeddingStr}::vector)) > ${umbral}
      ORDER BY similarity DESC
      LIMIT ${limite}
    `;
    
    return resultados;
  } catch (error) {
    console.error("Error buscando documentos:", error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════
// Listar documentos
// ═══════════════════════════════════════════════════════
export async function listarDocumentos(): Promise<
  { id: number; titulo: string; categoria: string; fecha_creado: Date }[]
> {
  return prisma.documentoCampana.findMany({
    select: {
      id: true,
      titulo: true,
      categoria: true,
      fecha_creado: true
    },
    orderBy: { fecha_creado: "desc" }
  });
}

// ═══════════════════════════════════════════════════════
// Eliminar documento
// ═══════════════════════════════════════════════════════
export async function eliminarDocumento(id: number): Promise<void> {
  await prisma.documentoCampana.delete({
    where: { id }
  });
}

// ═══════════════════════════════════════════════════════
// Dividir texto en fragmentos (chunking)
// ═══════════════════════════════════════════════════════
export function dividirEnFragmentos(
  texto: string,
  tamano: number = 800,
  solapamiento: number = 100
): string[] {
  const palabras = texto.split(/\s+/);
  const fragmentos: string[] = [];
  let inicio = 0;

  while (inicio < palabras.length) {
    const fin = Math.min(inicio + tamano, palabras.length);
    fragmentos.push(palabras.slice(inicio, fin).join(" "));
    if (fin >= palabras.length) break;
    inicio = fin - solapamiento;
  }

  return fragmentos;
}

// ═══════════════════════════════════════════════════════
// BONUS: Batch embeddings (guardar múltiples a la vez)
// ═══════════════════════════════════════════════════════
export async function guardarDocumentosBatch(
  documentos: Array<{ titulo: string; contenido: string; categoria?: string; metadata?: any }>
): Promise<number[]> {
  // Generar todos los embeddings en paralelo
  const embeddings = await Promise.all(
    documentos.map(doc => generarEmbedding(doc.contenido))
  );

  // Crear todos en una sola transacción Prisma
  const creados = await Promise.all(
    documentos.map((doc, idx) =>
      prisma.documentoCampana.create({
        data: {
          titulo: doc.titulo,
          categoria: doc.categoria || "general",
          contenido: doc.contenido,
          embedding: JSON.stringify(embeddings[idx]),
          metadata: doc.metadata
        }
      })
    )
  );

  return creados.map(d => d.id);
}
```

---

### Opción B: Usar Node-pg con Pool (Si prefieres evitar Prisma para estos queries)

#### Crear `lib/db-pool.ts`

```typescript
import { Pool, PoolClient } from "pg";

// Pool singleton - se reutiliza en toda la app
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,              // Máximo de conexiones simultáneas
  min: 2,               // Mínimo para mantener warm
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (error) => {
  console.error("Error en pool de conexiones:", error);
});

export async function queryWithPool<T = any>(
  text: string,
  values?: any[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, values);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function getPoolClient(): Promise<PoolClient> {
  return pool.connect();
}

export function closePool(): Promise<void> {
  return pool.end();
}
```

#### Actualizar `lib/embeddings.ts` con Pool

```typescript
// CAMBIO ÚNICAMENTE EN CONEXIONES:

export async function buscarDocumentosSimilares(...) {
  const embedding = await generarEmbedding(pregunta);
  const vectorStr = `[${embedding.join(",")}]`;

  // ANTES:
  // const client = getDbClient();
  // await client.connect();
  // const result = await client.query(...);
  // await client.end();

  // DESPUÉS:
  const result = await queryWithPool(
    `SELECT id, titulo, categoria, contenido, 
            (1 - (embedding::vector <=> $1::vector)) as similarity
     FROM documentos_campana
     WHERE (1 - (embedding::vector <=> $1::vector)) > $2
     ORDER BY similarity DESC
     LIMIT $3`,
    [vectorStr, umbral, limite]
  );

  return result;
}
```

---

## 📊 Comparación de Impacto

| Métrica | Actual | Opción A (Prisma) | Opción B (Pool) |
|---------|--------|-------------------|-----------------|
| **Latencia conexión** | 50-100ms | 5-10ms | 5-10ms |
| **Overhead por operación** | 100-150ms | 0-5ms | 0-5ms |
| **5 embeddings** | 500-750ms | 25-50ms | 25-50ms |
| **Pool de conexiones** | No | Sí | Sí |
| **Complejidad** | Baja | Media | Baja |
| **Integración con Prisma** | No | Sí | No |

---

## ✅ Pasos de Implementación

### Paso 1: Actualizar `prisma/schema.prisma`

```bash
# Añadir modelo DocumentoCampana si no existe
# Ver arriba en "Opción A: Paso 1"
```

### Paso 2: Migración

```bash
npx prisma migrate dev --name add_documentos_campana
```

### Paso 3: Reescribir `lib/embeddings.ts`

```bash
# Reemplazar contenido con código de Opción A (recomendado)
# O Opción B si prefieres control manual
```

### Paso 4: Actualizar imports

```typescript
// En archivos que usan embeddings:
import { 
  generarEmbedding,
  guardarDocumento,
  buscarDocumentosSimilares,
  // NUEVO:
  guardarDocumentosBatch
} from "@/lib/embeddings";
```

### Paso 5: Pruebas

```bash
# Test 1: Guardar documento
curl -X POST http://localhost:3000/api/ia/documentos \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Plan de Gobierno",
    "contenido": "Mejoras educativas...",
    "categoria": "propuestas"
  }'

# Test 2: Buscar
curl -X POST http://localhost:3000/api/ia/documentos \
  -H "Content-Type: application/json" \
  -d '{
    "pregunta": "¿Cuál es la propuesta de educación?"
  }'

# Esperar ~20ms en lugar de 150ms
```

---

## 🎯 Resultado Esperado

- **Antes:** 150ms por operación (50-100ms conexión + query)
- **Después:** 20-30ms por operación (5ms pool + query rápido)
- **Mejora:** **80-85% más rápido para operaciones BD**

Si hay 5 embeddings:
- **Antes:** 750ms
- **Después:** 100-150ms
- **Mejora:** **5-7x más rápido**

---

## 🔧 Monitoreo

Añadir logging:

```typescript
export async function guardarDocumento(...) {
  const inicio = Date.now();
  const embedding = await generarEmbedding(contenido);
  const dbInicio = Date.now();
  
  const doc = await prisma.documentoCampana.create({
    data: { /* ... */ }
  });
  
  const dbTiempo = Date.now() - dbInicio;
  console.log(`📚 Documento guardado: embedding=${Date.now() - dbInicio - dbTiempo}ms, BD=${dbTiempo}ms`);
  
  return doc.id;
}
```

---

## 📚 Referencias
- [Node-pg Pool](https://node-postgres.com/api/pool)
- [Prisma Connection Pooling](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management)
- [PostgreSQL pgvector with Prisma](https://www.prisma.io/docs/concepts/components/preview-features/full-text-search)
