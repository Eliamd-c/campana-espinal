/**
 * Los recursos de una reunión: sillas, sonido, tarima, refrigerios, animador.
 *
 * Hasta ahora se anotaban al crear la reunión y ahí se quedaban, como una
 * lista de la compra que nadie vuelve a mirar. Pero eso es justo la mitad del
 * trabajo de quien organiza: no basta con saber que hacen falta 200 sillas,
 * hay que saber **quién las consigue** y **si ya están**.
 *
 * De ahí que cada línea tenga su propio estado y su propio responsable. La
 * reunión puede estar confirmada y el sonido sin conseguir: son dos cosas
 * distintas y hasta ahora se veían igual.
 */

export const ESTADOS_RECURSO = [
  "solicitado",
  "conseguido",
  "entregado",
  "no_disponible",
] as const;

export type EstadoRecurso = (typeof ESTADOS_RECURSO)[number];

export const ETIQUETA_RECURSO: Record<EstadoRecurso, string> = {
  solicitado: "Por conseguir",
  conseguido: "Conseguido",
  entregado: "Entregado en el sitio",
  no_disponible: "No se consiguió",
};

/**
 * `no_disponible` no es un fracaso administrativo, es información urgente:
 * significa que hay que buscarlo por otro lado o avisar de que ese acto sale
 * sin sonido. Por eso es un estado y no un borrado.
 */
export const TRANSICIONES_RECURSO: Record<EstadoRecurso, EstadoRecurso[]> = {
  solicitado: ["conseguido", "no_disponible"],
  conseguido: ["entregado", "solicitado", "no_disponible"],
  entregado: ["conseguido"],
  no_disponible: ["solicitado", "conseguido"],
};

export function esEstadoRecurso(valor: unknown): valor is EstadoRecurso {
  return typeof valor === "string" && (ESTADOS_RECURSO as readonly string[]).includes(valor);
}

export function puedePasarA(desde: string, hasta: EstadoRecurso): boolean {
  if (!esEstadoRecurso(desde)) return true; // dato viejo o desconocido: no se bloquea
  return TRANSICIONES_RECURSO[desde].includes(hasta);
}

/** Lo que todavía hay que perseguir. */
export const PENDIENTES: EstadoRecurso[] = ["solicitado", "no_disponible"];

/**
 * Cuánto falta para el acto, en días enteros.
 *
 * El plazo de un recurso no se guarda: es la fecha de la reunión. Un recurso
 * sin conseguir a tres días es una tarea; a un día es una emergencia. La
 * pantalla ordena por esto, no por cuándo se pidió.
 */
export function diasHasta(fecha: Date, ahora = new Date()): number {
  const unDia = 24 * 60 * 60 * 1000;
  const soloFecha = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((soloFecha(fecha) - soloFecha(ahora)) / unDia);
}

/** Cómo de urgente es, para pintarlo sin tener que leer la fecha. */
export function urgencia(dias: number): "vencido" | "hoy" | "urgente" | "proximo" | "lejano" {
  if (dias < 0) return "vencido";
  if (dias === 0) return "hoy";
  if (dias <= 2) return "urgente";
  if (dias <= 7) return "proximo";
  return "lejano";
}
