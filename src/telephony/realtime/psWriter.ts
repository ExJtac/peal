// Writes our config truth (Prisma) into Asterisk's realtime ps_* tables. Called from the
// extensions/trunks Server Actions after a DB write, so "save an extension" = the phone can
// register moments later — no file edits, no full reload for endpoint/auth/aor (on-demand
// lookups). Trunk identify/registration changes DO need a `res_pjsip` reload (see reconcile).
import { asteriskPool, T } from "./odbcPool";
import { decryptSecret } from "@/lib/crypto-vault";
import * as S from "./psSchema";
import type { Extension, Trunk } from "@prisma/client";

async function upsert(table: string, row: Record<string, string>): Promise<void> {
  const cols = Object.keys(row);
  const vals = cols.map((c) => row[c]);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const updates = cols
    .filter((c) => c !== "id")
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(", ");
  const sql =
    `INSERT INTO ${T(table)} (${cols.map((c) => `"${c}"`).join(", ")}) ` +
    `VALUES (${placeholders.join(", ")}) ` +
    `ON CONFLICT (id) DO UPDATE SET ${updates || `"id" = EXCLUDED."id"`}`;
  await asteriskPool().query(sql, vals);
}

async function del(table: string, id: string): Promise<void> {
  await asteriskPool().query(`DELETE FROM ${T(table)} WHERE id = $1`, [id]);
}

export async function upsertExtensionPjsip(ext: Extension): Promise<void> {
  const password = decryptSecret(ext.sipPasswordEnc);
  await upsert("ps_aors", S.aorRowForExtension(ext));
  await upsert("ps_auths", S.authRowForExtension(ext, password));
  await upsert("ps_endpoints", S.endpointRowForExtension(ext));
}

export async function deleteExtensionPjsip(number: string): Promise<void> {
  await del("ps_endpoints", number);
  await del("ps_auths", number);
  await del("ps_aors", number);
}

export async function upsertTrunkPjsip(trunk: Trunk): Promise<void> {
  await upsert("ps_aors", S.aorRowForTrunk(trunk));
  await upsert("ps_endpoints", S.endpointRowForTrunk(trunk));
  if (trunk.authMode === "REGISTER" || trunk.username) {
    const password = trunk.passwordEnc ? decryptSecret(trunk.passwordEnc) : "";
    await upsert("ps_auths", S.authRowForTrunk(trunk, password));
  }
  if (trunk.authIps.length) await upsert("ps_endpoint_id_ips", S.identifyRowForTrunk(trunk));
  else await del("ps_endpoint_id_ips", trunk.name).catch(() => {});
  if (trunk.registerEnabled) await upsert("ps_registrations", S.registrationRowForTrunk(trunk));
  else await del("ps_registrations", trunk.name).catch(() => {});
}

export async function deleteTrunkPjsip(name: string): Promise<void> {
  await del("ps_endpoints", name);
  await del("ps_aors", name);
  await del("ps_auths", name).catch(() => {});
  await del("ps_endpoint_id_ips", name).catch(() => {});
  await del("ps_registrations", name).catch(() => {});
}

/** True if the Asterisk realtime tables are reachable (used by health checks). */
export async function asteriskDbReachable(): Promise<boolean> {
  try {
    await asteriskPool().query(`SELECT 1 FROM ${T("ps_endpoints")} LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}
