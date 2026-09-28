-- Cupos con varias fechas posibles.
--
-- «El lider quiere el jueves o el viernes.» Es la situacion de cada dia de
-- quien lleva la agenda, y hasta ahora no habia forma de anotarla: tocaba
-- crear dos reuniones y acordarse de borrar una, o apuntarlo en la libreta y
-- que el sistema no supiera nada.
--
-- Las alternativas comparten un grupo. Al escoger una, las hermanas se
-- liberan solas: quedan canceladas con el motivo de que se eligio otra fecha,
-- no borradas, porque saber que se barajaron dos dias explica despues por que
-- el jueves estaba apartado.
ALTER TABLE "agendamientos" ADD COLUMN IF NOT EXISTS "grupo_opciones" UUID;

CREATE INDEX IF NOT EXISTS "agendamientos_grupo_opciones_idx"
  ON "agendamientos" ("grupo_opciones");
