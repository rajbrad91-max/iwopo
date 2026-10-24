// 🩺 Environment check — runs once at boot, before anything tries to connect.
//
// Why this exists: `.env` is gitignored, so a fresh server starts with none of
// these set. Without this check the app fails later with errors that point at
// the wrong thing — a missing DATABASE_URL surfaces as
// "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string",
// which reads like a password problem rather than a missing config file.
//
// Fail fast, and say exactly what to fix.
import 'dotenv/config';

const REQUIRED = [
  ['DATABASE_URL', 'Prisma connection string, e.g. postgresql://postgres:PASS@localhost:5432/iwopo?schema=public'],
  ['DB_PASSWORD', 'PostgreSQL password'],
  ['DB_NAME', 'database name — iwopo (live) or iwopo_staging'],
  ['JWT_SECRET', 'long random string used to sign login tokens'],
  ['STORAGE_BASE', 'absolute path where galleries and logos are written'],
];

// Not fatal, but worth flagging so nobody wonders why a feature is silent.
const OPTIONAL = [
  ['APP_URL', 'used in emailed links (password reset, client portal)'],
];

export function checkEnv() {
  const missing = REQUIRED.filter(([k]) => !process.env[k]);
  if (missing.length) {
    console.error('\n❌ Missing required environment variables in backend/.env:\n');
    for (const [key, why] of missing) console.error(`   ${key}\n      ↳ ${why}\n`);
    console.error('   Copy backend/.env.example to backend/.env and fill in the values.\n');
    process.exit(1);
  }

  const soft = OPTIONAL.filter(([k]) => !process.env[k]);
  if (soft.length) {
    console.warn('⚠️  Optional env vars not set (features below are disabled):');
    for (const [key, why] of soft) console.warn(`   ${key} — ${why}`);
  }

  // catch the classic mix-up: staging pointing at the live database
  const url = process.env.DATABASE_URL || '';
  const name = process.env.DB_NAME || '';
  if (name && !url.includes(`/${name}`)) {
    console.warn(`⚠️  DATABASE_URL does not appear to point at DB_NAME ("${name}") — check backend/.env`);
  }

  console.log(`✅ env ok — db="${name}" port=${process.env.PORT || 3001}`);
}
