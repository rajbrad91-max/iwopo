// 🔒 Prisma config for the PRIVATE schema (Perfect Poses' own database).
// Used only to generate its client and to write CREATE statements for it:
//   npx prisma generate --config prisma.private.config.ts
// ⚠️ Never `db push` with this: the same database holds the perfectposes.ca
// website's tables, which this schema does not describe.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/private/schema.prisma',
  datasource: {
    url: process.env.PRIVATE_DATABASE_URL,
  },
});
