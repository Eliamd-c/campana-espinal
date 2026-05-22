export type BlockType = "texto" | "imagen" | "video" | "encuesta" | "boton" | "divisor" | "espaciador";

export interface Bloque {
  id: string;
  tipo: BlockType;
  orden: number;
  config: BlockConfig;
}

export interface BlockConfig {
  // Común
  margen_top?: number;
  margen_bottom?: number;

  // Texto
  contenido?: string;
  tamaño?: "pequeno" | "normal" | "grande";
  peso?: "normal" | "bold";
  color?: string;
  alineacion?: "left" | "center" | "right";
  variables?: string[];

  // Imagen
  url?: string;
  ancho?: string;
  caption?: string;
  enlace?: string;

  // Video
  tipo_video?: "youtube" | "vimeo" | "url";
  descripcion?: string;

  // Encuesta
  pregunta?: string;
  opciones?: Array<{ id: string; texto: string; emoji: string }>;
  tipo_encuesta?: "single" | "multiple";
  permitir_otro?: boolean;

  // Botón
  texto?: string;
  accion?: "url" | "llamada" | "whatsapp" | "formulario";
  valor?: string;

  // Divisor
  espesor?: string;

  // Espaciador
  altura?: string;
}

export interface MessageTemplate {
  id: number;
  nombre: string;
  descripcion?: string;
  categoria: string;
  bloques: Bloque[];
  preview_texto?: string;
  imagen_preview?: string;
  creada_por: string;
  fecha_creada: Date;
  veces_usada: number;
  esPublica: boolean;
}
