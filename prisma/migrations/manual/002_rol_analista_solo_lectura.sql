-- Hallazgo #2b del backlog de seguridad.
--
-- Crea el rol con el que el asistente de IA consulta la base. La herramienta
-- `ejecutar_consulta_sql` deja que un modelo de lenguaje redacte SQL, y ese
-- modelo lee contenido no confiable (mensajes de votantes, texto OCR). Hoy lo
-- contienen `lib/sql-guard.ts` y una transaccion READ ONLY, pero ambas son
-- defensas de aplicacion: el dia que el validador tenga un agujero -- y ya ha
-- tenido cuatro -- lo unico que queda en pie son los permisos del motor.
--
-- Este rol no puede escribir NADA, ni leer las tablas que convierten una fuga
-- en un secuestro: credenciales de las lineas de WhatsApp, sesiones, tokens y
-- conversaciones privadas.
--
-- COMO APLICARLO
--   1. Sustituye <PON_AQUI_UNA_CLAVE_ALEATORIA> por una clave generada con
--      `openssl rand -base64 24`. No reutilices ninguna existente.
--   2. Ejecutalo en el editor SQL de Supabase, sobre el proyecto de campana.
--   3. Anade al entorno (local y hosting):
--        DATABASE_URL_ANALISTA="postgresql://analista_ia.<REF_DEL_PROYECTO>:<CLAVE>@<HOST_DEL_POOLER>:5432/postgres"
--      Copia host y puerto de tu DATABASE_URL actual; lo unico que cambia es
--      el usuario y la clave.
--   4. Reinicia la aplicacion y comprueba en el chat del analista que una
--      consulta normal sigue funcionando.

-- ── El rol ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analista_ia') THEN
    CREATE ROLE analista_ia LOGIN PASSWORD '<PON_AQUI_UNA_CLAVE_ALEATORIA>';
  END IF;
END
$$;

-- Nada heredado por defecto: se concede solo lo que se nombra abajo.
REVOKE ALL ON SCHEMA public FROM analista_ia;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM analista_ia;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM analista_ia;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM analista_ia;

GRANT CONNECT ON DATABASE postgres TO analista_ia;
GRANT USAGE ON SCHEMA public TO analista_ia;

-- ── Lo unico que puede leer ───────────────────────────────────────────────
-- Debe coincidir con TABLAS_PERMITIDAS de lib/sql-guard.ts.
GRANT SELECT ON TABLE
  contactos,
  lideres,
  reuniones,
  mensajes,
  mensajes_errores,
  campanas,
  campana_variaciones,
  contenido,
  eventos,
  asistentes_eventos,
  checklist_plantillas,
  enlaces_cortos,
  clics_rastreo,
  respuestas_rag,
  plantillas_mensajes,
  message_templates,
  message_drafts,
  auditoria
TO analista_ia;

-- Las tablas nuevas NO se conceden solas: una tabla futura nace invisible
-- para este rol, que es el lado correcto en el que equivocarse.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM analista_ia;

-- ── Comprobacion ──────────────────────────────────────────────────────────
-- Debe devolver exactamente las 18 tablas de arriba, y ninguna de estas:
-- whatsapp_auth_state, lineas_whatsapp, chat_memoria, "User", "Account", "Session".
SELECT table_name
FROM information_schema.table_privileges
WHERE grantee = 'analista_ia' AND privilege_type = 'SELECT'
ORDER BY table_name;
