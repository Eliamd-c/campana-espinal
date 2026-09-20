/**
 * Catálogo de permisos del panel.
 *
 * Cada cuenta lleva la lista de lo que puede hacer. No hay roles con título:
 * al crear un usuario se marcan las casillas que esa persona necesita, y dos
 * personas del mismo equipo pueden tener acceso distinto sin inventar un rol
 * nuevo para cada caso.
 *
 * Una cuenta nueva nace **sin ningún permiso**: entra y no ve nada hasta que
 * se le concede algo. Es lo contrario del estado anterior, donde cualquier
 * cuenta con sesión veía las 5.985 cédulas del padrón.
 */

export const PERMISOS = {
  // ── Padrón ─────────────────────────────────────────────────────────────
  /** Registrar personas nuevas desde una planilla. */
  CONTACTOS_CAPTURAR: "contactos.capturar",
  /**
   * Comprobar si una cédula ya está registrada. Devuelve solo si existe y el
   * nombre, nunca la ficha: quien captura planillas evita duplicados sin que
   * su cuenta se convierta en una copia del padrón.
   */
  CONTACTOS_COMPROBAR: "contactos.comprobar",
  /** Abrir la ficha completa de una persona. */
  CONTACTOS_VER: "contactos.ver",
  /** Navegar y filtrar el padrón. */
  CONTACTOS_LISTAR: "contactos.listar",
  /** Modificar datos ya registrados. */
  CONTACTOS_EDITAR: "contactos.editar",
  /** Descargar tablas de contactos. El que más daño hace si se compromete. */
  CONTACTOS_EXPORTAR: "contactos.exportar",

  // ── Líderes ────────────────────────────────────────────────────────────
  LIDERES_VER: "lideres.ver",
  LIDERES_EDITAR: "lideres.editar",

  // ── Agenda ─────────────────────────────────────────────────────────────
  AGENDA_VER: "agenda.ver",
  AGENDA_EDITAR: "agenda.editar",

  // ── Puestos y mesas ────────────────────────────────────────────────────
  MESAS_VER: "mesas.ver",

  // ── Mensajería ─────────────────────────────────────────────────────────
  MENSAJES_VER: "mensajes.ver",
  MENSAJES_ENVIAR: "mensajes.enviar",

  // ── Asistente de análisis ──────────────────────────────────────────────
  IA_CONSULTAR: "ia.consultar",

  // ── Informes ───────────────────────────────────────────────────────────
  INFORMES_VER: "informes.ver",
  INFORMES_EXPORTAR: "informes.exportar",

  // ── Administración ─────────────────────────────────────────────────────
  /** Crear y desactivar cuentas. Reservado al desarrollador. */
  USUARIOS_GESTIONAR: "usuarios.gestionar",
  /** Consultar el registro de quién hizo qué. */
  AUDITORIA_VER: "auditoria.ver",
} as const;

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS];

/** Todos los permisos, para validar lo que llega y para la pantalla de alta. */
export const TODOS_LOS_PERMISOS: Permiso[] = Object.values(PERMISOS);

/**
 * Agrupación para la pantalla de gestión, con el texto que verá quien crea la
 * cuenta. La descripción dice qué se concede de verdad, no el nombre técnico:
 * quien marca la casilla debe entender qué está dando.
 */
export const GRUPOS_DE_PERMISOS: {
  grupo: string;
  permisos: { permiso: Permiso; etiqueta: string; advertencia?: string }[];
}[] = [
  {
    grupo: "Padrón de votantes",
    permisos: [
      { permiso: PERMISOS.CONTACTOS_CAPTURAR, etiqueta: "Registrar personas desde planilla" },
      {
        permiso: PERMISOS.CONTACTOS_COMPROBAR,
        etiqueta: "Comprobar si una cédula ya existe",
      },
      { permiso: PERMISOS.CONTACTOS_VER, etiqueta: "Ver la ficha completa de una persona" },
      {
        permiso: PERMISOS.CONTACTOS_LISTAR,
        etiqueta: "Navegar y filtrar el padrón completo",
        advertencia: "Da acceso de lectura a las 5.985 personas.",
      },
      { permiso: PERMISOS.CONTACTOS_EDITAR, etiqueta: "Modificar datos registrados" },
      {
        permiso: PERMISOS.CONTACTOS_EXPORTAR,
        etiqueta: "Descargar tablas de contactos",
        advertencia: "Permite sacar el padrón del sistema. Concédelo solo a quien lo necesite.",
      },
    ],
  },
  {
    grupo: "Líderes",
    permisos: [
      { permiso: PERMISOS.LIDERES_VER, etiqueta: "Ver líderes" },
      { permiso: PERMISOS.LIDERES_EDITAR, etiqueta: "Crear y modificar líderes" },
    ],
  },
  {
    grupo: "Agenda y eventos",
    permisos: [
      { permiso: PERMISOS.AGENDA_VER, etiqueta: "Ver la agenda" },
      { permiso: PERMISOS.AGENDA_EDITAR, etiqueta: "Crear y modificar eventos" },
    ],
  },
  {
    grupo: "Puestos de votación",
    permisos: [{ permiso: PERMISOS.MESAS_VER, etiqueta: "Ver puestos y mesas" }],
  },
  {
    grupo: "Mensajería",
    permisos: [
      { permiso: PERMISOS.MENSAJES_VER, etiqueta: "Ver campañas y plantillas" },
      {
        permiso: PERMISOS.MENSAJES_ENVIAR,
        etiqueta: "Enviar mensajes masivos",
        advertencia: "Escribe en nombre de la campaña a miles de personas.",
      },
    ],
  },
  {
    grupo: "Análisis",
    permisos: [
      { permiso: PERMISOS.IA_CONSULTAR, etiqueta: "Usar el asistente de análisis" },
      { permiso: PERMISOS.INFORMES_VER, etiqueta: "Ver informes y analítica" },
      {
        permiso: PERMISOS.INFORMES_EXPORTAR,
        etiqueta: "Descargar informes",
        advertencia: "Permite sacar datos agregados del sistema.",
      },
    ],
  },
  {
    grupo: "Administración",
    permisos: [
      {
        permiso: PERMISOS.USUARIOS_GESTIONAR,
        etiqueta: "Crear y desactivar cuentas",
        advertencia: "Quien tenga esto controla quién entra al sistema.",
      },
      { permiso: PERMISOS.AUDITORIA_VER, etiqueta: "Consultar el registro de actividad" },
    ],
  },
];

/** ¿Es un permiso del catálogo? Descarta lo que llegue inventado. */
export function esPermisoValido(valor: unknown): valor is Permiso {
  return typeof valor === "string" && (TODOS_LOS_PERMISOS as string[]).includes(valor);
}

/** Filtra una lista quedándose solo con permisos reconocidos y sin repetir. */
export function depurarPermisos(valores: unknown): Permiso[] {
  if (!Array.isArray(valores)) return [];
  return Array.from(new Set(valores.filter(esPermisoValido)));
}

/**
 * ¿Tiene esta cuenta el permiso que se le pide?
 *
 * La comprobación es deliberadamente simple y sin excepciones por rol: el
 * antiguo `role` ya no decide nada. Si una cuenta necesita algo, se le
 * concede explícitamente y queda anotado quién se lo dio.
 */
export function tienePermiso(permisos: string[] | null | undefined, requerido: Permiso): boolean {
  if (!permisos || permisos.length === 0) return false;
  return permisos.includes(requerido);
}

/** ¿Tiene al menos uno de los permisos indicados? */
export function tieneAlguno(permisos: string[] | null | undefined, requeridos: Permiso[]): boolean {
  return requeridos.some((p) => tienePermiso(permisos, p));
}
