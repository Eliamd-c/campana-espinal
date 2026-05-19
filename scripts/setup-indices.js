const { Client } = require('pg');
require('dotenv').config();

async function setup() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Saldefrutas+2@db.oizjzperhtadylqwdqve.supabase.co:5432/postgres';
  console.log('Conectando a la base de datos...');
  
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Conexión establecida.');

  // 1. Asegurar pgvector
  console.log('Habilitando extensión vector (pgvector)...');
  await client.query('CREATE EXTENSION IF NOT EXISTS vector;');

  // 2. Crear tabla de documentos si no existe
  console.log('Creando tabla documentos_campana si no existe...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS documentos_campana (
      id BIGSERIAL PRIMARY KEY,
      titulo TEXT NOT NULL,
      categoria TEXT DEFAULT 'general',
      contenido TEXT NOT NULL,
      embedding vector(768),
      metadata JSONB DEFAULT '{}',
      fecha_creado TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // 3. Crear función de búsqueda por similitud semántica si no existe
  console.log('Creando/reemplazando función buscar_documentos_similares...');
  await client.query(`
    CREATE OR REPLACE FUNCTION buscar_documentos_similares(
      query_embedding vector(768),
      match_threshold float DEFAULT 0.5,
      match_count int DEFAULT 5
    )
    RETURNS TABLE (
      id bigint,
      titulo text,
      categoria text,
      contenido text,
      similarity float
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN QUERY
      SELECT
        dc.id,
        dc.titulo,
        dc.categoria,
        dc.contenido,
        1 - (dc.embedding <=> query_embedding) AS similarity
      FROM documentos_campana dc
      WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
      ORDER BY dc.embedding <=> query_embedding
      LIMIT match_count;
    END;
    $$;
  `);

  // 4. Crear índice vectorial HNSW para documentos
  console.log('Creando índice HNSW para documentos semánticos...');
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_documentos_embedding_hnsw 
    ON documentos_campana 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
  `);
  console.log('Índice HNSW creado con éxito.');

  // 5. Crear índices GIN para búsqueda rápida (Full-Text Search) de contactos
  console.log('Creando índices GIN para búsqueda rápida en contactos...');
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contactos_nombre_gin 
    ON contactos 
    USING gin(to_tsvector('spanish', COALESCE(nombre, '')));
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contactos_barrio_gin 
    ON contactos 
    USING gin(to_tsvector('spanish', COALESCE(barrio, '')));
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contactos_problematica_gin 
    ON contactos 
    USING gin(to_tsvector('spanish', COALESCE(problematica, '')));
  `);
  
  console.log('Índices GIN creados con éxito.');

  await client.end();
  console.log('DONE - Todo configurado e indexado correctamente en la base de datos.');
}

setup().catch(e => {
  console.error('ERROR EN CONFIGURACIÓN DE ÍNDICES:', e);
  process.exit(1);
});
