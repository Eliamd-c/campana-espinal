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
