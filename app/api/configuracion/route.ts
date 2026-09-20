// Depende de quien hace la peticion: no se puede generar en el build.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";
import {
  CLAVES_CONFIG,
  esClaveValida,
  esSensible,
  estadoConfiguracion,
  guardarConfig,
} from "@/lib/configuracion";

/**
 * Configuración del sistema: claves de API y ajustes.
 *
 * Exige `configuracion.gestionar`, no `agenda.editar`. Antes bastaba con poder
 * editar un evento para leer las claves de OpenAI y Gemini en claro: alguien
 * de logística tenía acceso a claves que se facturan por uso.
 */

/**
 * GET: el estado, nunca los valores.
 *
 * De las claves sensibles se dice si están configuradas, de dónde salen y sus
 * últimos cuatro caracteres. Una clave que no sale del servidor no se puede
 * copiar desde el navegador, ni queda en el historial de peticiones, ni
 * aparece en una captura de pantalla.
 */
export async function GET() {
  const permiso = await exigirPermiso(PERMISOS.CONFIGURACION_GESTIONAR);
  if (!permiso.ok) return permiso.respuesta;

  try {
    return NextResponse.json({ data: await estadoConfiguracion() });
  } catch (error) {
    logger.error("[configuracion] Error leyendo el estado", { error: String(error) });
    return NextResponse.json({ error: "No se pudo leer la configuración." }, { status: 500 });
  }
}

const GuardarSchema = z.record(z.string(), z.string().max(4000));

/** POST: guarda solo claves del catálogo, cifrando las sensibles. */
export async function POST(req: NextRequest) {
  const permiso = await exigirPermiso(PERMISOS.CONFIGURACION_GESTIONAR);
  if (!permiso.ok) return permiso.respuesta;

  try {
    const parsed = GuardarSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const guardadas: string[] = [];
    const rechazadas: string[] = [];

    for (const [clave, valor] of Object.entries(parsed.data)) {
      // Lo que no esté en el catálogo no entra: si no, la tabla de
      // configuración se convierte en un almacén de cualquier cosa.
      if (!esClaveValida(clave)) {
        rechazadas.push(clave);
        continue;
      }

      const definicion = CLAVES_CONFIG[clave];

      // Para las de lista cerrada, el valor tiene que ser uno de los previstos.
      if ("opciones" in definicion && !definicion.opciones.includes(valor as never)) {
        rechazadas.push(clave);
        continue;
      }

      // Un valor vacío borra la clave en vez de guardar una cadena vacía que
      // luego parecería «configurada».
      if (valor.trim() === "") {
        await prisma.configuracionGlobal.deleteMany({ where: { clave } });
        guardadas.push(clave);
        continue;
      }

      await guardarConfig(clave, valor.trim());
      guardadas.push(clave);
    }

    /**
     * Queda constancia de qué se cambió y quién: nunca el valor. Un registro
     * de auditoría que copie la clave de API la saca del cifrado.
     */
    if (guardadas.length > 0) {
      await prisma.auditoria
        .create({
          data: {
            tabla: "configuracion_global",
            accion: "configuracion",
            usuario_id: permiso.quien.usuarioId,
            datos_despues: {
              claves: guardadas,
              sensibles: guardadas.filter(esSensible).length,
            },
          },
        })
        .catch(() => {});

      logger.info("[configuracion] Claves actualizadas", {
        claves: guardadas,
        usuario: permiso.quien.username,
      });
    }

    return NextResponse.json({
      ok: true,
      guardadas,
      ...(rechazadas.length > 0 && {
        aviso: `No reconocidas y descartadas: ${rechazadas.join(", ")}`,
      }),
    });
  } catch (error) {
    logger.error("[configuracion] Error guardando", { error: String(error) });
    return NextResponse.json(
      { error: "No se pudo guardar la configuración." },
      { status: 500 }
    );
  }
}
