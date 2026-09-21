// Depende de quien hace la peticion: no se puede generar en el build.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { registrarAuditoria } from "@/lib/audit";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";
import { normalizarNumero } from "@/lib/whatsapp/autorizados";

/**
 * Los números que pueden hablarle a una línea.
 *
 * Es la lista que hace inofensivo tener un bot en WhatsApp: la línea está en
 * un sitio donde cualquiera con el número puede escribir, y esto es lo único
 * que separa a quien debe de quien no.
 */

const AltaSchema = z.object({
  /** Se acepta como lo escriba una persona; se guarda normalizado. */
  numero: z.string().min(7, "El número es muy corto").max(30),
  nombre: z.string().max(80).optional(),
  /** La cuenta del panel con cuyos permisos responderá el agente. */
  usuario_id: z.string().min(1, "Elige la cuenta a la que corresponde"),
});

function lineaDe(params: { id: string }): number | null {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * GET: la lista de la línea, y las cuentas disponibles para asociar.
 *
 * Se devuelven también los nombres de usuario del panel. Es una cesión
 * pequeña pero consciente: sin ella no se puede elegir a quién corresponde un
 * número, y quien ve esto ya tiene permiso para vincular la línea de WhatsApp
 * de la campaña.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const permiso = await exigirPermiso(PERMISOS.WHATSAPP_GESTIONAR);
  if (!permiso.ok) return permiso.respuesta;

  const lineaId = lineaDe(params);
  if (!lineaId) return NextResponse.json({ error: "Línea no válida" }, { status: 400 });

  try {
    const [autorizados, cuentas] = await Promise.all([
      prisma.whatsappAutorizado.findMany({
        where: { linea_id: lineaId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          numero: true,
          nombre: true,
          activo: true,
          usuario_id: true,
          fecha_alta: true,
          usuario: { select: { username: true, activo: true } },
        },
      }),
      prisma.user.findMany({
        where: { activo: true },
        orderBy: { username: "asc" },
        select: { id: true, username: true, name: true },
      }),
    ]);

    return NextResponse.json({ data: { autorizados, cuentas } });
  } catch (error) {
    logger.error("[whatsapp] Error leyendo autorizados", { lineaId, error: String(error) });
    return NextResponse.json({ error: "No se pudo leer la lista." }, { status: 500 });
  }
}

/** POST: autorizar un número en esta línea. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const permiso = await exigirPermiso(PERMISOS.WHATSAPP_GESTIONAR);
  if (!permiso.ok) return permiso.respuesta;

  const lineaId = lineaDe(params);
  if (!lineaId) return NextResponse.json({ error: "Línea no válida" }, { status: 400 });

  const cuerpo = AltaSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) {
    return NextResponse.json(
      { error: cuerpo.error.issues[0]?.message ?? "Datos no válidos" },
      { status: 400 }
    );
  }

  const numero = normalizarNumero(cuerpo.data.numero);
  if (numero.length < 10) {
    return NextResponse.json(
      { error: "Escribe el número con indicativo de país, por ejemplo 573133288298." },
      { status: 400 }
    );
  }

  const cuenta = await prisma.user.findUnique({
    where: { id: cuerpo.data.usuario_id },
    select: { id: true, username: true, activo: true },
  });
  if (!cuenta || !cuenta.activo) {
    return NextResponse.json({ error: "Esa cuenta no está disponible" }, { status: 400 });
  }

  try {
    const fila = await prisma.whatsappAutorizado.create({
      data: {
        linea_id: lineaId,
        numero,
        nombre: cuerpo.data.nombre?.trim() || null,
        usuario_id: cuenta.id,
        autorizado_por: permiso.quien.username ?? permiso.quien.usuarioId,
      },
      select: { id: true, numero: true, nombre: true },
    });

    /**
     * Se audita porque autorizar un número es dar acceso a los datos de la
     * campaña desde fuera del panel. Conviene poder contestar «quién metió
     * este número» sin depender de la memoria de nadie.
     */
    await registrarAuditoria(permiso.quien.usuarioId, "whatsapp_autorizado_alta", {
      linea_id: lineaId,
      numero,
      como: cuenta.username,
    });

    return NextResponse.json({ data: fila }, { status: 201 });
  } catch (error) {
    if (String(error).includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Ese número ya está en la lista de esta línea." },
        { status: 409 }
      );
    }
    logger.error("[whatsapp] Error autorizando número", { lineaId, error: String(error) });
    return NextResponse.json({ error: "No se pudo autorizar el número." }, { status: 500 });
  }
}

/** DELETE: quitar un número de la lista. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const permiso = await exigirPermiso(PERMISOS.WHATSAPP_GESTIONAR);
  if (!permiso.ok) return permiso.respuesta;

  const lineaId = lineaDe(params);
  if (!lineaId) return NextResponse.json({ error: "Línea no válida" }, { status: 400 });

  const autorizadoId = Number(req.nextUrl.searchParams.get("autorizado_id"));
  if (!Number.isInteger(autorizadoId) || autorizadoId <= 0) {
    return NextResponse.json({ error: "Falta indicar cuál quitar" }, { status: 400 });
  }

  try {
    /**
     * El borrado exige que la fila pertenezca a esta línea. Sin esa condición,
     * un identificador de otra línea también valdría y la ruta serviría para
     * desautorizar números de cualquier parte.
     */
    const { count } = await prisma.whatsappAutorizado.deleteMany({
      where: { id: autorizadoId, linea_id: lineaId },
    });

    if (count === 0) {
      return NextResponse.json({ error: "No está en la lista de esta línea" }, { status: 404 });
    }

    await registrarAuditoria(permiso.quien.usuarioId, "whatsapp_autorizado_baja", {
      linea_id: lineaId,
      autorizado_id: autorizadoId,
    });

    return NextResponse.json({ data: { quitado: autorizadoId } });
  } catch (error) {
    logger.error("[whatsapp] Error quitando autorizado", { lineaId, error: String(error) });
    return NextResponse.json({ error: "No se pudo quitar el número." }, { status: 500 });
  }
}
