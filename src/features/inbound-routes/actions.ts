"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";

const schema = z.object({
  id: z.string().optional().or(z.literal("")),
  name: z.string().trim().min(1),
  destinationType: z.enum(["EXTENSION", "RING_GROUP", "QUEUE", "CONFERENCE", "IVR", "VOICEMAIL", "TIME_CONDITION", "HANGUP", "EXTERNAL", "AI_AGENT"]),
  destinationId: z.string().trim().optional().or(z.literal("")),
  businessHoursId: z.string().trim().optional().or(z.literal("")),
  cidNamePrefix: z.string().trim().optional().or(z.literal("")),
});

export async function saveInboundRoute(formData: FormData): Promise<void> {
  await requireManager();
  const data = schema.parse(Object.fromEntries(formData));
  const id = data.id || null;

  const base = {
    name: data.name,
    destinationType: data.destinationType,
    destinationId: data.destinationId || null,
    businessHoursId: data.businessHoursId || null,
    cidNamePrefix: data.cidNamePrefix || null,
  };

  if (id) {
    await db.inboundRoute.update({ where: { id }, data: base });
  } else {
    await db.inboundRoute.create({ data: base });
  }

  revalidatePath("/inbound");
  redirect("/inbound");
}

export async function deleteInboundRoute(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const route = await db.inboundRoute.findUnique({ where: { id } });
  if (route) await db.inboundRoute.delete({ where: { id } });
  revalidatePath("/inbound");
}
