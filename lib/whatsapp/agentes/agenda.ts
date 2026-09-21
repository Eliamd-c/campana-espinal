import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { PERMISOS } from "@/lib/permisos";
import { tienePermiso } from "@/lib/permisos";
import { ejecutarAgente, type DefinicionHerramienta, type TurnoNeutro } from "@/lib/ia/agente";
import { AltaAgendamientoSchema, crearAgendamiento } from "@/lib/agenda/crear";
import { AVISO_CONTENIDO_EXTERNO, envolverNoConfiable } from "@/lib/ia/sanitizar";
import type { Autorizado } from "../autorizados";

/**
 * El agente de agenda, el que atiende por WhatsApp.
 *
 * Trabaja con dos límites que no negocia:
 *
 *  1. **Lo que crea nace como borrador.** Nunca confirmado, nunca cupo. Un
 *     cupo aparta sitio en la agenda de la campaña, y confirmar es lo que hace
 *     que alguien cuente con una reunión que quizá no existe. Confirmar sigue
 *     siendo del panel, donde se ve la ficha entera.
 *  2. **Actúa con los permisos de quien escribe.** El número está atado a una
 *     cuenta; si esa cuenta no puede editar la agenda, el agente tampoco puede
 *     por ella, por mucho que se lo pidan con educación.
 */

/** Zona horaria de la campaña, para que «mañana» signifique lo que debe. */
const ZONA = "America/Bogota";

function hoyEnBogota(): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: ZONA,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
}

const HERRAMIENTAS: DefinicionHerramienta[] = [
  {
    name: "listar_plantillas",
    description:
      "Las plantillas de agenda disponibles, con sus campos. Úsala antes de crear algo para elegir la que corresponde al tipo de acto.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "consultar_agenda",
    description:
      "Lo que hay agendado entre dos fechas. Devuelve título, fecha, lugar, estado y qué falta por confirmar.",
    parameters: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Fecha ISO, por ejemplo 2026-09-21" },
        hasta: { type: "string", description: "Fecha ISO" },
      },
      required: ["desde", "hasta"],
    },
  },
  {
    name: "crear_agendamiento",
    description:
      "Crea un agendamiento EN BORRADOR. Úsala solo después de que la persona haya confirmado los datos que le resumiste. Lo que no sepas, déjalo vacío y anótalo en campos_por_confirmar: un dato inventado es peor que un hueco.",
    parameters: {
      type: "object",
      properties: {
        plantilla_id: { type: "string", description: "Id de listar_plantillas" },
        titulo: { type: "string" },
        fecha_inicio: {
          type: "string",
          description: "Fecha y hora ISO con zona, por ejemplo 2026-09-25T18:30:00-05:00",
        },
        barrio: { type: "string" },
        direccion: { type: "string" },
        responsable: { type: "string" },
        asistentes_esperados: { type: "number" },
        notas: { type: "string" },
        campos_por_confirmar: {
          type: "array",
          description: "Nombres de los datos que faltan o que no quedaron claros.",
          items: { type: "string" },
        },
        recursos_solicitados: {
          type: "array",
          description: "Lo que se pide: sillas, sonido, tarima, refrigerios.",
          items: {
            type: "object",
            properties: {
              item: { type: "string" },
              cantidad: { type: "number" },
            },
          },
        },
      },
      required: ["plantilla_id", "titulo", "fecha_inicio"],
    },
  },
];

/** Formato corto, para que quepa en un mensaje de WhatsApp. */
function fecha(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: ZONA,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

async function ejecutarHerramienta(
  nombre: string,
  args: Record<string, unknown>,
  quien: Autorizado
): Promise<string> {
  if (nombre === "listar_plantillas") {
    const plantillas = await prisma.plantillaAgenda.findMany({
      where: { activa: true },
      select: { id: true, nombre: true, descripcion: true, campos: true },
    });
    return JSON.stringify(plantillas);
  }

  if (nombre === "consultar_agenda") {
    if (!tienePermiso(quien.permisos, PERMISOS.AGENDA_VER)) {
      return "Esta persona no tiene permiso para ver la agenda.";
    }

    const desde = new Date(String(args.desde));
    const hasta = new Date(String(args.hasta));
    if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) {
      return "Fechas no válidas.";
    }

    const filas = await prisma.agendamiento.findMany({
      where: { fecha_inicio: { gte: desde, lte: hasta } },
      orderBy: { fecha_inicio: "asc" },
      take: 30,
      select: {
        id: true,
        titulo: true,
        fecha_inicio: true,
        barrio: true,
        direccion: true,
        estado: true,
        plantilla: { select: { nombre: true } },
        campos_por_confirmar: { select: { campo: true } },
      },
    });

    return JSON.stringify(
      filas.map((f) => ({
        titulo: f.titulo,
        cuando: fecha(f.fecha_inicio),
        tipo: f.plantilla.nombre,
        barrio: f.barrio,
        direccion: f.direccion,
        estado: f.estado,
        falta_por_confirmar: f.campos_por_confirmar.map((c) => c.campo),
      }))
    );
  }

  if (nombre === "crear_agendamiento") {
    if (!tienePermiso(quien.permisos, PERMISOS.AGENDA_EDITAR)) {
      return "Esta persona no tiene permiso para crear agendamientos.";
    }

    const recursos = Array.isArray(args.recursos_solicitados)
      ? (args.recursos_solicitados as { item?: string; cantidad?: number }[])
          .filter((r) => r?.item)
          .map((r) => ({
            item: String(r.item),
            cantidad_solicitada: typeof r.cantidad === "number" ? r.cantidad : null,
          }))
      : [];

    const porConfirmar = Array.isArray(args.campos_por_confirmar)
      ? (args.campos_por_confirmar as unknown[]).map((c) => ({ campo: String(c).slice(0, 60) }))
      : [];

    const parsed = AltaAgendamientoSchema.safeParse({
      plantilla_id: args.plantilla_id,
      titulo: args.titulo,
      fecha_inicio: args.fecha_inicio,
      barrio: args.barrio || undefined,
      direccion: args.direccion || undefined,
      responsable: args.responsable || undefined,
      asistentes_esperados: args.asistentes_esperados ?? undefined,
      notas: args.notas || undefined,
      /**
       * Aquí está el límite, y por eso se fija aquí y no se toma de lo que
       * diga el modelo: nace en borrador pase lo que pase.
       */
      estado: "borrador",
      campos_por_confirmar: porConfirmar,
      recursos_solicitados: recursos,
    });

    if (!parsed.success) {
      return `No se pudo crear: ${parsed.error.issues.map((i) => i.message).join("; ")}`;
    }

    const resultado = await crearAgendamiento(parsed.data, quien.usuarioId!);
    if (!resultado.ok) return `No se pudo crear: ${resultado.error}`;

    const creado = resultado.agendamiento;
    logger.info("[agenda] Creado desde WhatsApp", {
      id: creado.id,
      usuario: quien.usuarioId,
      numero: quien.numero,
    });

    return JSON.stringify({
      creado: true,
      titulo: creado.titulo,
      cuando: fecha(creado.fecha_inicio),
      estado: creado.estado,
      falta_por_confirmar: creado.campos_por_confirmar.map((c) => c.campo),
    });
  }

  return `Herramienta desconocida: ${nombre}`;
}

const INSTRUCCIONES = `Eres el asistente de agenda de la campaña de El Espinal, y atiendes por WhatsApp.

Hoy es ${"{{HOY}}"} (zona horaria de Colombia).

Cómo trabajas:
- Hablas corto y claro, como en un chat. Nada de listas largas ni de formato Markdown: WhatsApp no lo pinta.
- Antes de crear algo, RESUME lo que entendiste y pregunta si está bien. Solo creas cuando la persona lo confirma.
- Al resumir, di siempre qué plantilla elegiste ("lo registro como Mitin") para que te puedan corregir.
- Lo que no te digan, NO te lo inventes: déjalo vacío y anótalo en campos_por_confirmar. Un dato inventado que se guarda es peor que un hueco vacío, porque el hueco se ve y el dato inventado no.
- Todo lo que creas nace como BORRADOR. Díselo: queda anotado, y para confirmarlo hay que entrar al panel. Tú no puedes confirmar nada.
- Si te piden confirmar, cancelar o cambiar algo ya agendado, explica que eso se hace desde el panel.
- Si la petición no tiene nada que ver con la agenda, dilo con naturalidad y no lo intentes con las herramientas.`;

/**
 * Responde a un mensaje de WhatsApp.
 *
 * El texto de la persona va envuelto como contenido no confiable. No es
 * desconfianza hacia quien escribe: es que un mensaje reenviado puede traer
 * dentro instrucciones escritas para el modelo, y la envoltura marca dónde
 * empieza lo que es un dato y no una orden.
 */
export async function responderAgenda(
  texto: string,
  historial: TurnoNeutro[],
  quien: Autorizado,
  deVoz = false
): Promise<string> {
  /**
   * Cuando el mensaje viene de una nota de voz, el agente tiene que saberlo.
   * Una transcripción se equivoca justo donde más duele: nombres de barrio,
   * direcciones y cifras. El aviso hace que los repita para que se los
   * confirmen, en vez de darlos por buenos.
   */
  const origen = deVoz
    ? "\nEl mensaje llega de una NOTA DE VOZ transcrita: puede traer errores en " +
      "nombres propios, direcciones y cifras. Repite esos datos al confirmar y " +
      "pide que te los corrijan si no cuadran.\n"
    : "";

  const pregunta = `${INSTRUCCIONES.replace("{{HOY}}", hoyEnBogota())}
${origen}

${AVISO_CONTENIDO_EXTERNO}

Mensaje de ${quien.nombre || "la persona"}:
${envolverNoConfiable(texto, { descripcion: "mensaje-whatsapp", maximo: 2000 })}`;

  return ejecutarAgente({
    pregunta,
    historial,
    herramientas: HERRAMIENTAS,
    ejecutar: (nombre, argumentos) => ejecutarHerramienta(nombre, argumentos, quien),
  });
}
