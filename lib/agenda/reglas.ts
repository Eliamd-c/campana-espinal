/**
 * Motor de reglas de la agenda.
 *
 * Decide si un agendamiento puede confirmarse. Es una función pura, sin
 * dependencias de React ni de Next, porque la usan tres sitios y tiene que
 * dar la misma respuesta en los tres: el formulario (avisos en vivo), la API
 * (que no se fía del cliente) y la pantalla de confirmación.
 *
 * La regla que gobierna el módulo: **un cupo nunca puede parecer una reunión
 * confirmada**. Mientras quede un dato por confirmar, no se confirma.
 */

export type TipoCampo =
  | "texto_corto"
  | "texto_largo"
  | "numero"
  | "dinero"
  | "fecha"
  | "hora"
  | "fecha_hora"
  | "si_no"
  | "opciones"
  | "barrio"
  | "persona"
  | "lider";

export interface CampoPlantilla {
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido_para_confirmar: boolean;
  ayuda?: string;
  orden: number;
  /** Solo para el tipo `opciones`. */
  opciones?: string[];
}

export interface CampoPorConfirmar {
  campo: string;
  marcadoPor?: string;
  fecha?: Date;
}

export interface Faltante {
  campo: string;
  etiqueta: string;
  motivo: "vacio" | "invalido";
  /** Qué está mal, cuando el motivo es `invalido`. */
  detalle?: string;
}

export interface ResultadoValidacion {
  puedeConfirmar: boolean;
  faltantes: Faltante[];
  porConfirmar: Faltante[];
}

/** ¿Está vacío? Un `0` o un `false` son valores, no huecos. */
function estaVacio(valor: unknown): boolean {
  if (valor === undefined || valor === null) return true;
  if (typeof valor === "string") return valor.trim() === "";
  if (Array.isArray(valor)) return valor.length === 0;
  return false;
}

/**
 * Comprueba que el valor encaja con el tipo del campo.
 *
 * Esto faltaba: el tipo `Faltante` declaraba el motivo `invalido` y nunca se
 * usaba, así que un campo `numero` con letras o una `fecha` sin sentido
 * pasaban como válidos y el agendamiento se confirmaba con datos rotos.
 */
function validarTipo(campo: CampoPlantilla, valor: unknown): string | null {
  switch (campo.tipo) {
    case "numero":
    case "dinero": {
      let n: number;

      if (typeof valor === "number") {
        n = valor;
      } else {
        const texto = String(valor).trim();

        /**
         * Sin esta comprobación, «abc» se quedaba en cadena vacía al quitar
         * los caracteres no numéricos, y `Number("")` es 0: un texto sin un
         * solo dígito pasaba como número válido.
         */
        if (!/\d/.test(texto)) return "debe ser un número";

        // Se toleran formatos humanos: «200 sillas», «$500.000», «1,5».
        n = Number(texto.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
      }

      if (!Number.isFinite(n)) return "debe ser un número";
      if (campo.tipo === "dinero" && n < 0) return "no puede ser negativo";
      return null;
    }

    case "fecha":
    case "fecha_hora": {
      const fecha = valor instanceof Date ? valor : new Date(String(valor));
      if (Number.isNaN(fecha.getTime())) return "no es una fecha válida";
      return null;
    }

    case "hora": {
      // Admite 6:30, 06:30 y 18:45.
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(valor).trim())) {
        return "debe tener la forma HH:mm";
      }
      return null;
    }

    case "si_no":
      if (typeof valor !== "boolean") return "debe ser sí o no";
      return null;

    case "opciones": {
      const permitidas = campo.opciones ?? [];
      if (permitidas.length > 0 && !permitidas.includes(String(valor))) {
        return `debe ser uno de: ${permitidas.join(", ")}`;
      }
      return null;
    }

    case "persona": {
      // Cédula: solo dígitos.
      if (!/^\d{4,12}$/.test(String(valor).trim())) return "debe ser una cédula";
      return null;
    }

    case "lider": {
      const n = Number(valor);
      if (!Number.isInteger(n) || n <= 0) return "no es un líder válido";
      return null;
    }

    case "texto_corto":
      if (String(valor).length > 200) return "es demasiado largo";
      return null;

    case "texto_largo":
      if (String(valor).length > 5000) return "es demasiado largo";
      return null;

    case "barrio":
      if (String(valor).trim().length > 80) return "es demasiado largo";
      return null;

    default:
      return null;
  }
}

/**
 * Evalúa un agendamiento contra las reglas de su plantilla.
 *
 * - Campo requerido y vacío → `faltantes`, salvo que esté declarado por
 *   confirmar.
 * - Campo con valor que no encaja con su tipo → `faltantes` con motivo
 *   `invalido`, **aunque no sea requerido**: un dato roto es peor que uno
 *   ausente, porque parece bueno.
 * - `puedeConfirmar` solo es cierto si no queda nada en ninguna de las dos
 *   listas.
 */
export function evaluar(
  reglas: CampoPlantilla[],
  datos: Record<string, unknown>,
  camposPorConfirmar: CampoPorConfirmar[] = []
): ResultadoValidacion {
  const faltantes: Faltante[] = [];
  const porConfirmar: Faltante[] = [];

  const pendientes = new Map(camposPorConfirmar.map((c) => [c.campo, c]));

  for (const regla of reglas ?? []) {
    const valor = datos?.[regla.clave];
    const vacio = estaVacio(valor);

    if (vacio) {
      if (!regla.requerido_para_confirmar) continue;

      if (pendientes.has(regla.clave)) {
        porConfirmar.push({
          campo: regla.clave,
          etiqueta: regla.etiqueta,
          motivo: "vacio",
        });
      } else {
        faltantes.push({
          campo: regla.clave,
          etiqueta: regla.etiqueta,
          motivo: "vacio",
        });
      }
      continue;
    }

    // Tiene valor: se comprueba que sea del tipo que dice ser.
    const problema = validarTipo(regla, valor);
    if (problema) {
      faltantes.push({
        campo: regla.clave,
        etiqueta: regla.etiqueta,
        motivo: "invalido",
        detalle: problema,
      });
    }
  }

  /**
   * Un campo marcado por confirmar que ya tiene valor es una contradicción:
   * alguien dijo «esto no se sabe» y después lo rellenó. Se señala para que
   * la interfaz ofrezca resolverlo, y mientras tanto sigue frenando la
   * confirmación: si no, el agendamiento se confirmaría dejando en la base un
   * pendiente que nadie cerró.
   */
  for (const [clave, pendiente] of Array.from(pendientes)) {
    const regla = (reglas ?? []).find((r) => r.clave === clave);
    if (!regla) continue;

    const yaEstaEnLista = porConfirmar.some((p) => p.campo === clave);
    if (!yaEstaEnLista && !estaVacio(datos?.[clave])) {
      porConfirmar.push({
        campo: clave,
        etiqueta: regla.etiqueta,
        motivo: "vacio",
        detalle: "marcado como pendiente pero ya tiene valor: resuélvelo",
      });
    }
  }

  return {
    puedeConfirmar: faltantes.length === 0 && porConfirmar.length === 0,
    faltantes,
    porConfirmar,
  };
}
