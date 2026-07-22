import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { encryptSecret, tryDecryptSecret } from "@/lib/crypto-vault";

// Re-encrypts every at-rest ciphertext column from an old CRED_SECRET to the current one.
// Usage:
//   CRED_SECRET=<new> CRED_SECRET_OLD=<old> npm run rotate:cred-secret [-- --dry-run]
// Safe + idempotent: a value is only re-encrypted when it decrypts under a FALLBACK (old) key;
// values already under the primary key are skipped, and undecryptable values are reported, never
// written. Run --dry-run first to see the counts without changing anything.

type Target = {
  name: string;
  load: () => Promise<Array<{ id: string; value: string }>>;
  update: (id: string, value: string) => Prisma.PrismaPromise<unknown>;
};

const targets: Target[] = [
  {
    name: "Extension.sipPasswordEnc",
    load: () =>
      db.extension.findMany({ select: { id: true, sipPasswordEnc: true } }).then((r) => r.map((x) => ({ id: x.id, value: x.sipPasswordEnc }))),
    update: (id, value) => db.extension.update({ where: { id }, data: { sipPasswordEnc: value } }),
  },
  {
    name: "Trunk.passwordEnc",
    load: () =>
      db.trunk.findMany({ where: { passwordEnc: { not: null } }, select: { id: true, passwordEnc: true } }).then((r) => r.map((x) => ({ id: x.id, value: x.passwordEnc as string }))),
    update: (id, value) => db.trunk.update({ where: { id }, data: { passwordEnc: value } }),
  },
  {
    name: "Device.provisioningTokenEnc",
    load: () =>
      db.device.findMany({ select: { id: true, provisioningTokenEnc: true } }).then((r) => r.map((x) => ({ id: x.id, value: x.provisioningTokenEnc }))),
    update: (id, value) => db.device.update({ where: { id }, data: { provisioningTokenEnc: value } }),
  },
  {
    name: "Device.webAdminPasswordEnc",
    load: () =>
      db.device.findMany({ where: { webAdminPasswordEnc: { not: null } }, select: { id: true, webAdminPasswordEnc: true } }).then((r) => r.map((x) => ({ id: x.id, value: x.webAdminPasswordEnc as string }))),
    update: (id, value) => db.device.update({ where: { id }, data: { webAdminPasswordEnc: value } }),
  },
  {
    name: "GuardrailPolicy.internationalPinEnc",
    load: () =>
      db.guardrailPolicy.findMany({ where: { internationalPinEnc: { not: null } }, select: { id: true, internationalPinEnc: true } }).then((r) => r.map((x) => ({ id: x.id, value: x.internationalPinEnc as string }))),
    update: (id, value) => db.guardrailPolicy.update({ where: { id }, data: { internationalPinEnc: value } }),
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!process.env.CRED_SECRET) {
    console.error("Refusing to run: CRED_SECRET (the new/current key) is not set.");
    process.exit(1);
  }
  if (!process.env.CRED_SECRET_OLD || !process.env.CRED_SECRET_OLD.trim()) {
    console.error("Refusing to run: CRED_SECRET_OLD (the previous key to migrate from) is not set.");
    console.error("Set CRED_SECRET=<new> and CRED_SECRET_OLD=<old>, then re-run.");
    process.exit(1);
  }

  console.log(dryRun ? "DRY RUN — no changes will be written.\n" : "Rotating at-rest secrets to the current CRED_SECRET.\n");

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const summary: Array<{ column: string; scanned: number; rotated: number; alreadyCurrent: number; unreadable: number }> = [];

  for (const t of targets) {
    const rows = await t.load();
    let rotated = 0;
    let alreadyCurrent = 0;
    let unreadable = 0;
    for (const { id, value } of rows) {
      const r = tryDecryptSecret(value);
      if (!r) {
        unreadable++;
        console.warn(`  unreadable (wrong CRED_SECRET_OLD or corrupt): ${t.name} id=${id}`);
        continue;
      }
      if (r.keyId === "primary") {
        alreadyCurrent++;
        continue;
      }
      rotated++;
      if (!dryRun) ops.push(t.update(id, encryptSecret(r.plain)));
    }
    summary.push({ column: t.name, scanned: rows.length, rotated, alreadyCurrent, unreadable });
  }

  if (!dryRun && ops.length) {
    await db.$transaction(ops);
  }

  console.log("\nColumn                                scanned  rotated  current  unreadable");
  for (const s of summary) {
    console.log(`${s.column.padEnd(36)}  ${String(s.scanned).padStart(7)}  ${String(s.rotated).padStart(7)}  ${String(s.alreadyCurrent).padStart(7)}  ${String(s.unreadable).padStart(10)}`);
  }
  const totalUnreadable = summary.reduce((n, s) => n + s.unreadable, 0);
  console.log(`\n${dryRun ? "Would rotate" : "Rotated"} ${summary.reduce((n, s) => n + s.rotated, 0)} value(s).` + (totalUnreadable ? ` ${totalUnreadable} unreadable — check CRED_SECRET_OLD.` : ""));
  if (!dryRun) console.log("Done. Once every value is current you can drop CRED_SECRET_OLD.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
