"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { encryptSecret } from "@/lib/crypto-vault";
import { upsertExtensionPjsip, deleteExtensionPjsip } from "@/telephony/realtime/psWriter";

const schema = z.object({
  id: z.string().optional().or(z.literal("")),
  number: z.string().trim().regex(/^\d{2,6}$/, "2–6 digits"),
  displayName: z.string().trim().min(1),
  email: z.string().trim().email().optional().or(z.literal("")),
  callerIdNumber: z.string().trim().optional().or(z.literal("")),
  outboundPermission: z.enum(["internal", "local", "national", "international"]),
  ringSeconds: z.coerce.number().int().min(5).max(120),
  sipPassword: z.string().optional().or(z.literal("")),
  webrtc: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export async function saveExtension(formData: FormData): Promise<void> {
  await requireManager();
  const data = schema.parse(Object.fromEntries(formData));
  const id = data.id || null;

  const base = {
    number: data.number,
    displayName: data.displayName,
    email: data.email || null,
    callerIdName: data.displayName,
    callerIdNumber: data.callerIdNumber || null,
    outboundPermission: data.outboundPermission,
    ringSeconds: data.ringSeconds,
    webrtc: data.webrtc,
  };

  let ext;
  if (id) {
    const patch: Record<string, unknown> = { ...base };
    if (data.sipPassword && data.sipPassword.length >= 6) patch.sipPasswordEnc = encryptSecret(data.sipPassword);
    ext = await db.extension.update({ where: { id }, data: patch });
  } else {
    const pw = data.sipPassword && data.sipPassword.length >= 6 ? data.sipPassword : randomBytes(9).toString("base64url");
    ext = await db.extension.create({
      data: { ...base, sipPasswordEnc: encryptSecret(pw), mailbox: { create: { mailbox: data.number, email: data.email || null } } },
    });
  }

  // Sync to Asterisk realtime so the phone can register. Only succeeds once the "asterisk"
  // schema exists (in the VM / after apply-asterisk-sql) — skipped gracefully otherwise.
  try {
    await upsertExtensionPjsip(ext);
  } catch (e) {
    console.warn("[extensions] ps_* sync skipped:", (e as Error).message);
  }

  revalidatePath("/extensions");
  redirect("/extensions");
}

export async function deleteExtension(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const ext = await db.extension.findUnique({ where: { id } });
  if (ext) {
    await db.extension.delete({ where: { id } });
    try {
      await deleteExtensionPjsip(ext.number);
    } catch {
      /* asterisk schema not present */
    }
  }
  revalidatePath("/extensions");
}
