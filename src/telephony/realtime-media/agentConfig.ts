// Loads an AiAgent DB row into the runtime config the AgentSession uses, applying env defaults
// and assembling the Claude system prompt from the persona + business context. Worker-safe.
import { db } from "@/lib/db";
import { AGENT_LLM_MODEL } from "@/lib/env";
import type { DestinationType } from "@prisma/client";

export interface AgentConfig {
  id: string;
  name: string;
  greeting: string;
  systemPrompt: string; // assembled — persona + business context + call rules
  voice: string | undefined;
  model: string;
  maxTurns: number;
  endpointingMs: number;
  bargeIn: boolean;
  noInputTimeoutMs: number;
  maxReprompts: number;
  allowTransfer: boolean;
  transferType: DestinationType | null;
  transferId: string | null;
  allowVoicemail: boolean;
  voicemailExtId: string | null;
  fallbackType: DestinationType | null;
  fallbackId: string | null;
}

function buildSystemPrompt(persona: string, businessContext: string | null, allowTransfer: boolean, allowVoicemail: boolean): string {
  const lines = [
    persona.trim(),
    "",
    "You are answering a live phone call as the receptionist. Speak naturally and briefly — one or two short sentences per turn, as if talking, not writing. Do not use markdown, lists, or emoji.",
  ];
  if (businessContext?.trim()) {
    lines.push("", "Business information you can use to answer questions:", businessContext.trim());
  }
  const tools: string[] = [];
  if (allowTransfer) tools.push("transfer_to_human when the caller wants a person or you cannot help");
  if (allowVoicemail) tools.push("take_message to record a voicemail when no one is available or the caller prefers to leave a message");
  tools.push("answer_question when you can answer directly", "end_call when the caller is done and says goodbye");
  lines.push(
    "",
    "Use exactly one tool per turn to signal your intent: " + tools.join("; ") + ".",
    "Prefer answering directly. Only transfer or take a message when it's clearly the right thing to do.",
  );
  return lines.join("\n");
}

export async function loadAgentConfig(agentId: string): Promise<AgentConfig | null> {
  const a = await db.aiAgent.findUnique({ where: { id: agentId } }).catch(() => null);
  if (!a || !a.enabled) return null;
  return {
    id: a.id,
    name: a.name,
    greeting: a.greeting,
    systemPrompt: buildSystemPrompt(a.systemPrompt, a.businessContext, a.allowTransfer, a.allowVoicemail),
    voice: a.voice ?? undefined,
    model: a.llmModel || AGENT_LLM_MODEL,
    maxTurns: a.maxTurns,
    endpointingMs: a.endpointingMs,
    bargeIn: a.bargeIn,
    noInputTimeoutMs: a.noInputTimeoutMs,
    maxReprompts: a.maxReprompts,
    allowTransfer: a.allowTransfer,
    transferType: a.transferType,
    transferId: a.transferId,
    allowVoicemail: a.allowVoicemail,
    voicemailExtId: a.voicemailExtId,
    fallbackType: a.fallbackType,
    fallbackId: a.fallbackId,
  };
}
