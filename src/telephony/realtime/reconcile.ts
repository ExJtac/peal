// Rebuild ALL ps_* rows from Prisma truth (the "reconcile-all" admin action). Endpoint/auth/aor
// lookups are on-demand so they need no reload; trunk identify/registration changes require an
// Asterisk `res_pjsip` reload — run `asterisk -rx "module reload res_pjsip.so"` in the VM
// afterward (or wire AMI later). Writes a reconcile hash into SystemStatus for the UI.
import { db } from "@/lib/db";
import { createHash } from "node:crypto";
import { upsertExtensionPjsip, upsertTrunkPjsip } from "./psWriter";

export async function reconcileAll(): Promise<string> {
  const exts = await db.extension.findMany({ where: { enabled: true } });
  for (const e of exts) await upsertExtensionPjsip(e).catch(() => {});

  const trunks = await db.trunk.findMany({ where: { enabled: true } });
  for (const t of trunks) await upsertTrunkPjsip(t).catch(() => {});

  const hash = createHash("sha256")
    .update(JSON.stringify({ e: exts.map((e) => e.id + e.updatedAt.getTime()), t: trunks.map((t) => t.id + t.updatedAt.getTime()) }))
    .digest("hex")
    .slice(0, 12);

  await db.systemStatus
    .upsert({
      where: { id: "singleton" },
      create: { id: "singleton", psReconcileHash: hash },
      update: { psReconcileHash: hash },
    })
    .catch(() => {});
  return hash;
}
