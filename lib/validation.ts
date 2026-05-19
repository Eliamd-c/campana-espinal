import { z } from 'zod';

// ──────────────────────────────────────────────────────
// Esquemas compartidos
// ──────────────────────────────────────────────────────

export const CedulaSchema = z
  .string()
  .min(8, "Cédula debe tener 8+ dígitos")
  .max(12, "Cédula no puede exceder 12 dígitos")
  .regex(/^\d+$/, "Cédula solo contiene dígitos")
  .transform(v => v.trim());

export const TelefonoSchema = z
  .string()
  .min(10, "Teléfono inválido")
  .max(15)
  .regex(/^\d+$/, "Solo dígitos");

export const BarrioSchema = z
  .string()
  .min(2, "Barrio muy corto")
  .max(80)
  .transform(v => v.trim().toLowerCase());

export const ContactoSchema = z.object({
  cedula: CedulaSchema,
  nombre: z.string().min(2).max(120).optional(),
  telefono: TelefonoSchema.optional(),
  barrio: BarrioSchema.optional(),
  intencion_voto: z.enum(["positivo", "negativo", "indeciso", "desconocido"]).default("desconocido"),
  problematica: z.string().max(1000).optional(),
});

export const FiltroContactosSchema = z.object({
  barrio: z.string().max(80).optional(),
  intencion_voto: z.string().optional(),
  puesto: z.string().max(120).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(10).max(1000).default(100),
  cursor: z.string().optional(),
});

export const EnviarMensajeSchema = z.object({
  cedulas: z.array(CedulaSchema).min(1, "Mínimo 1 contacto"),
  texto: z.string().min(1).max(2000),
  instancia_id: z.string().min(1),
  nombre_campana: z.string().optional(),
});

export const ScanSchema = z.object({
  imageBase64: z.string().min(1, "La imagen es requerida"),
  filename: z.string().optional(),
});

export const FiltroLideresSchema = z.object({
  query: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export const LiderSchema = z.object({
  nombre: z.string().min(2, "Nombre muy corto").max(100),
  telefono: TelefonoSchema,
  barrio: BarrioSchema.optional(),
});

export const EventoSchema = z.object({
  titulo: z.string().min(3).max(200),
  tipo: z.string().min(1),
  estado: z.string().optional().default("borrador"),
  fecha_inicio: z.string().transform(v => new Date(v)),
  fecha_fin: z.string().transform(v => new Date(v)),
  lugar: z.string().min(1).max(200),
  barrio: z.string().optional(),
  asistentes_esperados: z.coerce.number().optional().default(0),
  presupuesto_estimado: z.coerce.number().optional(),
  notas: z.string().optional(),
  creado_por: z.string().optional().default("Coordinador Web"),
  lider_id: z.coerce.number().optional(),
});

export const FiltroEventosSchema = z.object({
  tipo: z.string().optional(),
  estado: z.string().optional(),
  barrio: z.string().optional(),
});

// Types derivados
export type Contacto = z.infer<typeof ContactoSchema>;
export type FiltroContactos = z.infer<typeof FiltroContactosSchema>;
export type EnviarMensaje = z.infer<typeof EnviarMensajeSchema>;
export type Scan = z.infer<typeof ScanSchema>;
export type FiltroLideres = z.infer<typeof FiltroLideresSchema>;
export type Lider = z.infer<typeof LiderSchema>;
export type Evento = z.infer<typeof EventoSchema>;
export type FiltroEventos = z.infer<typeof FiltroEventosSchema>;
