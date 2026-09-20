// Esta ruta comprueba permisos, asi que depende de quien la pide:
// no se puede generar en tiempo de compilacion.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS, depurarPermisos } from "@/lib/permisos";

/**
 * Cambia los permisos de una cuenta.
 *
 * Separada del alta a propósito: conceder acceso a alguien que ya trabaja en
 * la campaña es una decisión distinta de crearle la cuenta, y conviene que
 * deje su propio rastro en la auditoría.
 */
const CambioSchema = z.object({
  id: z.string().min(1),
  permisos: z.array(z.string()),
});

export async function PUT(req: NextRequest) {
  const control = await exigirPermiso(PERMISOS.USUARIOS_GESTIONAR);
  if (!control.ok) return control.respuesta;

  try {
    const parsed = CambioSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    /**
     * Nadie se amplía a sí mismo, ni siquiera teniendo `usuarios.gestionar`.
     *
     * Si una cuenta de administración se compromete, esto impide que el
     * atacante se conceda lo que le falte; necesitaría comprometer una
     * segunda cuenta. Y en el día a día obliga a que los cambios de acceso
     * los haga otra persona, que es como debe ser.
     */
    if (parsed.data.id === control.quien.usuarioId) {
      return NextResponse.json(
        {
          error:
            "No puedes cambiar tus propios permisos. Pídeselo a otra persona " +
            "con permiso de gestión de usuarios.",
        },
        { status: 400 }
      );
    }

    const destino = await prisma.user.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, username: true, permisos: true },
    });

    if (!destino) {
      return NextResponse.json({ error: "La cuenta no existe" }, { status: 404 });
    }

    // Lo que no esté en el catálogo se descarta en silencio.
    const permisos = depurarPermisos(parsed.data.permisos);

    const actualizado = await prisma.user.update({
      where: { id: destino.id },
      data: {
        permisos,
        /**
         * Quitar un permiso surte efecto de inmediato porque se leen de la
         * base en cada petición. Se sube igualmente la versión del token para
         * que la sesión se revalide cuanto antes.
         */
        tokenVersion: { increment: 1 },
      },
      select: { id: true, username: true, permisos: true },
    });

    /**
     * Se guarda el antes y el después: si un día alguien tiene un acceso que
     * no debería, esto dice quién se lo dio y cuándo.
     */
    await prisma.auditoria
      .create({
        data: {
          tabla: "User",
          registro_id: destino.id,
          accion: "permisos",
          usuario_id: control.quien.usuarioId,
          datos_antes: { permisos: destino.permisos },
          datos_despues: { permisos },
        },
      })
      .catch(() => {});

    logger.info("[usuarios] Permisos actualizados", {
      cuenta: actualizado.username,
      concedidos: permisos.length,
    });

    return NextResponse.json({ data: actualizado });
  } catch (error) {
    logger.error("[usuarios] Error cambiando permisos", { error: String(error) });
    return NextResponse.json({ error: "No se pudieron actualizar los permisos." }, { status: 500 });
  }
}
