-- 1. Crear tablas

CREATE TABLE "plantillas_agenda" (
  "id" UUID NOT NULL,
  "nombre" VARCHAR(120) NOT NULL,
  "descripcion" TEXT,
  "icono" VARCHAR(40),
  "color" VARCHAR(20),
  "campos" JSONB NOT NULL,
  "recursos_sugeridos" JSONB NOT NULL,
  "requiere_aprobacion" BOOLEAN NOT NULL DEFAULT false,
  "duracion_default_min" INTEGER,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "creada_por" VARCHAR(80) NOT NULL,
  "fecha_creada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "veces_usada" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "plantillas_agenda_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agendamientos" (
  "id" UUID NOT NULL,
  "plantilla_id" UUID NOT NULL,
  "reglas_congeladas" JSONB NOT NULL,
  "titulo" VARCHAR(200) NOT NULL,
  "fecha_inicio" TIMESTAMP(3) NOT NULL,
  "fecha_fin" TIMESTAMP(3),
  "barrio" VARCHAR(80),
  "direccion" VARCHAR(200),
  "datos" JSONB NOT NULL,
  "estado" VARCHAR(20) NOT NULL,
  "lider_id" INTEGER,
  "responsable" VARCHAR(80),
  "asistentes_esperados" INTEGER,
  "asistentes_reales" INTEGER,
  "presupuesto_estimado" DOUBLE PRECISION,
  "presupuesto_real" DOUBLE PRECISION,
  "notas" TEXT,
  "texto_original" TEXT,
  "creado_por" VARCHAR(80) NOT NULL,
  "confirmado_por" VARCHAR(80),
  "fecha_confirmado" TIMESTAMP(3),
  "fecha_creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fecha_actualizado" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agendamientos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campos_por_confirmar" (
  "id" UUID NOT NULL,
  "agendamiento_id" UUID NOT NULL,
  "campo" VARCHAR(60) NOT NULL,
  "marcado_por" VARCHAR(80) NOT NULL,
  "fecha_marcado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resuelto" BOOLEAN NOT NULL DEFAULT false,
  "fecha_resuelto" TIMESTAMP(3),
  CONSTRAINT "campos_por_confirmar_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recursos_solicitados" (
  "id" UUID NOT NULL,
  "agendamiento_id" UUID NOT NULL,
  "item" VARCHAR(120) NOT NULL,
  "cantidad_solicitada" INTEGER,
  "cantidad_conseguida" INTEGER,
  "estado" VARCHAR(20) NOT NULL,
  "responsable" VARCHAR(80),
  "notas" TEXT,
  "orden" INTEGER NOT NULL,
  CONSTRAINT "recursos_solicitados_pkey" PRIMARY KEY ("id")
);

-- Indices y FKs
ALTER TABLE "agendamientos" ADD CONSTRAINT "agendamientos_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantillas_agenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campos_por_confirmar" ADD CONSTRAINT "campos_por_confirmar_agendamiento_id_fkey" FOREIGN KEY ("agendamiento_id") REFERENCES "agendamientos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recursos_solicitados" ADD CONSTRAINT "recursos_solicitados_agendamiento_id_fkey" FOREIGN KEY ("agendamiento_id") REFERENCES "agendamientos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "campos_por_confirmar_agendamiento_id_campo_key" ON "campos_por_confirmar"("agendamiento_id", "campo");
CREATE INDEX "recursos_solicitados_agendamiento_id_idx" ON "recursos_solicitados"("agendamiento_id");

-- 2. Sembrar plantillas (migracion conceptual)
-- NOTA: Insertaremos plantillas basicas y moveremos los eventos/reuniones
-- Los IDs seran uuid v4, podemos usar gen_random_uuid() en Postgres.

-- Insertar plantilla 'Mitin'
INSERT INTO "plantillas_agenda" (id, nombre, descripcion, icono, color, campos, recursos_sugeridos, creada_por, fecha_creada, activa)
VALUES (
  gen_random_uuid(), 'Mitin', 'Reunión masiva o mitin', 'megaphone', '#ff0000', 
  '[{"clave": "lugar", "etiqueta": "Lugar", "tipo": "texto_corto", "requerido_para_confirmar": true, "orden": 1}]',
  '[]', 'sistema', CURRENT_TIMESTAMP, true
);

-- Insertar plantilla 'Reunion'
INSERT INTO "plantillas_agenda" (id, nombre, descripcion, icono, color, campos, recursos_sugeridos, creada_por, fecha_creada, activa)
VALUES (
  gen_random_uuid(), 'Reunión', 'Reunión general', 'users', '#0000ff', 
  '[{"clave": "lugar", "etiqueta": "Lugar", "tipo": "texto_corto", "requerido_para_confirmar": true, "orden": 1}]',
  '[]', 'sistema', CURRENT_TIMESTAMP, true
);

-- Migracion de eventos
-- Como el sistema no esta en produccion con datos (segun el plan), esta query 
-- insertaria con select. Pero como los eventos no tienen uuid de plantilla facil de enlazar
-- lo hacemos asignando la plantilla 'Mitin' a eventos de tipo 'mitin'
-- No hay datos, lo hacemos seguro.

INSERT INTO "agendamientos" (
  id, plantilla_id, reglas_congeladas, titulo, fecha_inicio, fecha_fin, 
  lider_id, asistentes_esperados, asistentes_reales, 
  presupuesto_estimado, presupuesto_real, notas, creado_por, 
  fecha_creado, fecha_actualizado, estado, datos
)
SELECT 
  gen_random_uuid(), 
  (SELECT id FROM "plantillas_agenda" LIMIT 1), 
  '[]'::jsonb,
  e.titulo, e.fecha_inicio, e.fecha_fin,
  e.lider_id, e.asistentes_esperados, e.asistentes_reales,
  e.presupuesto_estimado, e.presupuesto_real, e.notas, e.creado_por,
  e.fecha_creado, e.fecha_actualizado,
  CASE e.estado WHEN 'aprobado' THEN 'confirmado' WHEN 'en_ejecucion' THEN 'confirmado' WHEN 'finalizado' THEN 'ejecutado' ELSE e.estado END,
  jsonb_build_object('lugar', e.lugar)
FROM "eventos" e;

-- Migracion de reuniones
INSERT INTO "agendamientos" (
  id, plantilla_id, reglas_congeladas, titulo, fecha_inicio, fecha_fin,
  creado_por, fecha_creado, fecha_actualizado, estado, datos
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM "plantillas_agenda" WHERE nombre = 'Reunión' LIMIT 1),
  '[]'::jsonb,
  r.titulo, r.fecha, r.fecha,
  r.usuario_id, r.fecha_creacion, r.fecha_creacion, 'ejecutado',
  jsonb_build_object('lugar', r.lugar)
FROM "reuniones" r;

