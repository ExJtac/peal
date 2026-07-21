import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved connection config out of schema.prisma. This drives the CLI
// (migrate / studio / seed). The runtime app + workers connect via the pg adapter
// in src/lib/db.ts. NOTE: `prisma migrate` manages ONLY our `public` tables — the
// Asterisk-owned `ps_*`/cdr/cel tables in schema `asterisk` are applied by
// scripts/apply-asterisk-sql.ts and must never be touched by a migration.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
