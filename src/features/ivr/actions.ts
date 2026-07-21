"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";

const DESTINATION_TYPES = ["EXTENSION", "RING_GROUP", "IVR", "VOICEMAIL", "TIME_CONDITION", "HANGUP", "EXTERNAL"] as const;
const NODE_TYPES = ["MENU", "PLAY", "COLLECT", "TRANSFER", "VOICEMAIL", "DIRECTORY", "HANGUP"] as const;

const optionalDestinationType = z.enum(DESTINATION_TYPES).optional().or(z.literal(""));

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

const flowCreateSchema = z.object({
  name: z.string().trim().min(1),
  number: z.string().trim().optional().or(z.literal("")),
});

export async function saveFlow(formData: FormData): Promise<void> {
  await requireManager();
  const data = flowCreateSchema.parse(Object.fromEntries(formData));
  await db.ivrFlow.create({ data: { name: data.name, number: data.number || null } });
  revalidatePath("/ivr");
  redirect("/ivr");
}

const flowUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  number: z.string().trim().optional().or(z.literal("")),
  timeoutSeconds: z.coerce.number().int().min(1).max(120),
  maxRetries: z.coerce.number().int().min(0).max(10),
  entryNodeId: z.string().trim().optional().or(z.literal("")),
  invalidType: optionalDestinationType,
  invalidId: z.string().trim().optional().or(z.literal("")),
});

export async function updateFlow(formData: FormData): Promise<void> {
  await requireManager();
  const data = flowUpdateSchema.parse(Object.fromEntries(formData));
  await db.ivrFlow.update({
    where: { id: data.id },
    data: {
      name: data.name,
      number: data.number || null,
      timeoutSeconds: data.timeoutSeconds,
      maxRetries: data.maxRetries,
      entryNodeId: data.entryNodeId || null,
      invalidType: data.invalidType || null,
      invalidId: data.invalidId || null,
    },
  });
  revalidatePath(`/ivr/${data.id}`);
  redirect(`/ivr/${data.id}`);
}

export async function deleteFlow(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const flow = await db.ivrFlow.findUnique({ where: { id } });
  if (flow) await db.ivrFlow.delete({ where: { id } });
  revalidatePath("/ivr");
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

const nodeSchema = z.object({
  flowId: z.string().min(1),
  type: z.enum(NODE_TYPES),
  name: z.string().trim().min(1),
  promptText: z.string().trim().optional().or(z.literal("")),
  // Only applied when type === "TRANSFER".
  destinationType: optionalDestinationType,
  destinationId: z.string().trim().optional().or(z.literal("")),
});

export async function addNode(formData: FormData): Promise<void> {
  await requireManager();
  const data = nodeSchema.parse(Object.fromEntries(formData));
  const isTransfer = data.type === "TRANSFER";
  await db.ivrNode.create({
    data: {
      flowId: data.flowId,
      type: data.type,
      name: data.name,
      promptText: data.promptText || null,
      destinationType: isTransfer ? data.destinationType || null : null,
      destinationId: isTransfer ? data.destinationId || null : null,
    },
  });
  revalidatePath(`/ivr/${data.flowId}`);
  redirect(`/ivr/${data.flowId}`);
}

export async function deleteNode(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const flowId = String(formData.get("flowId") ?? "");
  const node = await db.ivrNode.findUnique({ where: { id } });
  if (node) await db.ivrNode.delete({ where: { id } });
  revalidatePath(`/ivr/${flowId}`);
}

// ---------------------------------------------------------------------------
// Options (menu digits)
// ---------------------------------------------------------------------------

const optionSchema = z.object({
  flowId: z.string().min(1),
  nodeId: z.string().min(1),
  digit: z.string().trim().regex(/^[0-9*#]$/, "one of 0-9, *, #"),
  // Either go to another node in this flow…
  nextNodeId: z.string().trim().optional().or(z.literal("")),
  // …or transfer to a destination.
  destinationType: optionalDestinationType,
  destinationId: z.string().trim().optional().or(z.literal("")),
});

export async function addOption(formData: FormData): Promise<void> {
  await requireManager();
  const data = optionSchema.parse(Object.fromEntries(formData));
  const hasDestination = Boolean(data.destinationType);
  try {
    await db.ivrOption.create({
      data: {
        nodeId: data.nodeId,
        digit: data.digit,
        // Destination wins over next-node (the interpreter checks destinationType first).
        nextNodeId: hasDestination ? null : data.nextNodeId || null,
        destinationType: hasDestination ? data.destinationType || null : null,
        destinationId: hasDestination ? data.destinationId || null : null,
      },
    });
  } catch (e) {
    // @@unique([nodeId, digit]) — that digit is already mapped on this node; skip the dup.
    console.warn("[ivr] addOption skipped (duplicate digit?):", (e as Error).message);
  }
  revalidatePath(`/ivr/${data.flowId}`);
  redirect(`/ivr/${data.flowId}`);
}

export async function deleteOption(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const flowId = String(formData.get("flowId") ?? "");
  const opt = await db.ivrOption.findUnique({ where: { id } });
  if (opt) await db.ivrOption.delete({ where: { id } });
  revalidatePath(`/ivr/${flowId}`);
}
