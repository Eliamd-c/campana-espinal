import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Sin esta configuración, vitest no resuelve el alias `@/` del tsconfig y
 * `__tests__/rag-v2.test.ts` fallaba al importar. Una suite en rojo de forma
 * permanente hace que nadie mire la siguiente, así que conviene que `npm test`
 * salga limpio o falle por algo real.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Los tests de integración de `__tests__/api` necesitan un servidor en
    // marcha; se omiten solos cuando no lo hay.
    testTimeout: 20_000,
  },
});
