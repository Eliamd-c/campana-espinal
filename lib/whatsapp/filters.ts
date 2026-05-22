import { Prisma } from "@prisma/client";

export function buildContactoFilters(params: Record<string, string>): Prisma.ContactoWhereInput {
  const filters: Prisma.ContactoWhereInput = {
    AND: [
      // Barrio
      params.barrio && params.barrio !== "Todos"
        ? { barrio: params.barrio }
        : {},
      
      // Intención de voto
      params.intencion_voto && params.intencion_voto !== "todos"
        ? { intencion_voto: params.intencion_voto }
        : {},
      
      // Búsqueda por nombre/cédula
      params.q
        ? {
            OR: [
              { nombre: { contains: params.q, mode: "insensitive" } },
              { cedula: { contains: params.q } }
            ]
          }
        : {},
      
      // Puesto de votación
      params.puesto_votacion
        ? { puesto_votacion: params.puesto_votacion }
        : {},
      
      // Rango de fechas
      params.fecha_desde || params.fecha_hasta
        ? {
            fecha_registro: {
              ...(params.fecha_desde && { gte: new Date(params.fecha_desde) }),
              ...(params.fecha_hasta && { lte: new Date(params.fecha_hasta) }),
            }
          }
        : {},
      
      // Excluir campanas anteriores
      params.excluir_campana_id
        ? {
            mensajes: {
              none: {
                campana_id: parseInt(params.excluir_campana_id),
                estado: "enviado"
              }
            }
          }
        : {},
    ].filter(f => Object.keys(f).length > 0),
  };
  
  return filters;
}
