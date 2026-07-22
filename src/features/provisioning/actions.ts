"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { encryptSecret } from "@/lib/crypto-vault";
import { normalizeMac, isValidMac } from "@/lib/ids";
import { provisioningToken } from "@/provisioning/secrets";

/** A strong, phone-web-UI-friendly password (12 base64url chars). */
function newWebPassword(): string {
  return randomBytes(9).toString("base64url");
}

const schema = z.object({
  mac: z.string().trim(),
  vendor: z.enum(["FANVIL", "YEALINK", "GRANDSTREAM", "POLY", "GENERIC"]),
  model: z.string().trim().min(1),
  extensionId: z.string().trim().optional().or(z.literal("")),
  timezone: z.string().trim().optional().or(z.literal("")),
});

export async function saveDevice(formData: FormData): Promise<void> {
  await requireManager();
  const data = schema.parse(Object.fromEntries(formData));
  const mac = normalizeMac(data.mac);
  if (!isValidMac(mac)) throw new Error("Invalid MAC address — need 12 hex digits.");

  await db.device.upsert({
    where: { mac },
    update: {
      vendor: data.vendor,
      model: data.model,
      extensionId: data.extensionId || null,
      timezone: data.timezone || null,
    },
    create: {
      mac,
      vendor: data.vendor,
      model: data.model,
      extensionId: data.extensionId || null,
      timezone: data.timezone || null,
      provisioningTokenEnc: encryptSecret(provisioningToken(mac)),
      webAdminPasswordEnc: encryptSecret(newWebPassword()),
    },
  });

  revalidatePath("/provisioning");
  redirect("/provisioning");
}

/** Rotate a phone's web-UI admin password (re-provision the phone afterward to apply it). */
export async function regenerateWebPassword(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  await db.device
    .update({ where: { id }, data: { webAdminPasswordEnc: encryptSecret(newWebPassword()) } })
    .catch(() => {});
  revalidatePath("/provisioning");
}

export async function deleteDevice(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  await db.device.delete({ where: { id } }).catch(() => {});
  revalidatePath("/provisioning");
}
