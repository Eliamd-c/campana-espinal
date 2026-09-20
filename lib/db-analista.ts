import { PrismaClient } from "@prisma/client";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Conexión con la que se ejecutan las consultas que redacta el modelo.
 *
 * Si `DATABASE_URL_ANALISTA` está configurada, apunta al rol `analista_ia`,
 * que solo tiene `GRANT SELECT` sobre las tablas de campaña (ver
 * `prisma/migrations/manual/002_rol_analista_solo_lectura.sql`). Ese rol es la
 * única defensa que no depende de acertar con un validador de texto: aunque
 * `lib/sql-guard.ts` tenga un agujero, PostgreSQL le niega el acceso a las
 * credenciales de WhatsApp y a las sesiones.
 *
 * Si no está configurada, se usa la conexión normal y las consultas siguen
 * protegidas por el validador y por la transacción READ ONLY. Es el estado
 * anterior: peor, pero no roto. Se avisa una sola vez para que la ausencia no
 * pase inadvertida.
 */

const globalParaAnalista = globalThis as unknown as {
  prismaAnalista?: PrismaClient;
  avisoAnalistaEmitido?: boolean;
};

export function clienteAnalista(): PrismaClient {
  const url = process.env.DATABASE_URL_ANALISTA;

  if (!url) {
    if (!globalParaAnalista.avisoAnalistaEmitido) {
      globalParaAnalista.avisoAnalistaEmitido = true;
      logger.warn(
        "[ia] DATABASE_URL_ANALISTA no configurada: las consultas del asistente " +
          "usan la conexión principal. Solo las contienen sql-guard y la " +
          "transacción READ ONLY. Ver hallazgo #2b del backlog de seguridad."
      );
    }
    return prisma;
  }

  if (!globalParaAnalista.prismaAnalista) {
    globalParaAnalista.prismaAnalista = new PrismaClient({
      datasources: { db: { url } },
    });
  }

  return globalParaAnalista.prismaAnalista;
}
