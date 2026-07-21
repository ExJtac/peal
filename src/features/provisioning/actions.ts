"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { encryptSecret } from "@/lib/crypto-vault";
import { normalizeMac, isValidMac } from "@/lib/ids";
import { provisioningToken } from "@/provisioning/secrets";

const schema = z.object({
  mac: z.string().trim(),
  vendor: z.enum(["FANVIL", "YEALINK", "GRANDSTREAM", "POLY", "GENERIC"]),
  model: z.string().trim().min(1),
  extensionId: z.string().trim().optional().or(z.literal("")),
  timezone: z.string().trim().optional().or(z.literal("")),
});

export async function saveDevice(formData: FormData): Promise<void> {
  await requireAdmin();
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
    },
  });

  revalidatePath("/provisioning");
  redirect("/provisioning");
}

export async function deleteDevice(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await db.device.delete({ where: { id } }).catch(() => {});
  revalidatePath("/provisioning");
}
