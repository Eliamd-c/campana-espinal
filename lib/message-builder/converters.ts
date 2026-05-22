import type { Bloque } from "./types";

export function convertBlocksToWhatsApp(bloques: Bloque[]): string {
  let mensaje = "";

  for (const bloque of bloques) {
    if (bloque.tipo === "texto") {
      let texto = bloque.config.contenido || "";
      if (bloque.config.peso === "bold") {
        texto = `*${texto}*`; // Formato bold WhatsApp
      }
      mensaje += texto + "\n";
    }

    if (bloque.tipo === "encuesta") {
      mensaje += `\n📊 *${bloque.config.pregunta || "Encuesta"}*\n`;
      bloque.config.opciones?.forEach((opt, i) => {
        mensaje += `${i + 1}. ${opt.emoji || "●"} ${opt.texto}\n`;
      });
      mensaje += "\n";
    }

    if (bloque.tipo === "boton") {
      mensaje += `\n👉 ${bloque.config.texto}\n🔗 ${bloque.config.valor}\n`;
    }

    if (bloque.tipo === "divisor") {
      mensaje += "\n" + "─".repeat(25) + "\n\n";
    }

    if (bloque.tipo === "espaciador") {
      mensaje += "\n";
    }
  }

  return mensaje.trim();
}
