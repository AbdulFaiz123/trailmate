import { PrismaClient } from "@prisma/client";

// In dev, Next.js hot-reloads modules. Without this, every reload would open a
// new database connection. We keep one client on globalThis instead.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
