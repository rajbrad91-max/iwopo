// 🔒 Prisma config for the PRIVATE schema (Perfect Poses' own database).
//   generate:  npx prisma generate --config prisma.private.config.ts
//   apply:     npx prisma migrate deploy --config prisma.private.config.ts
// ⚠️ Only `migrate deploy` (it runs our migration files and nothing else).
// NEVER `db push` or `migrate dev`/`reset` against it: the same database holds
// the perfectposes.ca website's tables, which this schema does not describe,
// and those commands would try to drop them. New migrations are written with
// `prisma migrate diff --from-config-datasource --to-schema … --script`.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/private/schema.prisma',
  // its own history, beside its own schema — never mixed with iwopo's
  migrations: {
    path: 'prisma/private/migrations',
  },
  datasource: {
    url: process.env.PRIVATE_DATABASE_URL,
  },
});
