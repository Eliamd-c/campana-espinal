-- Hallazgos #3 y #4 del backlog de seguridad.
--
-- Da credenciales reales a la tabla de usuarios para retirar el par
-- admin/admin123 que estaba escrito en lib/auth.ts.
--
-- Aplicar una sola vez contra la base de la campana, p.ej. desde el editor
-- SQL de Supabase. Es aditivo: no toca datos existentes.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "username"      TEXT,
  ADD COLUMN IF NOT EXISTS "password_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "activo"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "ultimo_acceso" TIMESTAMP(3);

-- El nombre de usuario identifica a la persona al entrar: debe ser unico.
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
