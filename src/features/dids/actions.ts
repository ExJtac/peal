"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";

// Checkbox → boolean: absent (unchecked) becomes false, "on" (checked) becomes true.
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());

const schema = z.object({
  id: z.string().optional().or(z.literal("")),
  e164: z.string().trim().min(1),
  description: z.string().trim().optional().or(z.literal("")),
  trunkId: z.string().optional().or(z.literal("")),
  inboundRouteId: z.string().optional().or(z.literal("")),
  emergencyCapable: checkbox,
  enabled: checkbox,
});

export async function saveDid(formData: FormData): Promise<void> {
  await requireManager();
  const data = schema.parse(Object.fromEntries(formData));
  const id = data.id || null;

  const base = {
    e164: data.e164,
    description: data.description || null,
    trunkId: data.trunkId || null,
    inboundRouteId: data.inboundRouteId || null,
    emergencyCapable: data.emergencyCapable,
    enabled: data.enabled,
  };

  if (id) {
    await db.did.update({ where: { id }, data: base });
  } else {
    await db.did.create({ data: base });
  }

  revalidatePath("/dids");
  redirect("/dids");
}

export async function deleteDid(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const did = await db.did.findUnique({ where: { id } });
  if (did) await db.did.delete({ where: { id } });
  revalidatePath("/dids");
}
