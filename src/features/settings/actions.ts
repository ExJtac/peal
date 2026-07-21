"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";

const schema = z.object({
  companyName: z.string().trim().min(1),
  timezone: z.string().trim().min(1),
  defaultCallerId: z.string().trim().optional().or(z.literal("")),
  sipDomain: z.string().trim().min(1),
  externalIp: z.string().trim().optional().or(z.literal("")),
  recordCalls: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export async function saveSettings(formData: FormData): Promise<void> {
  await requireManager();
  const data = schema.parse(Object.fromEntries(formData));

  const values = {
    companyName: data.companyName,
    timezone: data.timezone,
    defaultCallerId: data.defaultCallerId || null,
    sipDomain: data.sipDomain,
    externalIp: data.externalIp || null,
    recordCalls: data.recordCalls,
  };

  await db.companySettings.upsert({
    where: { id: "singleton" },
    update: values,
    create: { id: "singleton", ...values },
  });

  revalidatePath("/settings");
  redirect("/settings");
}
