import { withSentryConfig } from "@sentry/nextjs";

/**
 * Cabeceras de seguridad que acompañan a toda respuesta.
 *
 * El panel muestra el padrón electoral: cédulas, teléfonos e intención de
 * voto. Estas cabeceras son lo que impide que otra página las lea desde el
 * navegador de un coordinador que tenga la sesión abierta.
 */
const cabecerasDeSeguridad = [
  {
    /**
     * Política de contenido. `unsafe-inline` y `unsafe-eval` en los scripts
     * son concesiones a Next.js en desarrollo y a Recharts/Tesseract; se
     * pueden retirar migrando a nonces, que es trabajo aparte.
     *
     * Lo importante aquí es `connect-src`, `frame-ancestors` y `form-action`:
     * limitan a dónde puede salir la información y quién puede enmarcar el
     * panel o recibir sus formularios.
     */
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // Supabase, Sentry y la API de Gemini; nada más.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://generativelanguage.googleapis.com",
      "worker-src 'self' blob:",
      "media-src 'self' blob: data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  {
    // Nadie puede enmarcar el panel: evita el robo de clics sobre acciones
    // como "enviar campaña" o "borrar contacto".
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Impide que el navegador adivine el tipo de un fichero servido y acabe
    // ejecutando como script algo subido como imagen.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Al salir del panel no se filtra la ruta, que puede llevar una cédula.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // La aplicación no usa cámara, micrófono ni ubicación desde el servidor.
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    // Un año de HTTPS obligatorio. Solo surte efecto sobre HTTPS, así que en
    // desarrollo por HTTP es inocua.
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Los errores de tipos y de lint rompen la compilación, como debe ser.
   *
   * Estaban silenciados, y eso ocultaba que tres rutas (`/api/lideres`,
   * `/api/eventos` y `/api/scan`) importaban esquemas de validación
   * inexistentes: llamaban a `.safeParse()` sobre `undefined` y respondían
   * 500 en cada petición. Un build que no falla nunca no avisa de nada.
   */
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },

  // No anunciar la versión del framework: es información gratis para quien
  // busca exploits conocidos.
  poweredByHeader: false,

  experimental: {
    /**
     * Baileys y su pila de websockets se cargan tal cual, sin pasar por
     * webpack.
     *
     * `ws` intenta cargar dos módulos nativos opcionales (`bufferutil` y
     * `utf-8-validate`) dentro de un `try`. Al empaquetarlo, webpack sustituye
     * esa carga por un objeto vacío que sí resuelve, así que el `try` no
     * falla y nunca se usa la implementación de respaldo en JavaScript: al
     * primer marco del websocket revienta con «e.mask is not a function».
     *
     * Dejarlos fuera del bundle también evita empaquetar el `pino` de Baileys
     * y sus transportes, que se cargan por nombre en tiempo de ejecución.
     */
    serverComponentsExternalPackages: [
      "@whiskeysockets/baileys",
      "ws",
      "pino",
      "link-preview-js",
    ],
  },

  async headers() {
    return [{ source: "/:path*", headers: cabecerasDeSeguridad }];
  },
};

export default withSentryConfig(nextConfig, {
  // Para todas las opciones disponibles, consulta:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Suprime los logs de Sentry SDK cuando se inicializa
  silent: true,
  org: "campana-espinal",
  project: "javascript-nextjs",
}, {
  // Sube los source maps automáticamente
  widenClientFileUpload: true,
  transpileClientSDK: true,
  tunnelRoute: "/monitoring",
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
