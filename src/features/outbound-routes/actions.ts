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
  name: z.string().trim().min(1),
  priority: z.coerce.number().int().default(100),
  matchPattern: z.string().trim().min(1),
  stripDigits: z.coerce.number().int().min(0).default(0),
  prependDigits: z.string().optional().or(z.literal("")),
  trunkId: z.string().trim().min(1),
  failoverTrunkId: z.string().optional().or(z.literal("")),
  callerIdNumber: z.string().trim().optional().or(z.literal("")),
  permissionTag: z.enum(["internal", "local", "national", "international"]).default("national"),
  requiresPin: checkbox,
  enabled: checkbox,
});

export async function saveOutboundRoute(formData: FormData): Promise<void> {
  await requireManager();
  const data = schema.parse(Object.fromEntries(formData));
  const id = data.id || null;

  const base = {
    name: data.name,
    priority: data.priority,
    matchPattern: data.matchPattern,
    stripDigits: data.stripDigits,
    prependDigits: data.prependDigits ?? "",
    trunkId: data.trunkId,
    failoverTrunkId: data.failoverTrunkId || null,
    callerIdNumber: data.callerIdNumber || null,
    permissionTag: data.permissionTag,
    requiresPin: data.requiresPin,
    enabled: data.enabled,
  };

  if (id) {
    await db.outboundRoute.update({ where: { id }, data: base });
  } else {
    await db.outboundRoute.create({ data: base });
  }

  revalidatePath("/outbound");
  redirect("/outbound");
}

export async function deleteOutboundRoute(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const route = await db.outboundRoute.findUnique({ where: { id } });
  if (route) await db.outboundRoute.delete({ where: { id } });
  revalidatePath("/outbound");
}
