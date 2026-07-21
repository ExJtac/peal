"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";

// AI_AGENT itself is intentionally NOT a valid transfer/fallback target (no agent→agent loops).
const destination = z.enum(["EXTENSION", "RING_GROUP", "IVR", "VOICEMAIL", "TIME_CONDITION", "HANGUP", "EXTERNAL"]);
const bool = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const optDest = z.preprocess((v) => (v === "" || v == null ? undefined : v), destination.optional());
const intIn = (def: number) => z.preprocess((v) => (v === "" || v == null ? def : Number(v)), z.number().int().min(0));
const optStr = z.string().trim().optional().or(z.literal(""));

const schema = z.object({
  id: optStr,
  name: z.string().trim().min(1),
  enabled: bool,
  greeting: z.string().trim().min(1),
  systemPrompt: z.string().trim().min(1),
  businessContext: optStr,
  voice: optStr,
  llmModel: optStr,
  maxTurns: intIn(12),
  endpointingMs: intIn(800),
  noInputTimeoutMs: intIn(7000),
  maxReprompts: intIn(2),
  bargeIn: bool,
  allowTransfer: bool,
  transferType: optDest,
  transferId: optStr,
  allowVoicemail: bool,
  voicemailExtId: optStr,
  fallbackType: optDest,
  fallbackId: optStr,
});

export async function saveAiAgent(formData: FormData): Promise<void> {
  await requireManager();
  const d = schema.parse(Object.fromEntries(formData));

  const data = {
    name: d.name,
    enabled: d.enabled,
    greeting: d.greeting,
    systemPrompt: d.systemPrompt,
    businessContext: d.businessContext || null,
    voice: d.voice || null,
    llmModel: d.llmModel || null,
    maxTurns: d.maxTurns,
    endpointingMs: d.endpointingMs,
    noInputTimeoutMs: d.noInputTimeoutMs,
    maxReprompts: d.maxReprompts,
    bargeIn: d.bargeIn,
    allowTransfer: d.allowTransfer,
    transferType: d.transferType ?? null,
    transferId: d.transferId || null,
    allowVoicemail: d.allowVoicemail,
    voicemailExtId: d.voicemailExtId || null,
    fallbackType: d.fallbackType ?? null,
    fallbackId: d.fallbackId || null,
  };

  if (d.id) {
    await db.aiAgent.update({ where: { id: d.id }, data });
  } else {
    await db.aiAgent.create({ data });
  }
  revalidatePath("/ai-agents");
  redirect("/ai-agents");
}

export async function deleteAiAgent(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  if (id) await db.aiAgent.delete({ where: { id } }).catch(() => {});
  revalidatePath("/ai-agents");
}

export async function toggleAiAgent(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const agent = await db.aiAgent.findUnique({ where: { id } });
  if (agent) await db.aiAgent.update({ where: { id }, data: { enabled: !agent.enabled } });
  revalidatePath("/ai-agents");
}
