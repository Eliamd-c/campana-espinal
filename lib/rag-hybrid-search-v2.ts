import prisma from "@/lib/db";
import { generarEmbeddingConCache } from "./embedding-cache";
import { traceBDOperation } from "./tracing-helpers";

interface DocumentoRAG {
  id: number;
  titulo: string;
  contenido: string;
  categoria: string;
  fuente: string;
  fecha_creacion: Date;
  relevancia: number;
  confianza: "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE";
}

/**
 * BÚSQUEDA ULTRA-INTELIGENTE
 * Combina: Semantic (60%) + BM25 (30%) + Categoria (7%) + Recencia (3%)
 * Deduplicación y reranking automático.
 */
export async function buscarDocumentosUltra(
  pregunta: string,
  limite: number = 5
): Promise<DocumentoRAG[]> {
  try {
    // ========== BÚSQUEDA 1: SEMÁNTICA (embeddings) ==========
    const embedding = await generarEmbeddingConCache(pregunta);
    const embeddingStr = `[${embedding.join(",")}]`;

    const semanticos = await traceBDOperation("RAG_V2_Semantic_Search", () =>
      prisma.$queryRawUnsafe<
        Array<{
          id: number;
          titulo: string;
          contenido: string;
          categoria: string;
          fuente: string;
          fecha_creacion: Date;
          similarity: number;
        }>
      >(
        `SELECT 
          id, titulo, contenido, categoria,
          COALESCE(metadata->>'fuente', 'Oficial') AS fuente,
          fecha_creado AS fecha_creacion,
          (1 - (embedding <=> $1::vector)) as similarity
        FROM documentos_campana
        WHERE embedding IS NOT NULL
          AND (1 - (embedding <=> $1::vector)) > $2
        ORDER BY similarity DESC
        LIMIT $3`,
        embeddingStr,
        0.5,
        Math.ceil(limite * 2.5)
      )
    );

    // ========== BÚSQUEDA 2: POR PALABRAS CLAVE (BM25) ==========
    const keywords = pregunta
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .map((w) => w.toLowerCase())
      .join(" & ");

    const porPalabras = await traceBDOperation("RAG_V2_Keyword_Search", () =>
      prisma.$queryRawUnsafe<
        Array<{
          id: number;
          titulo: string;
          contenido: string;
          categoria: string;
          fuente: string;
          fecha_creacion: Date;
          bm25_rank: number;
        }>
      >(
        `SELECT 
          id, titulo, contenido, categoria,
          COALESCE(metadata->>'fuente', 'Oficial') AS fuente,
          fecha_creado AS fecha_creacion,
          ts_rank(
            to_tsvector('spanish', contenido), 
            plainto_tsquery('spanish', $1)
          ) as bm25_rank
        FROM documentos_campana
        WHERE to_tsvector('spanish', contenido) @@ 
              plainto_tsquery('spanish', $1)
        ORDER BY bm25_rank DESC
        LIMIT $2`,
        keywords || pregunta,
        Math.ceil(limite * 2.5)
      )
    );

    // ========== BÚSQUEDA 3: POR CATEGORÍA (exactitud) ==========
    const categoria = extraerCategoria(pregunta);
    let porCategoria: typeof semanticos = [];

    if (categoria) {
      porCategoria = await traceBDOperation("RAG_V2_Category_Search", () =>
        prisma.$queryRawUnsafe<any[]>(
          `SELECT 
            id, titulo, contenido, categoria,
            COALESCE(metadata->>'fuente', 'Oficial') AS fuente,
            fecha_creado AS fecha_creacion,
            0.95 as similarity
          FROM documentos_campana
          WHERE categoria = $1
          ORDER BY fecha_creado DESC
          LIMIT $2`,
          categoria,
          Math.ceil(limite * 1.5)
        )
      );
    }

    // ========== COMBINAR Y DEDUPLICAR ==========
    const combined = new Map<
      number,
      {
        id: number;
        titulo: string;
        contenido: string;
        categoria: string;
        fuente: string;
        fecha_creacion: Date;
        semantic_score: number;
        bm25_score: number;
        categoria_score: number;
        recency_score: number;
      }
    >();

    // Agregar resultados semánticos
    semanticos.forEach((doc) => {
      combined.set(doc.id, {
        ...doc,
        semantic_score: doc.similarity,
        bm25_score: 0,
        categoria_score: 0,
        recency_score: calcularRecencia(doc.fecha_creacion),
      });
    });

    // Agregar/actualizar con BM25
    porPalabras.forEach((doc) => {
      if (combined.has(doc.id)) {
        const existing = combined.get(doc.id)!;
        existing.bm25_score = doc.bm25_rank;
      } else {
        combined.set(doc.id, {
          ...doc,
          semantic_score: 0,
          bm25_score: doc.bm25_rank,
          categoria_score: 0,
          recency_score: calcularRecencia(doc.fecha_creacion),
        });
      }
    });

    // Agregar/actualizar con categoría
    porCategoria.forEach((doc) => {
      if (combined.has(doc.id)) {
        const existing = combined.get(doc.id)!;
        existing.categoria_score = 0.95;
      } else {
        combined.set(doc.id, {
          ...doc,
          semantic_score: 0,
          bm25_score: 0,
          categoria_score: 0.95,
          recency_score: calcularRecencia(doc.fecha_creacion),
        });
      }
    });

    // ========== RERANKING CON MÚLTIPLES FACTORES ==========
    const reranked: DocumentoRAG[] = Array.from(combined.values())
      .sort((a, b) => {
        // Weights: Semantic 60% + BM25 30% + Category 7% + Recency 3%
        const scoreA =
          a.semantic_score * 0.6 +
          a.bm25_score * 0.3 +
          a.categoria_score * 0.07 +
          a.recency_score * 0.03;

        const scoreB =
          b.semantic_score * 0.6 +
          b.bm25_score * 0.3 +
          b.categoria_score * 0.07 +
          b.recency_score * 0.03;

        return scoreB - scoreA;
      })
      .slice(0, limite)
      .map((doc) => {
        const relevancia =
          doc.semantic_score * 0.6 + doc.bm25_score * 0.3;

        return {
          id: doc.id,
          titulo: doc.titulo,
          contenido: doc.contenido,
          categoria: doc.categoria,
          fuente: doc.fuente,
          fecha_creacion: doc.fecha_creacion,
          relevancia: parseFloat(relevancia.toFixed(3)),
          confianza: calcularConfianza(doc.semantic_score),
        };
      });

    return reranked;
  } catch (error) {
    console.error("Error en búsqueda ultra:", error);
    return [];
  }
}

/**
 * Mide puntuación de recencia (0-1)
 * Documentos más nuevos puntúan más alto
 */
function calcularRecencia(fecha: Date): number {
  if (!fecha) return 0.5;
  const hoy = new Date();
  const diasDesdeCreacion = Math.floor(
    (hoy.getTime() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Decae con el tiempo: nuevo=1, 1 año atrás=0
  const score = Math.max(0, 1 - diasDesdeCreacion / 365);
  return score;
}

/**
 * Calcula nivel de confianza basado en similitud semántica
 */
function calcularConfianza(
  similarity: number
): "ALTA" | "MEDIA" | "BAJA" | "INSUFICIENTE" {
  if (similarity >= 0.85) return "ALTA";
  if (similarity >= 0.7) return "MEDIA";
  if (similarity >= 0.5) return "BAJA";
  return "INSUFICIENTE";
}

/**
 * Extrae categoría probable de la pregunta
 */
function extraerCategoria(pregunta: string): string | null {
  const palabrasClave: Record<string, string> = {
    "voto|electoral|elección|candidato": "electoral",
    "propuesta|programa|plan|proyecto": "propuestas",
    "barrio|zona|sector|comunidad": "territorial",
    "economía|dinero|presupuesto|gasto": "economía",
    "educación|escuela|colegio|universidad": "educación",
    "salud|hospital|médico|enfermería": "salud",
  };

  const preguntaBaja = pregunta.toLowerCase();

  for (const [palabras, categoria] of Object.entries(palabrasClave)) {
    const regex = new RegExp(palabras, "i");
    if (regex.test(preguntaBaja)) {
      return categoria;
    }
  }

  return null;
}
