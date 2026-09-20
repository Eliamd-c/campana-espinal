import { z } from "zod";

export const schemaEnviarCampana = z.object({
  nombre_campana: z.string().max(100).optional(),
  texto: z.string().min(1, "El mensaje no puede estar vacío").max(4096, "El mensaje es demasiado largo"),
  cedulas: z.array(z.coerce.string().min(1).max(50)).optional().default([]),
  mediaUrl: z.string().url().optional().nullable(),
  pollOptions: z.array(z.string()).optional(),
  lineaId: z.number().optional().nullable(),
  delayMin: z.number().min(1).max(60).optional(),
  delayMax: z.number().min(2).max(120).optional(),
  manuales: z.array(z.object({
    nombre: z.string().optional(),
    telefono: z.string()
  })).optional(),
  variaciones: z.array(z.string()).optional(),
  excluirYaContactados: z.boolean().optional().default(false),
  modoCalentamiento: z.boolean().optional().default(false),
});

export const schemaFiltroContactos = z.object({
  barrio: z.string().optional(),
  intencion_voto: z.enum(["positivo", "negativo", "indeciso", "desconocido"]).optional(),
  puesto_votacion: z.string().optional(),
  q: z.string().optional(),
  fecha_desde: z.string().datetime().optional(),
  fecha_hasta: z.string().datetime().optional(),
});

// ═══════════════════════════════════════════════════════════════
// Esquemas que las rutas ya importaban pero que no existían.
//
// `app/api/lideres`, `app/api/eventos` y `app/api/scan` llamaban a
// `.safeParse()` sobre un `undefined`, lo que lanza un TypeError y devuelve
// 500 en cada petición. Compilaba porque `next.config.mjs` tenía
// `ignoreBuildErrors: true` (hallazgo #7); es decir, tres rutas llevaban
// rotas todo este tiempo y, de haber funcionado, habrían escrito en la base
// sin validar nada.
//
// Los límites de longitud siguen los de `prisma/schema.prisma`: si aquí se
// dejara pasar un texto más largo, el error saltaría en la base de datos, con
// un 500 en vez de un 400 que explique qué campo está mal.
// ═══════════════════════════════════════════════════════════════

/** Filtro de búsqueda de líderes. */
/**
 * Los formularios mandan cadenas vacías cuando el usuario elige «Todos» o
 * deja un campo en blanco. Eso significa «sin filtro», no «valor inválido»:
 * sin esta normalización, `?limit=` se coacciona a 0 y devuelve un 400 que
 * el usuario no entiende.
 */
const vacioEsIndefinido = (v: unknown) => (v === "" || v === null ? undefined : v);

export const FiltroLideresSchema = z.object({
  query: z.preprocess(vacioEsIndefinido, z.string().max(120).optional()),
  // 200 por defecto: con 50 se perdían silenciosamente líderes de la lista.
  limit: z.preprocess(vacioEsIndefinido, z.coerce.number().int().min(1).max(500).default(200)),
});

/** Alta de un líder. El teléfono es obligatorio: sin él no se le contacta. */
export const LiderSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio").max(120),
  telefono: z.string().min(7, "El teléfono es obligatorio").max(15),
  barrio: z.string().max(80).optional(),
});

/** Tipos de evento admitidos, según el comentario del modelo Evento. */
export const TIPOS_EVENTO = [
  "mitin", "casa_a_casa", "foro", "recorrido",
  "reunion_barrial", "reunion_lideres", "fecha_critica",
] as const;

export const ESTADOS_EVENTO = [
  "borrador", "pendiente_aprobacion", "aprobado",
  "en_ejecucion", "finalizado", "cancelado",
] as const;

/** Filtro de listado de eventos. */
export const FiltroEventosSchema = z.object({
  tipo: z.preprocess(vacioEsIndefinido, z.enum(TIPOS_EVENTO).optional()),
  estado: z.preprocess(vacioEsIndefinido, z.enum(ESTADOS_EVENTO).optional()),
  barrio: z.preprocess(vacioEsIndefinido, z.string().max(80).optional()),
});

/** Alta de un evento de campaña. */
export const EventoSchema = z
  .object({
    titulo: z.string().min(3, "El título es obligatorio").max(200),
    tipo: z.enum(TIPOS_EVENTO),
    estado: z.enum(ESTADOS_EVENTO).default("borrador"),
    fecha_inicio: z.coerce.date(),
    fecha_fin: z.coerce.date(),
    lugar: z.string().min(2, "El lugar es obligatorio").max(200),
    barrio: z.string().max(80).optional(),
    asistentes_esperados: z.coerce.number().int().min(0).max(1_000_000).default(0),
    presupuesto_estimado: z.coerce.number().min(0).optional(),
    notas: z.string().max(5000).optional(),
    creado_por: z.string().max(80).default("web"),
    lider_id: z.coerce.number().int().positive().optional(),
  })
  .refine((e) => e.fecha_fin >= e.fecha_inicio, {
    message: "La fecha de fin no puede ser anterior a la de inicio",
    path: ["fecha_fin"],
  });

/**
 * Escaneo de planillas. La imagen llega como data URL; el OCR se resuelve hoy
 * en el navegador y esta ruta es la preparación para moverlo al servidor.
 * El tope de tamaño evita que una petición cargue la memoria del proceso.
 */
export const ScanSchema = z.object({
  imagen: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp);base64,/, "La imagen debe ser un data URL de imagen")
    .max(8_000_000, "La imagen supera el tamaño admitido")
    .optional(),
  texto: z.string().max(50_000).optional(),
  origen: z.string().max(40).optional(),
});

/**
 * Alta de plantilla de mensaje. Antes esta ruta no validaba nada y hacía
 * `data.texto.match(...)` directamente: una petición sin `texto` tumbaba el
 * endpoint con un 500.
 */
export const PlantillaSchema = z.object({
  // 100 y no más: es el ancho de la columna. Si aquí pasara un nombre más
  // largo, el error saltaría en la base y saldría como 500 en vez de 400.
  nombre: z.string().min(2, "El nombre es obligatorio").max(100),
  categoria: z.string().max(40).default("general"),
  texto: z.string().min(1, "El texto no puede estar vacío").max(4096),
});

/**
 * Imagen de planilla que entra en `/api/ocr`.
 *
 * Antes esta ruta aceptaba cualquier data URL cuyo mimetype casara con un
 * regex suelto y sin tope de tamaño: una foto de 12 MB de un móvil moderno
 * llegaba entera a Gemini, agotaba el tiempo de la ruta y gastaba cuota.
 * Aquí se acota lo mismo que en `ScanSchema`: formatos que Gemini entiende y
 * un tope de bytes. El cliente reduce la foto antes de enviarla, así que
 * 6 MB de data URL es holgado para una planilla legible.
 */
export const MAX_BYTES_IMAGEN_OCR = 6_000_000;

export const ImagenPlanillaSchema = z.object({
  imagenUrl: z
    .string()
    .regex(
      /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/,
      "La imagen debe ser un data URL de imagen (png, jpg o webp)"
    )
    .max(MAX_BYTES_IMAGEN_OCR, "La imagen supera el tamaño admitido"),
});
