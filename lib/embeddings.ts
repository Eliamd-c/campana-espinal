import prisma from "./db";
import { logger } from "./logger";
import { generarEmbeddingConCache, generarEmbeddingsBatch } from "./embedding-cache";

// ═══════════════════════════════════════════════════════
// Convertir texto en vector de 768 dimensiones (Con caché integrado)
// ═══════════════════════════════════════════════════════
export async function generarEmbedding(texto: string): Promise<number[]> {
  return generarEmbeddingConCache(texto);
}

// Exportar batch helper para inserciones masivas de documentos
export { generarEmbeddingsBatch };

// ═══════════════════════════════════════════════════════
// Guardar un documento vectorizado en Postgres usando Prisma Pool
// ═══════════════════════════════════════════════════════
export async function guardarDocumento(
  titulo: string,
  contenido: string,
  categoria: string = "general",
  metadata: Record<string, any> = {}
): Promise<number> {
  const dbInicio = Date.now();
  const embedding = await generarEmbedding(contenido);
  const vectorStr = `[${embedding.join(",")}]`;

  // Usar Prisma $queryRawUnsafe para beneficiarse del connection pool
  const result = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `INSERT INTO documentos_campana (titulo, categoria, contenido, embedding, metadata)
     VALUES ($1, $2, $3, $4::vector, $5)
     RETURNING id`,
    titulo,
    categoria,
    contenido,
    vectorStr,
    metadata
  );

  logger.info(`[Embeddings] Documento guardado en base de datos. Tiempo: ${Date.now() - dbInicio}ms`, { titulo });

  return result[0].id;
}

// ═══════════════════════════════════════════════════════
// Buscar documentos similares por semántica usando Prisma Pool
// ═══════════════════════════════════════════════════════
export async function buscarDocumentosSimilares(
  pregunta: string,
  limite: number = 4,
  umbral: number = 0.4
): Promise<{ id: number; titulo: string; categoria: string; contenido: string; similarity: number }[]> {
  const dbInicio = Date.now();
  const embedding = await generarEmbedding(pregunta);
  const vectorStr = `[${embedding.join(",")}]`;

  // Usar Prisma $queryRawUnsafe para reutilizar la conexión del pool
  const result = await prisma.$queryRawUnsafe<
    { id: number; titulo: string; categoria: string; contenido: string; similarity: number }[]
  >(
    `SELECT * FROM buscar_documentos_similares($1::vector, $2, $3)`,
    vectorStr,
    umbral,
    limite
  );

  logger.info(`[Embeddings] Búsqueda semántica completada. Tiempo: ${Date.now() - dbInicio}ms`, { pregunta, resultados: result.length });

  return result;
}

// ═══════════════════════════════════════════════════════
// Listar todos los documentos (sin vector) usando Prisma Pool
// ═══════════════════════════════════════════════════════
export async function listarDocumentos(): Promise<
  { id: number; titulo: string; categoria: string; fecha_creado: string }[]
> {
  const result = await prisma.$queryRawUnsafe<
    { id: number; titulo: string; categoria: string; fecha_creado: string }[]
  >(
    `SELECT id, titulo, categoria, fecha_creado FROM documentos_campana ORDER BY fecha_creado DESC`
  );
  return result;
}

// ═══════════════════════════════════════════════════════
// Eliminar un documento usando Prisma Pool
// ═══════════════════════════════════════════════════════
export async function eliminarDocumento(id: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM documentos_campana WHERE id = $1`,
    id
  );
}

// ═══════════════════════════════════════════════════════
// Dividir texto largo en fragmentos (chunking)
// ═══════════════════════════════════════════════════════
export function dividirEnFragmentos(texto: string, tamano: number = 800, solapamiento: number = 100): string[] {
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

