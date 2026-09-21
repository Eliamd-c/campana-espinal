import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  consultarLimite,
  limitePara,
  identificar,
  esRutaDeLogin,
  claveDeLogin,
} from "@/lib/rate-limit-edge";

/**
 * Puerta de entrada única de la aplicación.
 *
 * El criterio es deny-by-default: una ruta nueva nace protegida, no hay que
 * acordarse de protegerla. Lo público se enumera aquí, uno a uno y con motivo.
 *
 * Esta es la primera capa, no la única: los handlers que tocan PII verifican
 * sesión por su cuenta (ver `lib/auth/middleware.ts`), porque un middleware
 * saltado no puede dejar la base de datos al descubierto.
 */

/** Rutas públicas exactas, con el motivo por el que lo son. */
const RUTAS_PUBLICAS = [
  "/login", // pantalla de acceso
  "/api/auth", // endpoints de NextAuth (signin, callback, csrf, session)
  "/monitoring", // túnel de Sentry configurado en next.config.mjs
  "/ir", // acortador de enlaces que reciben los votantes por WhatsApp
];

/**
 * Llamadas entrantes que no traen sesión, porque no las hace una persona.
 *
 * Cada una se autentica dentro de su propio handler con un secreto
 * compartido: una ruta pública sin secreto es una puerta abierta.
 */
const WEBHOOKS: string[] = [
  /**
   * Latido de las líneas de WhatsApp, que llama el cron del alojamiento para
   * que la aplicación no se duerma y el socket no se caiga. Comprueba
   * `WHATSAPP_SECRETO_LATIDO` en tiempo constante y responde 401 sin dar
   * detalles a quien no lo traiga.
   */
  "/api/whatsapp/latido",
];


/**
 * Coincidencia exacta o de subruta. Nunca `startsWith` a secas: eso haría
 * pública `/loginfake` o `/api/authz`.
 */
function esPublica(pathname: string): boolean {
  return [...RUTAS_PUBLICAS, ...WEBHOOKS].some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`)
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  /**
   * El limite se aplica ANTES de comprobar la sesion, y tambien a las rutas
   * publicas. Si fuera al reves, el login y los webhooks -- que son
   * precisamente lo que un atacante martillea sin sesion -- quedarian fuera.
   */
  const { nombre, limite } = limitePara(pathname);
  const quien = identificar(req.headers, req.ip);

  /**
   * En el login, el cubo se indexa tambien por usuario. Asi varios
   * coordinadores tras la misma IP de la sede no se expulsan entre ellos, y
   * el freno sigue donde importa: probar contrasenas de una cuenta concreta.
   * El cuerpo se lee de una copia para no consumir el original.
   */
  let clave = `${nombre}:${quien}`;
  if (esRutaDeLogin(pathname) && req.method === "POST") {
    try {
      const copia = await req.clone().formData();
      clave = claveDeLogin(quien, String(copia.get("username") ?? ""));
    } catch {
      clave = claveDeLogin(quien, null);
    }
  }

  const veredicto = consultarLimite(clave, limite);

  if (!veredicto.permitido) {
    const cabeceras = {
      "Retry-After": String(veredicto.reintentarEn),
      "X-RateLimit-Limit": String(limite.peticiones),
      "X-RateLimit-Remaining": "0",
    };

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "Demasiadas peticiones. Espera unos segundos e intentalo de nuevo.",
          reintentar_en_segundos: veredicto.reintentarEn,
        },
        { status: 429, headers: cabeceras }
      );
    }
    return new NextResponse("Demasiadas peticiones. Intentalo de nuevo en unos segundos.", {
      status: 429,
      headers: { ...cabeceras, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (esPublica(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (token) {
    return NextResponse.next();
  }

  // Las llamadas de API reciben un 401 limpio; las páginas, una redirección
  // al login que recuerda a dónde iba el usuario.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const login = new URL("/login", req.url);
  login.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  /**
   * Se excluyen únicamente los estáticos; todo lo demás (páginas y API) pasa
   * por aquí. El punto va como `[.]` y no como `\.` a propósito: el matcher
   * se escribe dentro de un string, donde un backslash suelto se pierde y el
   * punto pasaría a significar "cualquier carácter" — con eso, `/api/contactos/9xml`
   * se saltaría el middleware.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon[.]ico|.*[.](?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml)$).*)",
  ],
};
