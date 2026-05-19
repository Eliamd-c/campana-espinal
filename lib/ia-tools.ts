import prisma from "@/lib/db";
import { buscarDocumentosSimilares } from "@/lib/embeddings";
import { generarAnalisis } from "@/lib/gemini";

// ═══════════════════════════════════════════════════════════════
// HERRAMIENTAS DEL AGENTE — Funciones que la IA puede invocar
// ═══════════════════════════════════════════════════════════════

/**
 * Definición de herramientas para Gemini Function Calling.
 * Este array se envía a la API de Gemini para que sepa qué puede hacer.
 */
export const TOOL_DEFINITIONS = [
  {
    name: "contar_contactos",
    description: "Cuenta cuántos contactos hay en la base de datos que cumplan ciertos criterios. Úsala para preguntas como '¿cuántos habilitados tenemos?' o '¿cuántos son de un barrio específico?'",
    parameters: {
      type: "object",
      properties: {
        barrio: { type: "string", description: "Filtrar por nombre de barrio (opcional)" },
        intencion_voto: { type: "string", description: "Filtrar por intención: 'positivo', 'negativo', 'indeciso', 'desconocido' (opcional)" },
        habilitados: { type: "boolean", description: "Si es true, solo cuenta los que tienen mesa asignada (no nula y no 'ERR')" },
        con_error: { type: "boolean", description: "Si es true, solo cuenta los que tienen mesa_numero = 'ERR'" },
        puesto_votacion: { type: "string", description: "Filtrar por nombre del puesto de votación (opcional, búsqueda parcial)" },
        sin_telefono: { type: "boolean", description: "Si es true, cuenta los contactos que NO tienen número de celular/teléfono registrado (campo telefono nulo o vacío)" },
      },
      required: []
    }
  },
  {
    name: "agrupar_por_campo",
    description: "Agrupa los contactos por un campo específico y muestra los conteos. Úsala para preguntas como '¿cuáles son los barrios con más registros?' o '¿qué puestos de votación tienen más gente?'",
    parameters: {
      type: "object",
      properties: {
        campo: {
          type: "string",
          enum: ["barrio", "intencion_voto", "puesto_votacion", "mesa_numero", "municipio"],
          description: "El campo por el cual agrupar los contactos"
        },
        top: { type: "number", description: "Cuántos grupos mostrar (por defecto 10)" },
        excluir_nulos: { type: "boolean", description: "Si es true, excluye registros donde el campo es nulo" },
        excluir_errores: { type: "boolean", description: "Si es true, excluye registros donde el campo contiene 'ERROR' o 'ERR'" },
      },
      required: ["campo"]
    }
  },
  {
    name: "buscar_muestra_contactos",
    description: "Obtiene una muestra de contactos que cumplan criterios específicos. Úsala para ver ejemplos concretos o validar datos.",
    parameters: {
      type: "object",
      properties: {
        barrio: { type: "string", description: "Filtrar por barrio (opcional)" },
        intencion_voto: { type: "string", description: "Filtrar por intención de voto (opcional)" },
        habilitados: { type: "boolean", description: "Solo los que tienen mesa asignada (opcional)" },
        limite: { type: "number", description: "Cuántos registros mostrar (máximo 10, por defecto 5)" },
      },
      required: []
    }
  },
  {
    name: "resumen_general",
    description: "Obtiene un resumen completo del estado actual de la campaña: totales, avance de habilitados, distribución de intención de voto. Úsala cuando te hagan preguntas generales de estado.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "buscar_documentos",
    description: "Busca semánticamente en los documentos de la campaña (Plan de Gobierno, estrategias, propuestas, discursos). Úsala cuando te pregunten sobre propuestas, planes, posiciones políticas o cualquier información cualitativa de la campaña.",
    parameters: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "La pregunta o tema a buscar en los documentos" },
        limite: { type: "number", description: "Cuántos fragmentos relevantes traer (por defecto 3)" }
      },
      required: ["consulta"]
    }
  },
  {
    name: "crear_campana",
    description: "Crea una nueva campaña de mensajes masivos. Úsala cuando el usuario pida enviar mensajes, crear campañas o invitar a personas.",
    parameters: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre de la campaña (Ej: Invitación Bingo)" },
        barrio: { type: "string", description: "Filtrar por barrio (opcional, 'Todos' por defecto)" },
        mensaje: { type: "string", description: "El texto del mensaje a enviar" },
      },
      required: ["nombre", "mensaje"]
    }
  },
  {
    name: "generar_variaciones_antiban",
    description: "Genera variaciones de un mensaje para evitar bloqueos. Úsala cuando el usuario apruebe generar la matriz anti-ban o pida variar un mensaje.",
    parameters: {
      type: "object",
      properties: {
        campana_id: { type: "number", description: "ID de la campaña a la que se aplicarán las variaciones" },
        mensaje_base: { type: "string", description: "El mensaje original a variar" },
      },
      required: ["campana_id", "mensaje_base"]
    }
  }
];

// ═══════════════════════════════════════════════════════════════
// EJECUTORES — Implementación real de cada herramienta
// ═══════════════════════════════════════════════════════════════

export async function ejecutarHerramienta(nombre: string, args: any): Promise<string> {
  try {
    switch (nombre) {

      case "contar_contactos": {
        const where: any = {};
        if (args.barrio) where.barrio = { contains: args.barrio, mode: "insensitive" };
        if (args.intencion_voto) where.intencion_voto = args.intencion_voto;
        if (args.puesto_votacion) where.puesto_votacion = { contains: args.puesto_votacion, mode: "insensitive" };
        if (args.habilitados === true) {
          where.AND = [{ mesa_numero: { not: null } }, { mesa_numero: { not: "ERR" } }];
        }
        if (args.con_error === true) where.mesa_numero = "ERR";
        if (args.sin_telefono === true) {
          where.OR = [
            { telefono: null },
            { telefono: "" }
          ];
        }

        const total = await prisma.contacto.count({ where });
        return JSON.stringify({ total, filtros_aplicados: args });
      }

      case "agrupar_por_campo": {
        const campo = args.campo as string;
        const top = Math.min(args.top || 10, 20);
        const where: any = {};
        if (args.excluir_nulos) where[campo] = { not: null };
        if (args.excluir_errores && (campo === "puesto_votacion" || campo === "mesa_numero")) {
          where[campo] = { ...where[campo], not: { contains: "ERR" } };
        }

        const grupos = await (prisma.contacto as any).groupBy({
          by: [campo],
          _count: { cedula: true },
          where,
          orderBy: { _count: { cedula: "desc" } },
          take: top
        });

        const resultado = grupos.map((g: any) => ({
          valor: g[campo] || "Sin datos",
          cantidad: g._count.cedula
        }));

        return JSON.stringify({ campo, grupos: resultado, total_grupos: resultado.length });
      }

      case "buscar_muestra_contactos": {
        const where: any = {};
        if (args.barrio) where.barrio = { contains: args.barrio, mode: "insensitive" };
        if (args.intencion_voto) where.intencion_voto = args.intencion_voto;
        if (args.habilitados === true) {
          where.AND = [{ mesa_numero: { not: null } }, { mesa_numero: { not: "ERR" } }];
        }
        const limite = Math.min(args.limite || 5, 10);

        const contactos = await prisma.contacto.findMany({
          where,
          take: limite,
          select: {
            cedula: true, nombre: true, barrio: true,
            puesto_votacion: true, mesa_numero: true, intencion_voto: true
          }
        });

        return JSON.stringify({ muestra: contactos, total_en_muestra: contactos.length });
      }

      case "resumen_general": {
        const [total, habilitados, errores, intenciones, puestos] = await Promise.all([
          prisma.contacto.count(),
          prisma.contacto.count({ where: { AND: [{ mesa_numero: { not: null } }, { mesa_numero: { not: "ERR" } }] } }),
          prisma.contacto.count({ where: { mesa_numero: "ERR" } }),
          prisma.contacto.groupBy({ by: ["intencion_voto"], _count: { cedula: true } }),
          prisma.contacto.groupBy({
            by: ["puesto_votacion"], _count: { cedula: true },
            where: { AND: [{ mesa_numero: { not: null } }, { mesa_numero: { not: "ERR" } }] },
            orderBy: { _count: { cedula: "desc" } }, take: 5
          })
        ]);

        const pendientes = total - habilitados - errores;
        const porcentajeAvance = total > 0 ? ((habilitados + errores) / total * 100).toFixed(1) : "0";

        return JSON.stringify({
          total_contactos: total,
          habilitados_confirmados: habilitados,
          no_votan_espinal: errores,
          pendientes_consultar: pendientes,
          porcentaje_consultado: `${porcentajeAvance}%`,
          intencion_voto: intenciones.map(i => ({ intencion: i.intencion_voto || "desconocido", cantidad: i._count.cedula })),
          top_puestos_votacion: puestos.map(p => ({ puesto: p.puesto_votacion, cantidad: p._count.cedula }))
        });
      }

      case "buscar_documentos": {
        const limite = Math.min(args.limite || 3, 6);
        const resultados = await buscarDocumentosSimilares(args.consulta, limite, 0.4);

        if (resultados.length === 0) {
          return JSON.stringify({ mensaje: "No se encontraron documentos relevantes para esta consulta.", resultados: [] });
        }

        return JSON.stringify({
          total_encontrados: resultados.length,
          fragmentos: resultados.map(r => ({
            titulo: r.titulo,
            categoria: r.categoria,
            relevancia: (r.similarity * 100).toFixed(1) + "%",
            contenido: r.contenido.substring(0, 600) + (r.contenido.length > 600 ? "..." : "")
          }))
        });
      }

      case "crear_campana": {
        const { nombre, barrio, mensaje } = args;
        
        // 1. Crear la campaña en la base de datos
        const campana = await prisma.campana.create({
          data: {
            nombre: nombre,
            texto_base: mensaje,
            estado: "creada",
          }
        });

        // 2. Obtener contactos de la audiencia
        let where: any = {};
        if (barrio && barrio !== "Todos") {
          where.barrio = { contains: barrio, mode: "insensitive" };
        }
        
        const totalContactos = await prisma.contacto.count({ where });

        return JSON.stringify({
          mensaje: `Campaña '${nombre}' creada exitosamente.`,
          campana_id: campana.id,
          total_contactos: totalContactos,
          pregunta_siguiente: "¿Deseas que genere las variaciones anti-ban para esta campaña?"
        });
      }

      case "generar_variaciones_antiban": {
        const { campana_id, mensaje_base } = args;
        
        // Generar variaciones usando Gemini
        const prompt = `Genera 5 formas diferentes de decir el siguiente mensaje para una campaña política. Deben ser variaciones sutiles pero que cambien la estructura.
        Mensaje original: "${mensaje_base}"
        Devuelve SOLO un array JSON de strings.`;
        
        const respuesta = await generarAnalisis(prompt);
        
        let variaciones: string[] = [];
        try {
          const jsonStr = respuesta.replace(/```json/g, "").replace(/```/g, "").trim();
          variaciones = JSON.parse(jsonStr);
        } catch (e) {
          variaciones = respuesta.split("\n").filter((l: string) => l.trim().length > 10);
        }

        // Guardar en la DB
        const dataToInsert = variaciones.map(v => ({
          campana_id: campana_id,
          texto: v.trim()
        }));

        await prisma.campanaVariacion.createMany({
          data: dataToInsert
        });

        return JSON.stringify({
          mensaje: `Se han generado y guardado ${variaciones.length} variaciones para la campaña.`,
          total_variaciones: variaciones.length
        });
      }

      default:
        return JSON.stringify({ error: `Herramienta '${nombre}' no reconocida.` });
    }
  } catch (error: any) {
    return JSON.stringify({ error: `Error ejecutando '${nombre}': ${error.message}` });
  }
}
