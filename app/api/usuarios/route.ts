import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  COSTE_BCRYPT,
  ROLES,
  normalizarUsuario,
  revisarFortaleza,
} from "@/lib/usuarios";

/**
 * Gestión de usuarios del panel, solo para administradores.
 *
 * Existe para poder **revocar** accesos: cuando alguien deja el equipo de
 * campaña, hay que poder cerrarle la puerta sin cambiar la contraseña de
 * todos los demás. Mientras solo hubo una cuenta compartida, eso era
 * imposible y tampoco se sabía quién hacía qué.
 */

async function exigirAdmin() {
  const session = await getServerSession(authOptions);
  const usuario = session?.user as any;

  if (!usuario?.id) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (usuario.role !== "admin") {
    return { error: NextResponse.json({ error: "Se requiere rol de administrador" }, { status: 403 }) };
  }
  return { idAdmin: usuario.id as string };
}

/** GET: lista de usuarios. Nunca incluye hashes de contraseña. */
export async function GET() {
  const control = await exigirAdmin();
  if ("error" in control) return control.error;

  const usuarios = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      activo: true,
      ultimoAcceso: true,
    },
    orderBy: { username: "asc" },
  });

  return NextResponse.json({ data: usuarios });
}

const AltaSchema = z.object({
  username: z.string().min(3, "Mínimo 3 caracteres").max(64),
  nombre: z.string().max(120).optional(),
  rol: z.enum(ROLES),
  password: z.string().min(1, "La contraseña es obligatoria").max(200),
});

/** POST: alta de un usuario nuevo. */
export async function POST(req: NextRequest) {
  const control = await exigirAdmin();
  if ("error" in control) return control.error;

  try {
    const parsed = AltaSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Siempre en minúsculas: si no, `Admin` y `admin` serían cuentas
    // distintas y revocar una dejaría la otra viva.
    const username = normalizarUsuario(parsed.data.username);

    if (!/^[a-z0-9._-]+$/.test(username)) {
      return NextResponse.json(
        { error: "El usuario solo puede tener letras, números, punto, guion y guion bajo." },
        { status: 400 }
      );
    }

    const problema = revisarFortaleza(parsed.data.password, username);
    if (problema) {
      return NextResponse.json({ error: problema }, { status: 400 });
    }

    const existente = await prisma.user.findUnique({ where: { username } });
    if (existente) {
      return NextResponse.json({ error: "Ese usuario ya existe." }, { status: 409 });
    }

    const creado = await prisma.user.create({
      data: {
        username,
        name: parsed.data.nombre?.trim() || username,
        role: parsed.data.rol,
        passwordHash: await bcrypt.hash(parsed.data.password, COSTE_BCRYPT),
        activo: true,
      },
      select: { id: true, username: true, role: true, activo: true },
    });

    await prisma.auditoria
      .create({
        data: {
          tabla: "User",
          registro_id: creado.id,
          accion: "alta",
          usuario_id: control.idAdmin,
          datos_despues: { username, rol: parsed.data.rol },
        },
      })
      .catch(() => {});

    logger.info("[usuarios] Usuario creado", { username, rol: parsed.data.rol });

    return NextResponse.json({ data: creado }, { status: 201 });
  } catch (error) {
    logger.error("[usuarios] Error creando usuario", { error: String(error) });
    return NextResponse.json({ error: "No se pudo crear el usuario." }, { status: 500 });
  }
}

const CambioEstadoSchema = z.object({
  id: z.string().min(1),
  activo: z.boolean(),
});

/**
 * PATCH: activa o desactiva una cuenta.
 *
 * Se desactiva en vez de borrar para no perder el rastro de auditoría de lo
 * que esa persona hizo mientras trabajaba en la campaña.
 */
export async function PATCH(req: NextRequest) {
  const control = await exigirAdmin();
  if ("error" in control) return control.error;

  try {
    const parsed = CambioEstadoSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    // Un administrador no puede desactivarse a sí mismo: si es el último,
    // nadie podría volver a entrar a gestionar usuarios.
    if (parsed.data.id === control.idAdmin && !parsed.data.activo) {
      return NextResponse.json(
        { error: "No puedes desactivar tu propia cuenta." },
        { status: 400 }
      );
    }

    if (!parsed.data.activo) {
      const adminsActivos = await prisma.user.count({
        where: { role: "admin", activo: true },
      });
      const objetivo = await prisma.user.findUnique({ where: { id: parsed.data.id } });

      if (objetivo?.role === "admin" && adminsActivos <= 1) {
        return NextResponse.json(
          { error: "Debe quedar al menos un administrador activo." },
          { status: 400 }
        );
      }
    }

    const actualizado = await prisma.user.update({
      where: { id: parsed.data.id },
      data: {
        activo: parsed.data.activo,
        // Subir la versión invalida cualquier sesión abierta de esa persona.
        // Desactivar sin esto la dejaba dentro hasta ocho horas más.
        ...(parsed.data.activo ? {} : { tokenVersion: { increment: 1 } }),
      },
      select: { id: true, username: true, activo: true },
    });

    await prisma.auditoria
      .create({
        data: {
          tabla: "User",
          registro_id: actualizado.id,
          accion: parsed.data.activo ? "activar" : "desactivar",
          usuario_id: control.idAdmin,
        },
      })
      .catch(() => {});

    logger.info("[usuarios] Estado de cuenta cambiado", {
      username: actualizado.username,
      activo: actualizado.activo,
    });

    return NextResponse.json({ data: actualizado });
  } catch (error) {
    logger.error("[usuarios] Error cambiando el estado", { error: String(error) });
    return NextResponse.json({ error: "No se pudo actualizar el usuario." }, { status: 500 });
  }
}
