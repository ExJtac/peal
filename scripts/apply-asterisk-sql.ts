import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

// Applies asterisk/sql/*.sql — the Asterisk-owned realtime tables (ps_*/cdr/cel) in schema
// "asterisk". Deliberately kept OUT of Prisma migrations (Asterisk dictates that schema).
async function main() {
  const dir = join(process.cwd(), "asterisk", "sql");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  for (const f of files) {
    process.stdout.write(`applying ${f} … `);
    await client.query(readFileSync(join(dir, f), "utf8"));
    console.log("ok");
  }
  await client.end();
  console.log(`Applied ${files.length} Asterisk SQL file(s).`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
