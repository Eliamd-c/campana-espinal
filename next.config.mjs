import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuración base de Next.js
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
