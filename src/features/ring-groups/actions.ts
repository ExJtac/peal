"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";

// Comma-separated text field → trimmed non-empty list.
const list = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

const schema = z.object({
  id: z.string().optional().or(z.literal("")),
  number: z.string().trim().min(1),
  name: z.string().trim().min(1),
  strategy: z.enum(["RINGALL", "HUNT", "MEMORY_HUNT", "RANDOM"]),
  ringSeconds: z.coerce.number().int().min(5).max(300).default(20),
  failoverType: z
    .enum(["EXTENSION", "RING_GROUP", "QUEUE", "CONFERENCE", "IVR", "VOICEMAIL", "TIME_CONDITION", "HANGUP", "EXTERNAL", "AI_AGENT"])
    .optional()
    .or(z.literal("")),
  failoverId: z.string().trim().optional().or(z.literal("")),
  memberNumbers: z.string().optional().or(z.literal("")),
});

export async function saveRingGroup(formData: FormData): Promise<void> {
  await requireManager();
  const data = schema.parse(Object.fromEntries(formData));
  const id = data.id || null;

  // Resolve member extension numbers → ids, in submitted order, skipping unknown ones.
  const numbers = [...new Set(list(data.memberNumbers))];
  const exts = numbers.length ? await db.extension.findMany({ where: { number: { in: numbers } } }) : [];
  const idByNumber = new Map(exts.map((e) => [e.number, e.id]));
  const memberIds = numbers.map((n) => idByNumber.get(n)).filter((x): x is string => Boolean(x));

  const base = {
    number: data.number,
    name: data.name,
    strategy: data.strategy,
    ringSeconds: data.ringSeconds,
    failoverType: data.failoverType || null,
    failoverId: data.failoverId || null,
  };

  const group = id
    ? await db.ringGroup.update({ where: { id }, data: base })
    : await db.ringGroup.create({ data: base });

  // Rebuild membership: clear then re-create in order.
  await db.ringGroupMember.deleteMany({ where: { ringGroupId: group.id } });
  if (memberIds.length) {
    await db.ringGroupMember.createMany({
      data: memberIds.map((extensionId, i) => ({ ringGroupId: group.id, extensionId, order: i })),
    });
  }

  revalidatePath("/ring-groups");
  redirect("/ring-groups");
}

export async function deleteRingGroup(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const group = await db.ringGroup.findUnique({ where: { id } });
  if (group) await db.ringGroup.delete({ where: { id } });
  revalidatePath("/ring-groups");
}
