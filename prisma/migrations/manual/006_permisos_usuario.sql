-- Permisos por cuenta.
--
-- Hasta ahora el acceso lo decidia `role` con dos valores, y en la practica
-- cualquier cuenta con sesion veia las 5.985 personas del padron. A partir de
-- aqui cada cuenta lleva la lista de lo que puede hacer, y una cuenta nueva
-- nace sin nada.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "permisos" TEXT[] NOT NULL DEFAULT '{}';

-- La cuenta de administracion existente conserva acceso completo, para que
-- nada deje de funcionar de golpe. Las cuentas que se creen a partir de ahora
-- empiezan vacias.
UPDATE "User"
SET "permisos" = ARRAY[
  'contactos.capturar','contactos.comprobar','contactos.ver','contactos.listar',
  'contactos.editar','contactos.exportar',
  'lideres.ver','lideres.editar',
  'agenda.ver','agenda.editar',
  'mesas.ver',
  'mensajes.ver','mensajes.enviar',
  'ia.consultar',
  'informes.ver','informes.exportar',
  'usuarios.gestionar','auditoria.ver'
]
WHERE role = 'admin' AND cardinality("permisos") = 0;

SELECT username, role, cardinality(permisos) AS permisos_concedidos FROM "User" ORDER BY username;
