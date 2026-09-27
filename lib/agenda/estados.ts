/**
 * Estados de un agendamiento y las transiciones permitidas.
 *
 * La regla que gobierna todo el módulo: **un cupo nunca puede parecer una
 * reunión confirmada**. De ahí que `confirmado` no sea un estado en el que se
 * pueda nacer ni al que se llegue por una edición cualquiera: se alcanza solo
 * por `/api/agenda/[id]/confirmar`, que comprueba las reglas de la plantilla.
 */

export const ESTADOS = [
  "borrador",
  "pospuesto",
  "cupo",
  "confirmado",
  "ejecutado",
  "rechazado",
  "cancelado",
] as const;

export type Estado = (typeof ESTADOS)[number];

/**
 * Estados con los que puede nacer un agendamiento.
 *
 * Deliberadamente no incluye `confirmado`: antes el estado inicial se tomaba
 * del cuerpo de la petición, así que enviar `"confirmado"` saltaba el motor de
 * reglas por completo.
 */
export const ESTADOS_INICIALES = ["borrador", "cupo"] as const;

/** Lo que está esperando una decisión: la bandeja. */
export const ESTADOS_PENDIENTES: Estado[] = ["borrador", "pospuesto"];

/**
 * Dos estados para decidir sobre lo que llega.
 *
 * `pospuesto` es aparcar sin perder: la solicitud vuelve sola a la bandeja el
 * día que se dijo. Antes, para quitar de en medio algo que se vería más
 * adelante, había que cancelarlo — y cancelado significa otra cosa.
 *
 * `rechazado` y `cancelado` no son lo mismo, y confundirlos borra información:
 * cancelada es una reunión que existía y se cayó; rechazada es una petición
 * que nunca llegó a ser reunión. La primera hay que explicarla a quien
 * contaba con ella; la segunda, a quien la pidió.
 */

/** A dónde se puede ir desde cada estado. */
export const TRANSICIONES: Record<Estado, Estado[]> = {
  borrador: ["cupo", "pospuesto", "rechazado", "cancelado"],
  pospuesto: ["borrador", "cupo", "rechazado", "cancelado"],
  // A `confirmado` solo se llega por la ruta que valida las reglas.
  cupo: ["confirmado", "pospuesto", "cancelado", "borrador"],
  confirmado: ["ejecutado", "cancelado", "cupo"],
  // Lo que ya ocurrió no cambia: si hubo un error, se corrige el registro,
  // no el hecho.
  ejecutado: [],
  // Se puede reconsiderar lo rechazado: alguien insiste y a veces tiene razón.
  rechazado: ["borrador"],
  cancelado: ["cupo"],
};

export function puedeTransicionar(desde: Estado, hasta: Estado): boolean {
  return TRANSICIONES[desde]?.includes(hasta) ?? false;
}

/**
 * Estados que no se pueden borrar: dejan rastro de algo que la campaña
 * comprometió o ejecutó. Se cancelan, no se eliminan.
 */
export const NO_BORRABLES: Estado[] = [
  "confirmado",
  "ejecutado",
  "cancelado",
  /**
   * Rechazar es una decisión, y las decisiones se consultan después. Borrar
   * la fila deja a quien preguntó «¿qué pasó con lo que pedí?» sin respuesta.
   */
  "rechazado",
];

export function sePuedeBorrar(estado: string): boolean {
  return !NO_BORRABLES.includes(estado as Estado);
}
