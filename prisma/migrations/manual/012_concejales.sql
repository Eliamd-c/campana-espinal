-- Pirámide de atribución: concejal → líder → reunión → votante.
--
-- Hasta ahora el sistema solo sabía de líderes y reuniones, pero no de a qué
-- candidato al concejo le trabaja cada líder. En la política local el alcalde
-- va en coalición con varios concejales, y cada concejal tiene sus propios
-- líderes (5–10) que organizan reuniones y llevan gente. Todo ese trabajo sube
-- hacia el alcalde, pero hay que poder acreditárselo también a cada concejal
-- para después contrastar datos.
--
-- Los concejales y los líderes NO son usuarios del sistema: son datos. Quien
-- usa la plataforma es el equipo del alcalde, que digitaliza las planillas de
-- papel. Por eso esto son tablas y columnas, no cuentas.
--
-- Todo es aditivo y opcional (nullable): no rompe nada de lo que ya existe ni
-- obliga a rellenar lo viejo. Idempotente con IF NOT EXISTS.

-- 1. El catálogo de candidatos al concejo de la coalición.
CREATE TABLE IF NOT EXISTS "concejales" (
  "id"              SERIAL PRIMARY KEY,
  "nombre"          VARCHAR(120),
  "partido"         VARCHAR(80),   -- ej. Cambio Radical
  "numero_tarjeton" VARCHAR(20),   -- ej. CR6
  "estado"          VARCHAR(10) DEFAULT 'activo',
  "fecha_registro"  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "concejales_estado_idx" ON "concejales" ("estado");

-- 2. A qué concejal pertenece cada líder (pirámide estricta: uno solo).
--    Vacío = líder del alcalde directamente.
ALTER TABLE "lideres" ADD COLUMN IF NOT EXISTS "concejal_id" INTEGER;

DO $$ BEGIN
  ALTER TABLE "lideres"
    ADD CONSTRAINT "lideres_concejal_id_fkey"
    FOREIGN KEY ("concejal_id") REFERENCES "concejales" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "lideres_concejal_id_idx" ON "lideres" ("concejal_id");

-- 3. La reunión guarda su barrio y una COPIA del concejal (congelada).
--    Se copia del líder al digitalizar; si el líder cambia de concejal luego,
--    la reunión vieja conserva a quién se le acreditó. Vacío = del alcalde.
ALTER TABLE "reuniones" ADD COLUMN IF NOT EXISTS "barrio" VARCHAR(80);
ALTER TABLE "reuniones" ADD COLUMN IF NOT EXISTS "concejal_id" INTEGER;

DO $$ BEGIN
  ALTER TABLE "reuniones"
    ADD CONSTRAINT "reuniones_concejal_id_fkey"
    FOREIGN KEY ("concejal_id") REFERENCES "concejales" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "reuniones_concejal_id_idx" ON "reuniones" ("concejal_id");

-- 4. Cada contacto queda ligado a la planilla (reunión) de la que salió.
--    De aquí cuelga la atribución sin pasar por el estado actual del líder, y
--    permite detectar a la misma cédula apareciendo en varias reuniones.
ALTER TABLE "contactos" ADD COLUMN IF NOT EXISTS "reunion_id" INTEGER;

DO $$ BEGIN
  ALTER TABLE "contactos"
    ADD CONSTRAINT "contactos_reunion_id_fkey"
    FOREIGN KEY ("reunion_id") REFERENCES "reuniones" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "contactos_reunion_id_idx" ON "contactos" ("reunion_id");
