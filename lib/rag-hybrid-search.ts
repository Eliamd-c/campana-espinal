import prisma from "./db";
import { generarEmbeddingConCache } from "./embedding-cache";
import { traceBDOperation } from "./tracing-helpers";

/**
 * Búsqueda híbrida: combina semantic + keyword search (RRF - Reciprocal Rank Fusion)
 * Mejor recall y precisión que usar solo uno.
 */
export async function buscarDocumentosHibrido(
  pregunta: string,
  limite: number = 5
) {
  try {
    // 1. Semantic search
    const embedding = await generarEmbeddingConCache(pregunta);
    const embeddingStr = `[${embedding.join(",")}]`;

    const semanticos = await traceBDOperation("RAG_Semantic_Search", () =>
      prisma.$queryRawUnsafe<any[]>(
        `SELECT 
           id, titulo, contenido, categoria,
           (1 - (embedding <=> $1::vector)) as similarity
         FROM documentos_campana
         WHERE (1 - (embedding <=> $1::vector)) > $2
         ORDER BY similarity DESC
         LIMIT $3`,
        embeddingStr,
        0.3,
        limite
      )
    );

    // 2. Keyword search
    const keywords = pregunta
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .join(" & ");

    const keywords_search = await traceBDOperation("RAG_Keyword_Search", () =>
      prisma.$queryRawUnsafe<any[]>(
        `SELECT 
           id, titulo, contenido, categoria,
           ts_rank(to_tsvector('spanish', contenido), plainto_tsquery('spanish', $1)) as rank
         FROM documentos_campana
         WHERE to_tsvector('spanish', contenido) @@ plainto_tsquery('spanish', $1)
         ORDER BY rank DESC
         LIMIT $2`,
        keywords || pregunta,
        limite
      )
    );

    // 3. Combinar y deduplicar
    const combined = new Map<number, any>();

    semanticos.forEach((doc, idx) => {
      combined.set(doc.id, {
        ...doc,
        semantic_score: doc.similarity,
        keyword_score: 0,
        rank: idx,
      });
    });

    keywords_search.forEach((doc, idx) => {
      if (combined.has(doc.id)) {
        combined.get(doc.id)!.keyword_score = doc.rank;
        combined.get(doc.id)!.rank = Math.min(
          combined.get(doc.id)!.rank,
          idx
        );
      } else {
        combined.set(doc.id, {
          ...doc,
          semantic_score: 0,
          keyword_score: doc.rank,
          rank: idx + 100,
        });
      }
    });

    // 4. Reranquear por score combinado
    const reranked = Array.from(combined.values())
      .sort((a, b) => {
        const scoreA = a.semantic_score * 0.6 + (a.keyword_score || 0) * 0.4;
        const scoreB = b.semantic_score * 0.6 + (b.keyword_score || 0) * 0.4;
        return scoreB - scoreA;
      })
      .slice(0, limite)
      .map((doc) => ({
        id: doc.id,
        titulo: doc.titulo,
        contenido: doc.contenido.substring(0, 500),
        categoria: doc.categoria,
        relevancia: (doc.semantic_score * 0.6 + doc.keyword_score * 0.4).toFixed(2),
      }));

    return reranked;
  } catch (error) {
    console.error("Error en búsqueda híbrida:", error);
    return [];
  }
}
