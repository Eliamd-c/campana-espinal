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
  "cupo",
  "confirmado",
  "ejecutado",
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

/** A dónde se puede ir desde cada estado. */
export const TRANSICIONES: Record<Estado, Estado[]> = {
  borrador: ["cupo", "cancelado"],
  // A `confirmado` solo se llega por la ruta que valida las reglas.
  cupo: ["confirmado", "cancelado", "borrador"],
  confirmado: ["ejecutado", "cancelado", "cupo"],
  // Lo que ya ocurrió no cambia: si hubo un error, se corrige el registro,
  // no el hecho.
  ejecutado: [],
  cancelado: ["cupo"],
};

export function puedeTransicionar(desde: Estado, hasta: Estado): boolean {
  return TRANSICIONES[desde]?.includes(hasta) ?? false;
}

/**
 * Estados que no se pueden borrar: dejan rastro de algo que la campaña
 * comprometió o ejecutó. Se cancelan, no se eliminan.
 */
export const NO_BORRABLES: Estado[] = ["confirmado", "ejecutado", "cancelado"];

export function sePuedeBorrar(estado: string): boolean {
  return !NO_BORRABLES.includes(estado as Estado);
}
