-- Hallazgo #16 del backlog de seguridad.
--
-- Supabase publica el esquema `public` a través de una API REST, y esa API la
-- abre la clave `anon`, que por diseño es pública: viaja al navegador de
-- cualquiera que entre a la web. Sin Row Level Security, esa clave daba
-- lectura Y escritura sobre las 25 tablas. Comprobado contra el proyecto:
-- devolvía el padrón con cédulas y teléfonos, las claves de sesión de las
-- líneas de WhatsApp y la tabla de usuarios con sus hashes.
--
-- Es decir: no hacía falta ni pasar por el login.
--
-- La aplicación no se ve afectada. Los datos los lee con Prisma, conectada
-- como `postgres`, que es dueña de las tablas y no está sujeta a RLS. La
-- clave pública solo se usa para subir imágenes y vídeos a Storage, que es
-- otro subsistema y sigue funcionando igual.

-- ── 1. Quitar a los roles públicos todo lo que tengan concedido ──────────
-- Es lo que cierra la puerta de verdad: aunque algún día se añadiera una
-- política de RLS mal escrita, sin privilegios no hay acceso.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

-- Y que las tablas que se creen en el futuro nazcan igual de cerradas.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- ── 2. Activar Row Level Security en todas las tablas ────────────────────
-- Segunda capa, y además es lo que espera el linter de Supabase. Sin
-- políticas, ningún rol sujeto a RLS lee nada.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$$;

-- ── 3. Dejar trabajar al rol del asistente de IA ─────────────────────────
-- `analista_ia` (hallazgo #2b) sí está sujeto a RLS, así que sin una política
-- se quedaría sin poder leer y el asistente dejaría de responder. Se le
-- permite SELECT exactamente sobre las mismas tablas que ya tenía concedidas,
-- ni una más.
DO $$
DECLARE
  t text;
  permitidas text[] := ARRAY[
    'contactos','lideres','reuniones','mensajes','mensajes_errores',
    'campanas','campana_variaciones','contenido','eventos',
    'asistentes_eventos','checklist_plantillas','enlaces_cortos',
    'clics_rastreo','respuestas_rag','plantillas_mensajes',
    'message_templates','message_drafts','auditoria'
  ];
BEGIN
  FOREACH t IN ARRAY permitidas LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        'analista_ia_lectura_' || t, t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO analista_ia USING (true)',
        'analista_ia_lectura_' || t, t
      );
    END IF;
  END LOOP;
END
$$;

-- ── Comprobación ─────────────────────────────────────────────────────────
-- Debe devolver 0 filas: ninguna tabla con privilegios para los roles
-- públicos.
SELECT table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
