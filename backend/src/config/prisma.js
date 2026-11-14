// 🔌 Prisma client — single shared instance for the whole app.
//
// Prisma 7 talks to PostgreSQL through a driver adapter, and that adapter is the
// same `pg` driver the app already used directly. During the migration Prisma and
// the legacy `pg` pool run side by side against the same database, so routes can
// be converted a few at a time without a big-bang switchover.
//
// ⚠️ dotenv is loaded HERE, not left to server.js. ES module imports all run
// before the importing file's own statements, so `server.js`'s dotenv.config()
// fires *after* this module has already been evaluated — DATABASE_URL would be
// undefined and the adapter would fail with "client password must be a string".
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // fail loudly at boot rather than with a confusing SASL error on the first query
  throw new Error('DATABASE_URL is not set — Prisma cannot connect. Add it to backend/.env');
}

const adapter = new PrismaPg({ connectionString });

/* 🧬 photos.face_vectors (the faces' fingerprints, ~4 KB a face) only ever travels when the face code asks for it
   with select: { face_vectors: true } — every other read of a photo leaves it behind. */
const prisma = new PrismaClient({ adapter, omit: { photos: { face_vectors: true } } });

export default prisma;
export { prisma };
