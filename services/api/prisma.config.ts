import 'dotenv/config';

import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer loads `.env` implicitly, hence the import above.
export default defineConfig({
  schema: 'prisma/schema.prisma',

  migrations: {
    path: 'prisma/migrations',
  },

  datasource: {
    url: env('DATABASE_URL'),
  },
});
