import { describe, test, expect } from "vitest";
import { validarConsultaLectura } from "../../lib/sql-guard";

/**
 * El SQL que valida este módulo lo redacta un LLM que lee contenido no
 * confiable. Cada caso de abajo es un vector real; si alguno deja de fallar,
 * hay una vía abierta a la base de datos de votantes.
 */
describe("sql-guard — consultas que deben bloquearse", () => {
  const ataques: [string, string][] = [
    ["DELETE directo", "DELETE FROM contactos"],
    ["CTE con DELETE encubierto", "WITH d AS (DELETE FROM contactos RETURNING *) SELECT * FROM d"],
    ["statement encadenado", "SELECT 1 FROM contactos; DROP TABLE contactos"],
    ["DML escondido tras comentario", "SELECT * FROM contactos --\n; UPDATE contactos SET intencion_voto='SI'"],
    ["credenciales de sesión de WhatsApp", "SELECT * FROM whatsapp_auth_state"],
    ["tokens de NextAuth", 'SELECT * FROM "Account"'],
    ["hashes de roles de Postgres", "SELECT rolname, rolpassword FROM pg_authid"],
    ["catálogo del sistema cualificado", "SELECT * FROM pg_catalog.pg_shadow"],
    ["tabla prohibida con esquema", "SELECT * FROM public.lineas_whatsapp"],
    ["lectura de ficheros del servidor", "SELECT pg_read_file('/etc/passwd')"],
    ["denegación de servicio", "SELECT pg_sleep(600) FROM contactos"],
    ["SELECT INTO (escritura)", "SELECT * INTO copia FROM contactos"],
    ["intento de anular READ ONLY", "SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE"],
    // Evasiones encontradas por el supervisor en la primera version del guard.
    ["join por coma a tabla prohibida", "SELECT a.* FROM contactos c, whatsapp_auth_state a"],
    ["join por coma a tabla de usuarios", 'SELECT u.* FROM contactos c, "User" u'],
    ["identificador pegado a la comilla", 'SELECT nombre, (SELECT email FROM"User" LIMIT 1) FROM contactos'],
    ["UNION contra tabla de usuarios", 'SELECT nombre FROM contactos UNION ALL SELECT email FROM"User"'],
    ["LATERAL a tabla prohibida", 'SELECT * FROM contactos, LATERAL (SELECT * FROM"Account") z'],
    ["funcion peligrosa por palabra prohibida", "SELECT dblink('x','y') FROM contactos"],
    ["tercera tabla de la lista", "SELECT * FROM contactos a, lideres b, chat_memoria c"],
    // Dollar-quoting: desincroniza el vaciado de literales del normalizador.
    ["dollar-quoting con etiqueta", "SELECT $q$x$q$ FROM contactos"],
    ["dollar-quoting desincronizando literales", "SELECT $q$'$q$ AS a, $q$'$q$ AS b FROM contactos c, whatsapp_auth_state w"],
    ["comilla simple sin cerrar", "SELECT 'abc FROM contactos, whatsapp_auth_state w"],
  ];

  test.each(ataques)("bloquea: %s", (_nombre, consulta) => {
    expect(validarConsultaLectura(consulta).ok).toBe(false);
  });
});

describe("sql-guard — consultas analíticas legítimas", () => {
  test("permite agregaciones sobre contactos", () => {
    const r = validarConsultaLectura(
      "SELECT barrio, COUNT(*) FROM contactos GROUP BY barrio ORDER BY 2 DESC"
    );
    expect(r.ok).toBe(true);
  });

  test("permite joins entre tablas de campaña", () => {
    const r = validarConsultaLectura(
      "SELECT l.nombre, COUNT(c.cedula) FROM lideres l JOIN contactos c ON c.lider_id = l.id GROUP BY l.nombre"
    );
    expect(r.ok).toBe(true);
  });

  test("impone un LIMIT cuando la consulta no lo trae", () => {
    const r = validarConsultaLectura("SELECT nombre FROM contactos");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sql).toMatch(/LIMIT 500$/);
  });

  test("respeta el LIMIT que ya venga en la consulta", () => {
    const r = validarConsultaLectura("SELECT nombre FROM contactos LIMIT 10");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sql).toMatch(/LIMIT 10$/);
  });

  test("recorta un LIMIT por encima del techo", () => {
    const r = validarConsultaLectura("SELECT nombre FROM contactos LIMIT 999999");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sql).toMatch(/LIMIT 500$/);
  });

  test("un LIMIT en subconsulta no cuenta como techo", () => {
    const r = validarConsultaLectura(
      "SELECT * FROM (SELECT nombre FROM contactos LIMIT 10) q"
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sql).toMatch(/LIMIT 500$/);
  });

  test("admite joins por coma entre tablas permitidas", () => {
    const r = validarConsultaLectura(
      "SELECT c.nombre, l.nombre FROM contactos c, lideres l WHERE c.lider_id = l.id"
    );
    expect(r.ok).toBe(true);
  });

  test("no confunde un texto con palabras reservadas", () => {
    const r = validarConsultaLectura(
      "SELECT nombre FROM contactos WHERE barrio = 'Barrio Do Set Insert'"
    );
    expect(r.ok).toBe(true);
  });
});
