import type { Bloque } from "./types";
import { generarIdBloque } from "./utils";

export const PLANTILLAS_DEFAULT = [
  {
    nombre: "Encuesta de Intención",
    categoria: "encuesta",
    esPublica: true,
    bloques: [
      {
        id: "b1",
        tipo: "texto",
        orden: 0,
        config: {
          contenido: "¡Hola {{nombre}}!",
          tamaño: "grande",
          peso: "bold",
          alineacion: "left"
        },
      },
      {
        id: "b2",
        tipo: "texto",
        orden: 1,
        config: {
          contenido: "Queremos saber tu opinión sobre las próximas elecciones en el municipio.",
        },
      },
      {
        id: "b3",
        tipo: "encuesta",
        orden: 2,
        config: {
          pregunta: "¿Cuál es tu intención de voto?",
          opciones: [
            { id: "1", texto: "Positivo", emoji: "👍" },
            { id: "2", texto: "Indeciso", emoji: "🤔" },
            { id: "3", texto: "Negativo", emoji: "👎" },
          ],
          tipo_encuesta: "single",
        },
      },
    ] as Bloque[],
  },
  {
    nombre: "Invitación a Evento",
    categoria: "evento",
    esPublica: true,
    bloques: [
      {
        id: "b1",
        tipo: "texto",
        orden: 0,
        config: {
          contenido: "¡Te invitamos a nuestro Gran Evento!",
          tamaño: "grande",
          peso: "bold",
          color: "#4F46E5"
        },
      },
      {
        id: "b2",
        tipo: "texto",
        orden: 1,
        config: {
          contenido: "📅 Fecha: {{fecha}}\n📍 Lugar: {{ubicacion}}",
        },
      },
      {
        id: "b3",
        tipo: "boton",
        orden: 2,
        config: {
          texto: "Confirmar Asistencia",
          accion: "url",
          valor: "https://tuevento.com",
          color: "#00A884",
        },
      },
    ] as Bloque[],
  },
];
