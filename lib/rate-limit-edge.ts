/**
 * Limitador de peticiones para el middleware.
 *
 * Existe `lib/ratelimit.ts`, pero solo funciona con Upstash por HTTP: como
 * `REDIS_URL` es una conexión TCP (`redis://`), ese módulo cae en un objeto
 * simulado y `checkRateLimit` devuelve siempre «permitido».
 *
 * Este limitador guarda el contador en memoria del proceso. Con varias
 * instancias cada una lleva su cuenta, así que el tope real se multiplica;
 * para el despliegue actual (un `node server.js`) es exacto. Si algún día hay
 * varias instancias, se sustituye por Redis sin tocar las llamadas.
 *
 * Funciona en el runtime Edge: sin dependencias, sin sockets, sin timers.
 */

export interface Limite {
  /** Peticiones permitidas dentro de la ventana. */
  peticiones: number;
  /** Duración de la ventana, en segundos. */
  ventanaSegundos: number;
}

export interface Resultado {
  permitido: boolean;
  restantes: number;
  /** Segundos que faltan para que se libere la ventana. */
  reintentarEn: number;
}

/** clave -> marcas de tiempo de las peticiones dentro de la ventana. */
const registros = new Map<string, number[]>();

/**
 * Tope duro de claves distintas. Sin evicción real, quien pueda inventar
 * claves nuevas hace crecer el mapa sin freno: el limitador sería él mismo el
 * amplificador de un ataque de memoria.
 */
const MAX_CLAVES = 10_000;

/**
 * Deja sitio cuando se alcanza el tope, descartando de golpe el 20% de claves
 * menos recientes. Se hace por lotes y solo al desbordar: barrer el mapa
 * entero en cada petición costaría milisegundos de CPU dentro del middleware,
 * que es justo lo que un atacante querría provocar.
 */
function desalojar() {
  if (registros.size <= MAX_CLAVES) return;

  const porAntiguedad = Array.from(registros.keys())
    .map((clave) => {
      const marcas = registros.get(clave);
      return { clave, ultima: marcas && marcas.length ? marcas[marcas.length - 1] : 0 };
    })
    .sort((a, b) => a.ultima - b.ultima);

  const aBorrar = Math.ceil(MAX_CLAVES * 0.2);
  for (let i = 0; i < aBorrar && i < porAntiguedad.length; i++) {
    registros.delete(porAntiguedad[i].clave);
  }
}

/**
 * Cuenta una petición y dice si se admite. Ventana deslizante: se descartan
 * las marcas que ya salieron de la ventana y se cuenta lo que queda.
 */
export function consultarLimite(clave: string, limite: Limite): Resultado {
  const ahora = Date.now();
  const ventanaMs = limite.ventanaSegundos * 1000;
  const desde = ahora - ventanaMs;

  const previas = registros.get(clave) ?? [];
  const vigentes = previas.filter((t) => t > desde);

  if (vigentes.length >= limite.peticiones) {
    const masAntigua = vigentes[0];
    registros.set(clave, vigentes);
    return {
      permitido: false,
      restantes: 0,
      reintentarEn: Math.max(1, Math.ceil((masAntigua + ventanaMs - ahora) / 1000)),
    };
  }

  vigentes.push(ahora);
  registros.set(clave, vigentes);
  desalojar();

  return {
    permitido: true,
    restantes: limite.peticiones - vigentes.length,
    reintentarEn: 0,
  };
}

/** Solo para pruebas: vacía el estado entre casos. */
export function reiniciarRegistros() {
  registros.clear();
}

/** Solo para pruebas y diagnóstico. */
export function clavesRegistradas(): number {
  return registros.size;
}

/**
 * Límites por tipo de ruta. Los más estrictos protegen, por este orden: la
 * puerta de entrada, lo que cuesta dinero y lo que expone datos de votantes.
 */
export const LIMITES: Record<string, Limite> = {
  /**
   * Inicio de sesión. Es la defensa contra la fuerza bruta. El cubo se indexa
   * por usuario además de por origen, así que 15 intentos son de sobra para
   * quien se equivoca tecleando y siguen siendo pocos para quien prueba
   * contraseñas.
   */
  login: { peticiones: 15, ventanaSegundos: 300 },

  /** Llamadas a modelos de IA y OCR: cada una cuesta dinero real. */
  ia: { peticiones: 20, ventanaSegundos: 60 },

  /** Envío de mensajes: un descuido aquí quema las líneas de WhatsApp. */
  envio: { peticiones: 30, ventanaSegundos: 60 },

  /** Lectura y escritura de datos de votantes. */
  datos: { peticiones: 120, ventanaSegundos: 60 },

  /** Webhooks entrantes: legítimamente ruidosos, pero no infinitos. */
  webhook: { peticiones: 300, ventanaSegundos: 60 },

  /** Resto de la aplicación. */
  general: { peticiones: 200, ventanaSegundos: 60 },
};

/** ¿Es esta la ruta por la que se inicia sesión? */
export function esRutaDeLogin(pathname: string): boolean {
  return pathname.startsWith("/api/auth/callback") || pathname.startsWith("/api/auth/signin");
}

/** Elige el límite que corresponde a una ruta. */
export function limitePara(pathname: string): { nombre: string; limite: Limite } {
  if (esRutaDeLogin(pathname)) {
    return { nombre: "login", limite: LIMITES.login };
  }
  if (pathname.startsWith("/api/ia/") || pathname.startsWith("/api/ocr") ||
      pathname.startsWith("/api/rag/") || pathname.startsWith("/api/scan") ||
      pathname.includes("/generar-variaciones") || pathname.startsWith("/api/whatsapp/procesar")) {
    return { nombre: "ia", limite: LIMITES.ia };
  }
  if (pathname.startsWith("/api/mensajes/enviar") || pathname.startsWith("/api/campanas/")) {
    return { nombre: "envio", limite: LIMITES.envio };
  }
  if (pathname.startsWith("/api/contactos") || pathname.startsWith("/api/lideres") ||
      pathname.startsWith("/api/mesas") || pathname.startsWith("/api/search") ||
      pathname.startsWith("/api/registraduria")) {
    return { nombre: "datos", limite: LIMITES.datos };
  }
  if (pathname.includes("/webhook")) {
    return { nombre: "webhook", limite: LIMITES.webhook };
  }
  return { nombre: "general", limite: LIMITES.general };
}

/**
 * ¿Hay delante un proxy cuya cabecera `x-forwarded-for` podamos creernos?
 *
 * Por defecto NO. La cabecera la pone quien hace la petición, así que fiarse
 * de ella sin un proxy delante permite dos cosas graves: cambiarla en cada
 * intento para saltarse el límite por completo, y ponerle la IP de un
 * compañero para dejarlo fuera del panel. Se activa a mano en el despliegue,
 * donde sí hay un proxy que la reescribe.
 */
function confiarEnCabeceraDeProxy(): boolean {
  return process.env.TRUST_PROXY_HEADERS === "true";
}

/**
 * Identifica el origen de la petición.
 *
 * Tras un proxy de confianza, la IP real llega en `x-forwarded-for`. Sin él,
 * se usa la dirección de la conexión, que el cliente no puede falsificar.
 */
export function identificar(cabeceras: Headers, ipDirecta?: string): string {
  if (confiarEnCabeceraDeProxy()) {
    const reenviada = cabeceras.get("x-forwarded-for");
    if (reenviada) return reenviada.split(",")[0].trim();
    const real = cabeceras.get("x-real-ip");
    if (real) return real.trim();
  }
  return ipDirecta ?? "conexion-directa";
}

/**
 * Clave del cubo de login: origen y usuario.
 *
 * Incluir el usuario evita que varios coordinadores tras la misma IP de la
 * sede se expulsen entre ellos, y mantiene el freno donde importa, que es
 * probar contraseñas de una cuenta concreta.
 */
export function claveDeLogin(origen: string, usuario?: string | null): string {
  const cuenta = (usuario ?? "").trim().toLowerCase().slice(0, 64) || "sin-usuario";
  return `login:${origen}:${cuenta}`;
}
