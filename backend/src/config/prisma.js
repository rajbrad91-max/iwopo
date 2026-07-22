// 🔌 Prisma client — single shared instance for the whole app.
//
// Prisma 7 talks to PostgreSQL through a driver adapter, and that adapter is the
// same `pg` driver the app already used directly. During the migration Prisma and
// the legacy `pg` pool run side by side against the same database, so routes can
// be converted a few at a time without a big-bang switchover.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prisma = new PrismaClient({ adapter });

export default prisma;
export { prisma };
