/**
 * 🔒 The second database — Perfect Poses' own (`perfectposes`; on staging
 * `perfectposes_staging`). It holds the private Calls & messages data: calls,
 * texts, summaries, transcripts and their bell notifications. iwopo's shared
 * database holds none of it.
 *
 * Same code, separate data — the locked decision of 2026-10-03. Both databases
 * run on the same PostgreSQL server as the app, so the second connection costs
 * a few milliseconds, not a noticeable delay.
 *
 * ⚠️ PRIVATE_DATABASE_URL is required on the machine that runs Calls &
 * messages. Without it the app still starts (no other vendor needs this), but
 * every private call fails loudly instead of quietly writing nowhere.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/private/index.js';

const url = process.env.PRIVATE_DATABASE_URL;
if (!url) console.error('⚠️ PRIVATE_DATABASE_URL is not set — Calls & messages cannot reach its database.');

const privateDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: url || 'postgresql://missing/none' }) });

export default privateDb;
export { privateDb };
