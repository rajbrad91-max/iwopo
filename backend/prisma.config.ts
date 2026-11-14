import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  /* 🔐 Migrations change tables, so they sign in as the database owner. The running app uses DATABASE_URL, a login
     that can only read and write rows (audit 2026-11-14). One login for both still works, e.g. on a laptop. */
  datasource: {
    url: process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL,
  },
});
