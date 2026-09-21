-- Que se registre TODO lo que entra, no solo lo que se atiende.
--
-- La version anterior solo anotaba los mensajes aceptados, y lo rechazado
-- quedaba en el registro de la aplicacion. En un servidor propio eso basta;
-- en alojamiento compartido ese archivo no lo lee nadie, asi que en la
-- practica un mensaje descartado era indistinguible de uno que nunca llego.
--
-- `resultado` dice que paso con cada uno: recibido, aceptado, no_autorizado,
-- sin_agente. Con eso se puede ver desde el panel quien escribio y por que no
-- se le contesto, que era justo lo que se prometia al decir "queda registro".
ALTER TABLE "whatsapp_mensajes_vistos" ADD COLUMN IF NOT EXISTS "numero" VARCHAR(30);
ALTER TABLE "whatsapp_mensajes_vistos" ADD COLUMN IF NOT EXISTS "resultado" VARCHAR(20) NOT NULL DEFAULT 'recibido';
CREATE INDEX IF NOT EXISTS "whatsapp_mensajes_vistos_resultado_idx" ON "whatsapp_mensajes_vistos" ("resultado");
