/**
 * Guardas para el SQL que redacta el modelo de lenguaje.
 *
 * Premisa: el SQL que llega aquí lo escribe un LLM que a su vez lee contenido
 * no confiable (mensajes de WhatsApp de votantes, texto OCR de planillas).
 * Es decir, es entrada de un atacante con pasos intermedios. Se trata como tal.
 *
 * Tres capas, de menos a más fiable:
 *  1. Este validador de texto.
 *  2. La transacción READ ONLY de PostgreSQL, que impide toda escritura a
 *     nivel de motor aunque este validador falle.
 *  3. Pendiente (#2b del backlog): un rol de base de datos con GRANT SELECT
 *     solo sobre las tablas permitidas. Es la única capa que sobrevive al
 *     siguiente agujero de un análisis basado en texto, y la que convierte
 *     este archivo en una comodidad y no en la defensa.
 */

/** Tablas que el analista puede consultar. */
export const TABLAS_PERMITIDAS = new Set([
  "contactos",
  "lideres",
  "reuniones",
  "mensajes",
  "mensajes_errores",
  "campanas",
  "campana_variaciones",
  "contenido",
  "eventos",
  "asistentes_eventos",
  "checklist_plantillas",
  "enlaces_cortos",
  "clics_rastreo",
  "respuestas_rag",
  "plantillas_mensajes",
  "message_templates",
  "message_drafts",
  "auditoria",
]);

/**
 * Tablas cuyo nombre no puede aparecer en la consulta, esté donde esté.
 * Son las que convierten una fuga en un secuestro:
 *  - whatsapp_auth_state, lineas_whatsapp: credenciales de sesión de las
 *    líneas de WhatsApp de la campaña.
 *  - user, account, session, verificationtoken: sesiones y tokens.
 *  - chat_memoria: conversaciones privadas.
 * Es redundante con la allowlist a propósito: cubre las posiciones que el
 * análisis de la cláusula FROM no alcance.
 */
export const TABLAS_PROHIBIDAS = new Set([
  "whatsapp_auth_state",
  "lineas_whatsapp",
  "chat_memoria",
  "user",
  "account",
  "session",
  "verificationtoken",
]);

/** Límite de filas que se impone siempre. */
export const LIMITE_FILAS = 500;

/** Tiempo máximo de ejecución, para que una consulta no tumbe la base. */
export const TIMEOUT_MS = 5000;

export type Veredicto =
  | { ok: true; sql: string }
  | { ok: false; motivo: string };

/** Palabras sin uso legítimo en una lectura del analista. */
const PALABRAS_PROHIBIDAS = [
  "insert", "update", "delete", "drop", "alter", "truncate", "create",
  "grant", "revoke", "commit", "rollback", "copy", "vacuum", "call",
  "merge", "refresh", "listen", "notify", "set", "reset", "into",
  "dblink", "lo_import", "lo_export", "pg_read_file", "pg_ls_dir",
  "pg_sleep", "pg_terminate_backend", "pg_read_binary_file",
];

/** Palabras que cierran una cláusula FROM. */
const FIN_DE_FROM = new Set([
  "where", "group", "order", "limit", "offset", "having", "union",
  "intersect", "except", "on", "using", "join", "inner", "left", "right",
  "full", "cross", "natural", "window", "fetch", "for", "lateral",
]);

/**
 * Quita comentarios y el contenido de los literales de cadena. Lo segundo
 * importa: sin ello, un nombre legítimo como 'Barrio Do Set' dispararía las
 * palabras prohibidas y, al revés, una carga útil podría esconderse ahí.
 */
function normalizar(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\$\$[\s\S]*?\$\$/g, "''");
}

/** Todos los identificadores de la consulta, incluidos los entrecomillados. */
function identificadores(sql: string): string[] {
  const salida: string[] = [];
  const re = /"([^"]+)"|([a-zA-Z_][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    salida.push((m[1] ?? m[2]).toLowerCase());
  }
  return salida;
}

/**
 * Tablas en posición de origen de datos. Recorre cada cláusula FROM o JOIN
 * hasta la palabra que la cierra y toma el primer identificador de cada
 * elemento separado por comas: `FROM a, b AS x, c` son tres tablas, no una,
 * que es justo lo que se colaba antes.
 */
export function tablasReferenciadas(sql: string): string[] {
  const tablas: string[] = [];
  // `\s*` y no `\s+`: PostgreSQL acepta `FROM"User"` sin espacio.
  const re = /\b(from|join|update|into)\b\s*/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(sql)) !== null) {
    const resto = sql.slice(m.index + m[0].length);
    const tokenRe = /"([^"]+)"|([a-zA-Z_][\w$.]*)|([(),])/g;
    let t: RegExpExecArray | null;
    let esperandoTabla = true;
    let profundidad = 0;

    while ((t = tokenRe.exec(resto)) !== null) {
      const simbolo = t[3];
      if (simbolo === "(") { profundidad++; esperandoTabla = false; continue; }
      if (simbolo === ")") {
        if (profundidad === 0) break; // se salió de la cláusula
        profundidad--;
        continue;
      }
      if (simbolo === ",") {
        if (profundidad === 0) esperandoTabla = true; // siguiente tabla de la lista
        continue;
      }
      if (profundidad > 0) continue; // subconsulta: la cubre su propio FROM

      const bruto = (t[1] ?? t[2]).toLowerCase();
      if (!esperandoTabla) {
        if (FIN_DE_FROM.has(bruto)) break;
        continue;
      }
      if (FIN_DE_FROM.has(bruto)) break;
      if (bruto === "as" || bruto === "only") continue;
      // `public.contactos` -> interesa la última parte.
      const partes = bruto.split(".").filter(Boolean);
      tablas.push(partes[partes.length - 1]);
      esperandoTabla = false;
    }
  }
  return tablas;
}

/** Posición del LIMIT de primer nivel (fuera de todo paréntesis), si existe. */
function limiteDePrimerNivel(sql: string): { indice: number; valor: number } | null {
  let profundidad = 0;
  const re = /\(|\)|\blimit\s+(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    if (m[0] === "(") profundidad++;
    else if (m[0] === ")") profundidad--;
    else if (profundidad === 0) return { indice: m.index, valor: parseInt(m[1], 10) };
  }
  return null;
}

/**
 * Decide si una consulta redactada por el modelo puede ejecutarse.
 * Devuelve el SQL normalizado y acotado, o el motivo del veto.
 */
export function validarConsultaLectura(entrada: string): Veredicto {
  if (typeof entrada !== "string" || !entrada.trim()) {
    return { ok: false, motivo: "La consulta está vacía." };
  }

  const original = entrada.trim().replace(/;\s*$/, "");

  /**
   * El dollar-quoting con etiqueta (`$tag$ ... $tag$`) atraviesa el
   * normalizador sin que este lo entienda, y desincroniza el vaciado de los
   * literales `'...'`: con dos de ellos se puede hacer que `normalizar`
   * borre texto real de la consulta y esconda un nombre de tabla del
   * análisis. No tiene ningún uso legítimo en una lectura del analista, así
   * que se rechaza la construcción entera en vez de intentar interpretarla.
   */
  if (/\$[a-zA-Z_]*\$/.test(original)) {
    return { ok: false, motivo: "No se permite el uso de dollar-quoting." };
  }

  /**
   * Comillas simples sin cerrar: el resto de la consulta quedaría dentro de
   * un literal para PostgreSQL pero fuera de él para este validador, o al
   * revés. Si no cuadran, no se analiza.
   */
  if ((original.match(/'/g) ?? []).length % 2 !== 0) {
    return { ok: false, motivo: "Hay una comilla simple sin cerrar." };
  }

  const analisis = normalizar(original);

  // Un solo statement. Con dos, el segundo podría ser cualquier cosa.
  if (analisis.includes(";")) {
    return {
      ok: false,
      motivo: "Solo se admite una consulta por llamada; sobra un punto y coma.",
    };
  }

  // Únicamente SELECT. Se descarta WITH: una CTE puede contener
  // INSERT ... RETURNING y sigue empezando por WITH.
  if (!/^select[\s(]/i.test(analisis)) {
    return { ok: false, motivo: "Solo se permiten consultas SELECT de lectura." };
  }

  // String.raw: en un template literal normal, \b es el carácter backspace
  // y el filtro entero no coincide con nada.
  for (const p of PALABRAS_PROHIBIDAS) {
    if (new RegExp(String.raw`\b${p}\b`, "i").test(analisis)) {
      return { ok: false, motivo: `La consulta contiene '${p}', no permitido.` };
    }
  }

  // Catálogos del sistema: dan usuarios, hashes de contraseña y rutas.
  if (/\b(pg_catalog|information_schema|pg_authid|pg_shadow|pg_user|pg_roles|pg_settings|pg_stat_activity)\b/i.test(analisis)) {
    return { ok: false, motivo: "No se permite consultar catálogos del sistema." };
  }
  if (/\bpg_[a-z_]+\s*\(/i.test(analisis)) {
    return { ok: false, motivo: "No se permiten funciones internas de PostgreSQL." };
  }

  // Denylist por identificador, en cualquier posición.
  for (const id of identificadores(analisis)) {
    if (TABLAS_PROHIBIDAS.has(id)) {
      return { ok: false, motivo: `La tabla '${id}' no está disponible para consulta.` };
    }
  }

  // Allowlist en posición de origen de datos.
  const tablas = tablasReferenciadas(analisis);
  if (tablas.length === 0) {
    return { ok: false, motivo: "La consulta no referencia ninguna tabla conocida." };
  }
  for (const t of tablas) {
    if (!TABLAS_PERMITIDAS.has(t)) {
      return { ok: false, motivo: `La tabla '${t}' no está disponible para consulta.` };
    }
  }

  // Techo de filas real: un LIMIT en una subconsulta no cuenta, y uno de
  // primer nivel por encima del techo se recorta.
  const limite = limiteDePrimerNivel(original);
  let sql: string;
  if (!limite) {
    sql = `${original} LIMIT ${LIMITE_FILAS}`;
  } else if (limite.valor > LIMITE_FILAS) {
    sql = original.slice(0, limite.indice) + `LIMIT ${LIMITE_FILAS}`;
  } else {
    sql = original;
  }

  return { ok: true, sql };
}
