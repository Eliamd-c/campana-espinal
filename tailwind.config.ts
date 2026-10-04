import type { Config } from "tailwindcss";

/**
 * Tokens del sistema de diseño expuestos como utilidades de Tailwind.
 *
 * Los valores viven en `app/globals.css` como variables CSS; aquí solo se
 * nombran para poder escribir `bg-brand`, `text-ink-muted` o `border-line` en
 * vez de un hex suelto. Así el color se decide en un sitio y el tema (claro,
 * oscuro, sol) lo cambia sin tocar las pantallas.
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          DEFAULT: "var(--brand)",
          700: "var(--brand-700)",
          50: "var(--brand-50)",
        },
        spark: {
          DEFAULT: "var(--spark)",
          ink: "var(--spark-ink)",
        },
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
        },
        line: "var(--line)",
        ink: {
          DEFAULT: "var(--fg)",
          muted: "var(--muted)",
          faint: "var(--faint)",
        },
        pos: "var(--pos)",
        ind: "var(--ind)",
        neg: "var(--neg)",
        unk: "var(--unk)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        brand: "var(--radius)",
      },
      boxShadow: {
        soft: "var(--shadow)",
        "soft-lg": "var(--shadow-lg)",
      },
    },
  },
  plugins: [],
};
export default config;
