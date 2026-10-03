import 'dotenv/config';

import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer loads `.env` implicitly, hence the import above.
//
// This URL is what the Prisma CLI (migrate, studio) connects with. On Neon,
// migrations need the *direct* connection: they take an advisory lock, which
// the pooler (PgBouncer in transaction mode) does not support. The running
// API connects through PrismaService with DATABASE_URL, which can be the
// pooled one. Locally both are the same database, so DIRECT_DATABASE_URL is
// optional.
export default defineConfig({
  schema: 'prisma/schema.prisma',

  migrations: {
    path: 'prisma/migrations',
  },

  datasource: {
    url: process.env.DIRECT_DATABASE_URL || env('DATABASE_URL'),
  },
});
