const { Client } = require('pg');
require('dotenv').config();

/**
 * La cadena de conexion se toma SIEMPRE del entorno. Antes habia una
 * hardcodeada aqui, con su contrasena, en un repositorio publico.
 */
function exigirConexion() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      'Falta DATABASE_URL. Definela en el entorno antes de ejecutar este script.
' +
      'Nunca escribas la cadena de conexion en el codigo: este fichero es publico.'
    );
    process.exit(1);
  }
  return url;
}

async function setup() {
  const client = new Client({ connectionString: exigirConexion() });

  await client.connect();
  console.log('Conectado a Supabase...');

  // Habilitar pgvector
  await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
  console.log('Extensión vector habilitada');

  // Crear tabla de documentos vectorizados
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
  console.log('Tabla documentos_campana creada');

  // Crear función de búsqueda por similitud semántica
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
  console.log('Función de búsqueda semántica creada');

  await client.end();
  console.log('DONE - Todo configurado correctamente');
}

setup().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
