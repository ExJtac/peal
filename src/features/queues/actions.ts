"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";

// Members are a comma-separated list of extension numbers in strategy order, each optionally
// "number:penalty" (lower penalty rings first). e.g. "1001, 1002:1, 1003:2".
function parseMembers(s?: string): { number: string; penalty: number }[] {
  const seen = new Set<string>();
  const out: { number: string; penalty: number }[] = [];
  for (const raw of (s ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const [num, pen] = raw.split(":");
    const number = num.trim();
    if (!number || seen.has(number)) continue;
    seen.add(number);
    out.push({ number, penalty: Number.isFinite(Number(pen)) ? Math.max(0, Math.trunc(Number(pen))) : 0 });
  }
  return out;
}

const DEST = ["EXTENSION", "RING_GROUP", "QUEUE", "CONFERENCE", "IVR", "VOICEMAIL", "TIME_CONDITION", "HANGUP", "EXTERNAL", "AI_AGENT"] as const;
const checkbox = z.preprocess((v) => v === "on" || v === true, z.boolean());

const schema = z.object({
  id: z.string().optional().or(z.literal("")),
  number: z.string().trim().min(1),
  name: z.string().trim().min(1),
  strategy: z.enum(["RINGALL", "LINEAR", "FEWEST_CALLS", "LEAST_RECENT", "RANDOM"]),
  mohClass: z.string().trim().optional().or(z.literal("")),
  joinEmpty: checkbox.default(false),
  leaveWhenEmpty: checkbox.default(false),
  announcePosition: checkbox.default(false),
  announceHoldTime: checkbox.default(false),
  agentRingSeconds: z.coerce.number().int().min(5).max(300).default(20),
  wrapUpSeconds: z.coerce.number().int().min(0).max(600).default(0),
  maxWaitSeconds: z.coerce.number().int().min(0).max(7200).default(0),
  announceFrequency: z.coerce.number().int().min(10).max(600).default(30),
  timeoutType: z.enum(DEST).optional().or(z.literal("")),
  timeoutId: z.string().trim().optional().or(z.literal("")),
  failoverType: z.enum(DEST).optional().or(z.literal("")),
  failoverId: z.string().trim().optional().or(z.literal("")),
  memberNumbers: z.string().optional().or(z.literal("")),
});

export async function saveQueue(formData: FormData): Promise<void> {
  await requireManager();
  const data = schema.parse(Object.fromEntries(formData));
  const id = data.id || null;

  // Resolve member numbers → ids, preserving submitted order + per-member penalty.
  const parsed = parseMembers(data.memberNumbers);
  const exts = parsed.length ? await db.extension.findMany({ where: { number: { in: parsed.map((m) => m.number) } } }) : [];
  const idByNumber = new Map(exts.map((e) => [e.number, e.id]));
  const members = parsed
    .map((m, i) => ({ extensionId: idByNumber.get(m.number), penalty: m.penalty, order: i }))
    .filter((m): m is { extensionId: string; penalty: number; order: number } => Boolean(m.extensionId));

  const base = {
    number: data.number,
    name: data.name,
    strategy: data.strategy,
    mohClass: data.mohClass || "default",
    joinEmpty: data.joinEmpty,
    leaveWhenEmpty: data.leaveWhenEmpty,
    announcePosition: data.announcePosition,
    announceHoldTime: data.announceHoldTime,
    agentRingSeconds: data.agentRingSeconds,
    wrapUpSeconds: data.wrapUpSeconds,
    maxWaitSeconds: data.maxWaitSeconds,
    announceFrequency: data.announceFrequency,
    timeoutType: data.timeoutType || null,
    timeoutId: data.timeoutId || null,
    failoverType: data.failoverType || null,
    failoverId: data.failoverId || null,
  };

  const queue = id ? await db.queue.update({ where: { id }, data: base }) : await db.queue.create({ data: base });

  // Rebuild membership in order.
  await db.queueMember.deleteMany({ where: { queueId: queue.id } });
  if (members.length) {
    await db.queueMember.createMany({
      data: members.map((m) => ({ queueId: queue.id, extensionId: m.extensionId, penalty: m.penalty, order: m.order })),
    });
  }

  revalidatePath("/queues");
  redirect("/queues");
}

export async function deleteQueue(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const queue = await db.queue.findUnique({ where: { id } });
  if (queue) {
    await db.queue.delete({ where: { id } });
    await db.queueStatus.deleteMany({ where: { queueId: id } }).catch(() => {}); // QueueStatus has no FK
  }
  revalidatePath("/queues");
}
