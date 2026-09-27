-- Decidir sobre una solicitud, cancelar con motivo y reprogramar sin editar.
--
-- El agente de WhatsApp crea borradores: peticiones que alguien tiene que
-- decidir. Hasta ahora un borrador solo podia ir a `cupo` o a `cancelado`, y
-- faltaban las tres decisiones que mas se dan en campana: «eso ya lo pidio el
-- lider de al lado», «lo vemos despues de la semana de cierre» y «no va».
--
-- Y faltaba separar dos cosas que no son lo mismo: cancelada es algo que
-- existia y se cayo; rechazada es algo que nunca llego a existir.

-- 1. Por que y quien cancelo. Se tenia `confirmado_por` y `fecha_confirmado`,
--    pero nada al otro lado: por que se cayo una reunion es justo lo que se
--    pierde y luego nadie recuerda.
ALTER TABLE "agendamientos" ADD COLUMN IF NOT EXISTS "motivo_cancelacion" TEXT;
ALTER TABLE "agendamientos" ADD COLUMN IF NOT EXISTS "cancelado_por" VARCHAR(80);
ALTER TABLE "agendamientos" ADD COLUMN IF NOT EXISTS "fecha_cancelado" TIMESTAMP(3);

-- 2. Aparcar sin perder. Una solicitud pospuesta no esta muerta: vuelve sola
--    a la bandeja el dia que se dijo. Cancelarla para quitarla de en medio era
--    la unica salida y significaba otra cosa.
ALTER TABLE "agendamientos" ADD COLUMN IF NOT EXISTS "pospuesto_hasta" TIMESTAMP(3);

-- 3. Duplicada: no se borra, se enlaza. Que dos lideres hayan pedido lo mismo
--    es informacion, no ruido: dice que ese barrio insiste.
ALTER TABLE "agendamientos" ADD COLUMN IF NOT EXISTS "duplicado_de" UUID;

-- 4. Reprogramar creando y enlazando, no editando. Asi queda el rastro de que
--    se movio y desde cuando, y puede hacerlo el agente de WhatsApp sin
--    riesgo: no borra nada, anade.
ALTER TABLE "agendamientos" ADD COLUMN IF NOT EXISTS "reprogramado_de" UUID;
ALTER TABLE "agendamientos" ADD COLUMN IF NOT EXISTS "reprogramado_por" VARCHAR(80);

ALTER TABLE "agendamientos"
  DROP CONSTRAINT IF EXISTS "agendamientos_duplicado_de_fkey";
ALTER TABLE "agendamientos"
  ADD CONSTRAINT "agendamientos_duplicado_de_fkey"
  FOREIGN KEY ("duplicado_de") REFERENCES "agendamientos"("id") ON DELETE SET NULL;

ALTER TABLE "agendamientos"
  DROP CONSTRAINT IF EXISTS "agendamientos_reprogramado_de_fkey";
ALTER TABLE "agendamientos"
  ADD CONSTRAINT "agendamientos_reprogramado_de_fkey"
  FOREIGN KEY ("reprogramado_de") REFERENCES "agendamientos"("id") ON DELETE SET NULL;

-- La bandeja pregunta siempre por lo mismo: que esta pendiente de decidir y
-- que pospuesto ya vencio.
CREATE INDEX IF NOT EXISTS "agendamientos_estado_idx" ON "agendamientos" ("estado");
CREATE INDEX IF NOT EXISTS "agendamientos_pospuesto_hasta_idx" ON "agendamientos" ("pospuesto_hasta");
