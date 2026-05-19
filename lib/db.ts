import { PrismaClient } from "@prisma/client";

// Patrón oficial de Prisma para evitar múltiples instancias en desarrollo (hot reload)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
