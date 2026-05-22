import type { BlockType, BlockConfig } from "./types";

export function generarIdBloque(): string {
  return `bloque_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function getConfigDefault(tipo: BlockType): BlockConfig {
  const defaults: Record<BlockType, BlockConfig> = {
    texto: {
      contenido: "",
      tamaño: "normal",
      peso: "normal",
      color: "#000000",
      alineacion: "left",
    },
    imagen: {
      url: "",
      ancho: "100%",
      caption: "",
    },
    video: {
      url: "",
      tipo_video: "youtube",
      descripcion: "",
    },
    encuesta: {
      pregunta: "",
      opciones: [
        { id: "1", texto: "Sí", emoji: "👍" },
        { id: "2", texto: "No", emoji: "👎" },
      ],
      tipo_encuesta: "single",
      permitir_otro: false,
    },
    boton: {
      texto: "Botón",
      accion: "url",
      valor: "",
      color: "#007AFF",
    },
    divisor: {
      color: "#EEEEEE",
      espesor: "1px",
    },
    espaciador: {
      altura: "16px",
    },
  };

  return defaults[tipo];
}
