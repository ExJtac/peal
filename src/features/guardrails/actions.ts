"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { encryptSecret } from "@/lib/crypto-vault";

const commaList = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

const schema = z.object({
  internationalEnabled: z.coerce.boolean(),
  maxConcurrentOutbound: z.coerce.number().int().min(1).max(100),
  allowedCountryCodes: z.string().optional().or(z.literal("")),
  blockedPrefixes: z.string().optional().or(z.literal("")),
  internationalPin: z.string().optional().or(z.literal("")),
});

export async function saveGuardrails(formData: FormData): Promise<void> {
  await requireAdmin();
  const data = schema.parse(Object.fromEntries(formData));

  const base = {
    internationalEnabled: data.internationalEnabled,
    maxConcurrentOutbound: data.maxConcurrentOutbound,
    allowedCountryCodes: commaList(data.allowedCountryCodes),
    blockedPrefixes: commaList(data.blockedPrefixes),
  };

  const update: Record<string, unknown> = { ...base };
  const create: Record<string, unknown> = { id: "singleton", ...base };
  if (data.internationalPin && data.internationalPin.length > 0) {
    const enc = encryptSecret(data.internationalPin);
    update.internationalPinEnc = enc;
    create.internationalPinEnc = enc;
  }

  await db.guardrailPolicy.upsert({
    where: { id: "singleton" },
    update,
    create,
  });

  revalidatePath("/guardrails");
  redirect("/guardrails");
}
