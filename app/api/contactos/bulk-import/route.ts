import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { bulkUpsertContactos } from "@/lib/bulk-operations";
import { recalcularScoreLider } from "@/lib/score";
import { handleError } from "@/lib/api/errors";
import { checkRateLimit, rateLimiters } from "@/lib/ratelimit";
import { invalidarTodoDashboard } from "@/lib/cache-strategies";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

export const dynamic = "force-dynamic";

/**
 * Crea la reunión de una planilla y devuelve su id y el concejal congelado.
 *
 * El concejal no se deduce en vivo del líder: se COPIA aquí, al digitalizar.
 * Si no viene uno explícito, se toma el del líder en este momento. Así, si el
 * líder cambia de concejal más adelante, esta reunión conserva a quién se le
 * acreditó. Un barrio o una fecha en blanco no son un problema; un líder que no
 * existe sí, y entonces no se crea la reunión.
 */
async function crearReunionDePlanilla(reunion: {
  lider_id: number;
  concejal_id?: number | null;
  barrio?: string;
  fecha?: string;
  titulo?: string;
}): Promise<{ id: number; lider_id: number } | null> {
  const lider = await prisma.lider.findUnique({
    where: { id: reunion.lider_id },
    select: { id: true, concejal_id: true },
  });
  if (!lider) return null;

  const concejalCongelado =
    reunion.concejal_id !== undefined && reunion.concejal_id !== null
      ? reunion.concejal_id
      : lider.concejal_id;

  const creada = await prisma.reunion.create({
    data: {
      titulo: reunion.titulo?.trim() || "Planilla digitalizada",
      fecha: reunion.fecha ? new Date(reunion.fecha) : new Date(),
      barrio: reunion.barrio?.trim() || undefined,
      lider_id: lider.id,
      concejal_id: concejalCongelado ?? undefined,
    },
    select: { id: true },
  });

  return { id: creada.id, lider_id: lider.id };
}

/**
 * POST /api/contactos/bulk-import
 * Body: {
 *   contactos: Array<{cedula, nombre, telefono, barrio, intencion_voto}>,
 *   reunion?: { lider_id, concejal_id?, barrio?, fecha?, titulo? }
 * }
 *
 * Si viene `reunion`, se crea la reunión de la planilla y los contactos nuevos
 * quedan colgados de ella (y de su líder/concejal). Sin `reunion`, se comporta
 * como antes: solo guarda contactos.
 */
export async function POST(req: NextRequest) {
  try {
    // Sin permiso para capturar contactos, no se pasa de aqui.
    const permiso = await exigirPermiso(PERMISOS.CONTACTOS_CAPTURAR);
    if (!permiso.ok) return permiso.respuesta;

    // 1. Rate limiting
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const { success } = await checkRateLimit(rateLimiters.api, ip, "api");
    if (!success) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes en poco tiempo. Intente de nuevo más tarde." },
        { status: 429 }
      );
    }

    // 2. Parsear y validar body
    const body = await req.json().catch(() => ({}));
    const { contactos, reunion } = body;

    if (!contactos || !Array.isArray(contactos)) {
      return NextResponse.json(
        { error: "Se requiere un arreglo 'contactos' válido en el cuerpo de la petición." },
        { status: 400 }
      );
    }

    if (contactos.length === 0) {
      return NextResponse.json(
        { error: "El arreglo 'contactos' está vacío." },
        { status: 400 }
      );
    }

    // Limitar tamaño de lote para evitar timeouts en Vercel/Next Server
    if (contactos.length > 5000) {
      return NextResponse.json(
        { error: "El límite máximo por lote de importación es de 5,000 contactos." },
        { status: 400 }
      );
    }

    console.log(`[BulkImport] 📥 Recibidos ${contactos.length} contactos para importación masiva...`);

    // 3. Si la planilla trae reunión, se crea primero para colgar de ella los
    //    contactos nuevos. Un líder inexistente no corta el guardado: se avisa
    //    y se guardan los contactos sin atribución, que es mejor que perderlos.
    let reunionCreada: { id: number; lider_id: number } | null = null;
    let avisoReunion: string | undefined;
    if (reunion && Number.isInteger(reunion.lider_id)) {
      reunionCreada = await crearReunionDePlanilla(reunion);
      if (!reunionCreada) {
        avisoReunion = "El líder indicado no existe; los contactos se guardaron sin atribución de reunión.";
      }
    }

    // 4. Procesar upsert en lotes controlados (con el contexto de la reunión).
    const resultados = await bulkUpsertContactos(
      contactos,
      reunionCreada ? { reunion_id: reunionCreada.id, lider_id: reunionCreada.lider_id } : undefined
    );

    // 5. Si se creó la reunión, cerrar sus totales y recalcular el score del
    //    líder con la foto ya completa.
    if (reunionCreada) {
      const total = resultados.creados + resultados.actualizados;
      const porcentajeTrasteo = total > 0 ? (resultados.actualizados / total) * 100 : 0;
      await prisma.reunion.update({
        where: { id: reunionCreada.id },
        data: {
          total_asistentes: total,
          nuevos_unicos: resultados.creados,
          repetidos: resultados.actualizados,
          alerta_trasteo: porcentajeTrasteo > 60,
        },
      });
      await recalcularScoreLider(reunionCreada.lider_id);
    }

    // 6. Invalidar todos los cachés del dashboard
    await invalidarTodoDashboard();

    return NextResponse.json({
      data: { ...resultados, reunion_id: reunionCreada?.id, aviso: avisoReunion },
      message: `Procesamiento masivo completado. Creados: ${resultados.creados}, Actualizados: ${resultados.actualizados}, Fallidos: ${resultados.errores.length}`
    });

  } catch (error) {
    return handleError(error, "POST /api/contactos/bulk-import");
  }
}
