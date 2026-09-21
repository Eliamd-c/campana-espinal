-- Etapa 1 del enlace con WhatsApp: qué agente atiende cada línea, a quién
-- responde, y qué mensajes ya se atendieron.

-- 1. Qué agente atiende la línea.
--
-- Nulo significa que la línea está conectada pero no contesta a nadie. Es
-- como deben nacer: una línea recién vinculada no debe empezar a responder
-- por su cuenta antes de que alguien decida qué hace.
--
-- Sin restricción de valores a propósito. Hoy son 'agenda' y 'datos'; la
-- aplicación valida contra su catálogo, y añadir un tercero no debería
-- obligar a una migración.
ALTER TABLE "lineas_whatsapp" ADD COLUMN IF NOT EXISTS "agente" VARCHAR(40);

-- 2. A quién responde cada línea.
--
-- La lista es POR LÍNEA, no global: así se puede dejar a alguien usar la
-- agenda sin darle acceso a consultar el padrón. Vive en la base y no en un
-- archivo porque cambiarla no debe obligar a reiniciar: reiniciar tumba el
-- socket, y reconectar es el momento frágil de la sesión.
CREATE TABLE IF NOT EXISTS "whatsapp_autorizados" (
  "id"          SERIAL PRIMARY KEY,
  "linea_id"    INTEGER NOT NULL,
  -- En formato internacional y sin signos: 573133288298.
  "numero"      VARCHAR(20) NOT NULL,
  -- Para reconocerlo en el panel: «Eliam — desarrollo».
  "nombre"      VARCHAR(80),
  -- La cuenta del panel a la que equivale este número. El agente responde con
  -- los permisos de esa cuenta y la auditoría dice quién preguntó. Sin esto,
  -- cualquiera de la lista tendría acceso a todo.
  "usuario_id"  VARCHAR(80),
  "activo"      BOOLEAN NOT NULL DEFAULT true,
  "autorizado_por" VARCHAR(80),
  "fecha_alta"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "whatsapp_autorizados_linea_fkey"
    FOREIGN KEY ("linea_id") REFERENCES "lineas_whatsapp"("id") ON DELETE CASCADE,
  CONSTRAINT "whatsapp_autorizados_usuario_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "User"("id") ON DELETE SET NULL
);

-- El mismo número no puede estar dos veces en la misma línea. Si lo estuviera,
-- podría figurar activo e inactivo a la vez y el filtro dependería del orden
-- en que salieran las filas.
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_autorizados_linea_numero_key"
  ON "whatsapp_autorizados" ("linea_id", "numero");

CREATE INDEX IF NOT EXISTS "whatsapp_autorizados_numero_idx"
  ON "whatsapp_autorizados" ("numero");

-- 3. Mensajes ya atendidos.
--
-- Cuando la aplicación despierta, WhatsApp le vuelve a entregar los mensajes
-- que llegaron mientras dormía, incluidos algunos que ya había procesado. Sin
-- este registro, quien escribe una vez recibe tres respuestas y acaba con tres
-- borradores de la misma reunión.
CREATE TABLE IF NOT EXISTS "whatsapp_mensajes_vistos" (
  "id"         SERIAL PRIMARY KEY,
  "linea_id"   INTEGER NOT NULL,
  -- El identificador que asigna WhatsApp al mensaje.
  "mensaje_wa" VARCHAR(120) NOT NULL,
  "fecha"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "whatsapp_mensajes_vistos_linea_fkey"
    FOREIGN KEY ("linea_id") REFERENCES "lineas_whatsapp"("id") ON DELETE CASCADE
);

-- El índice único es lo que hace el trabajo: insertar es la comprobación. Dos
-- entregas del mismo mensaje no pueden colarse ni aunque lleguen a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_mensajes_vistos_key"
  ON "whatsapp_mensajes_vistos" ("linea_id", "mensaje_wa");

-- Para poder podar lo viejo: pasadas unas horas, WhatsApp ya no reentrega
-- nada y la fila solo ocupa sitio.
CREATE INDEX IF NOT EXISTS "whatsapp_mensajes_vistos_fecha_idx"
  ON "whatsapp_mensajes_vistos" ("fecha");
