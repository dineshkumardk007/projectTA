import 'server-only';
import { PrismaClient } from '@prisma/client';

/**
 * A single PrismaClient per process. Next.js hot-reloads modules in dev, so the
 * instance is stashed on `globalThis` to avoid exhausting the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
