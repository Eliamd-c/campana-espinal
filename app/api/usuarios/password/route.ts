import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { cambiarPropiaContrasena } from "@/lib/usuarios";
import { logger } from "@/lib/logger";
import prisma from "@/lib/db";

/**
 * Cambio de la propia contraseña.
 *
 * Cada persona cambia la suya y solo la suya: el identificador sale de la
 * sesión, nunca del cuerpo de la petición. Si viniera del cuerpo, cualquier
 * coordinador podría cambiar la contraseña del administrador.
 */
const CambioSchema = z.object({
  actual: z.string().min(1, "Escribe tu contraseña actual").max(200),
  nueva: z.string().min(1, "Escribe la nueva contraseña").max(200),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const idUsuario = (session?.user as any)?.id;

    if (!idUsuario) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const parsed = CambioSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos incompletos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const resultado = await cambiarPropiaContrasena(
      idUsuario,
      parsed.data.actual,
      parsed.data.nueva
    );

    if (!resultado.ok) {
      logger.warn("[usuarios] Cambio de contraseña rechazado", {
        motivo: resultado.motivo,
      });
      return NextResponse.json({ error: resultado.motivo }, { status: 400 });
    }

    // Queda constancia de quién cambió su credencial y cuándo.
    await prisma.auditoria
      .create({
        data: {
          tabla: "User",
          registro_id: String(idUsuario),
          accion: "password",
          usuario_id: String(idUsuario),
        },
      })
      .catch(() => {
        // La auditoría no puede impedir el cambio de contraseña.
      });

    logger.info("[usuarios] Contraseña cambiada");

    return NextResponse.json({
      ok: true,
      mensaje: "Contraseña actualizada. Vuelve a entrar con la nueva.",
    });
  } catch (error) {
    logger.error("[usuarios] Error cambiando la contraseña", { error: String(error) });
    return NextResponse.json({ error: "No se pudo cambiar la contraseña." }, { status: 500 });
  }
}
