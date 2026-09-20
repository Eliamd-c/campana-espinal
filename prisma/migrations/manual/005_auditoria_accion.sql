-- La columna `accion` era VARCHAR(10), asi que no cabian los nombres de las
-- acciones que de verdad interesa auditar ('consulta_masiva', 'exportacion').
-- El registro fallaba, y como la auditoria nunca debe interrumpir la peticion,
-- fallaba en silencio: se creia estar auditando y no se auditaba nada.

ALTER TABLE auditoria ALTER COLUMN accion TYPE VARCHAR(40);
