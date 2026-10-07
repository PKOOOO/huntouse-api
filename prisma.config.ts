import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma's CLI doesn't read Next's env files itself; secrets live in .env.local (git-ignored).
config({ path: '.env.local' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
