import "dotenv/config";
import { db } from "@/lib/db";

// Guard against the single most dangerous CLI footgun in this project.
//
// Everything lives in ONE Postgres database: schema `public` (our app, Prisma-owned) AND schema
// `asterisk` (ps_endpoints/auths/aors/contacts/registrations + cdr/cel, raw-SQL-owned, read live
// by Asterisk over ODBC). `prisma migrate reset` / `db push --force-reset` DROP the whole database
// — taking the asterisk schema (live SIP registrations + all call history) with it. Prisma only
// models public tables, so nothing in the ORM prevents this.
//
// `npm run db:reset` runs THIS first: it refuses when the asterisk schema has tables. To truly
// wipe a dev DB, drop the asterisk schema yourself first (you'll mean it), then re-run.
//   (Full defense — a separate DB role owning `asterisk` so migrate can't touch it — is Phase 6.)

async function main(): Promise<void> {
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM information_schema.tables
    WHERE table_schema = 'asterisk'
  `;
  const n = rows[0]?.n ?? 0;
  if (n > 0) {
    console.error(
      `\n\x1b[1;31mREFUSING to reset:\x1b[0m this database has ${n} table(s) in schema ` +
        `"asterisk" (live SIP registrations + CDR/CEL).\n` +
        `A prisma reset would DROP them. If you truly want to wipe dev data:\n` +
        `  psql -d "$DATABASE_URL" -c 'DROP SCHEMA asterisk CASCADE;'\n` +
        `then re-run. NEVER run \`prisma migrate reset\` directly against a live PBX DB.\n`,
    );
    process.exit(1);
  }
  console.log('[guard-reset] no "asterisk" schema tables present — reset is safe to proceed.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // If we can't even check, fail CLOSED (refuse) — safer than allowing a blind reset.
    console.error("[guard-reset] could not verify DB safety; refusing reset:", e);
    process.exit(1);
  });
