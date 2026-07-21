"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { encryptSecret } from "@/lib/crypto-vault";
import { upsertTrunkPjsip, deleteTrunkPjsip } from "@/telephony/realtime/psWriter";

// Checkbox → boolean: absent (unchecked) becomes false, "on" (checked) becomes true.
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());
// Comma-separated text field → trimmed non-empty list.
const list = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

const schema = z.object({
  id: z.string().optional().or(z.literal("")),
  name: z.string().trim().min(1),
  provider: z.enum(["TELNYX", "TWILIO", "BANDWIDTH", "VOIPMS", "GENERIC"]),
  authMode: z.enum(["REGISTER", "IP_AUTH"]),
  sipServer: z.string().trim().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(5060),
  transport: z.enum(["UDP", "TCP", "TLS"]),
  username: z.string().trim().optional().or(z.literal("")),
  password: z.string().optional().or(z.literal("")),
  fromDomain: z.string().trim().optional().or(z.literal("")),
  fromUser: z.string().trim().optional().or(z.literal("")),
  authIps: z.string().optional().or(z.literal("")),
  outboundProxy: z.string().trim().optional().or(z.literal("")),
  codecs: z.string().optional().or(z.literal("")),
  registerEnabled: checkbox,
  maxChannels: z.coerce.number().int().min(1).max(999).default(10),
  enabled: checkbox,
});

export async function saveTrunk(formData: FormData): Promise<void> {
  await requireManager();
  const data = schema.parse(Object.fromEntries(formData));
  const id = data.id || null;

  const codecs = list(data.codecs).length ? list(data.codecs) : ["ulaw", "alaw"];
  const base = {
    name: data.name,
    provider: data.provider,
    authMode: data.authMode,
    sipServer: data.sipServer,
    port: data.port,
    transport: data.transport,
    username: data.username || null,
    fromDomain: data.fromDomain || null,
    fromUser: data.fromUser || null,
    authIps: list(data.authIps),
    outboundProxy: data.outboundProxy || null,
    codecs,
    registerEnabled: data.registerEnabled,
    maxChannels: data.maxChannels,
    enabled: data.enabled,
  };

  let trunk;
  if (id) {
    const patch: Record<string, unknown> = { ...base };
    // Only re-encrypt when a non-empty password was actually submitted.
    if (data.password) patch.passwordEnc = encryptSecret(data.password);
    trunk = await db.trunk.update({ where: { id }, data: patch });
  } else {
    trunk = await db.trunk.create({
      data: { ...base, ...(data.password ? { passwordEnc: encryptSecret(data.password) } : {}) },
    });
  }

  // Sync to Asterisk realtime. Only succeeds once the "asterisk" schema exists
  // (in the VM / after apply-asterisk-sql) — skipped gracefully otherwise.
  try {
    await upsertTrunkPjsip(trunk);
  } catch (e) {
    console.warn("[trunks] ps_* sync skipped:", (e as Error).message);
  }

  revalidatePath("/trunks");
  redirect("/trunks");
}

export async function deleteTrunk(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const trunk = await db.trunk.findUnique({ where: { id } });
  if (trunk) {
    await db.trunk.delete({ where: { id } });
    try {
      await deleteTrunkPjsip(trunk.name);
    } catch {
      /* asterisk schema not present */
    }
  }
  revalidatePath("/trunks");
}
