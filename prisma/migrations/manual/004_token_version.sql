-- Hallazgo #22.
--
-- Permite revocar una sesion en el acto. Hasta ahora, desactivar a un usuario
-- no le echaba del panel: su token seguia siendo valido hasta ocho horas
-- despues, con acceso completo a las cedulas de los votantes. Tampoco lo
-- hacia cambiar la contrasena, asi que robar una sesion era irreversible.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;
