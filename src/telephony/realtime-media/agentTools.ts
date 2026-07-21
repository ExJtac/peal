// Tool schemas the Claude brain may call — one action per turn. The AgentSession executes them
// (transfer_to_human → resolveDestination; take_message → sendToVoicemail; end_call → hang up;
// answer_question → keep conversing). `toolsFor` hides actions an agent isn't configured for so
// Claude never offers a capability that would just fall back. Worker-safe.
import type { AgentConfig } from "./agentConfig";
import type { ToolDef } from "@/ai/providers/llm/realtimeLlmProvider";

export const AGENT_TOOLS: Record<string, ToolDef> = {
  answer_question: {
    name: "answer_question",
    description: "Answer the caller's question or continue the conversation. Put your spoken reply in the message text, not here.",
    input_schema: { type: "object", properties: {} },
  },
  transfer_to_human: {
    name: "transfer_to_human",
    description: "Transfer the caller to a human (an extension or ring group). Use when the caller asks for a person or you cannot help.",
    input_schema: { type: "object", properties: { reason: { type: "string", description: "why you're transferring" } } },
  },
  take_message: {
    name: "take_message",
    description: "Send the caller to voicemail to leave a message. Use when no one is available or the caller prefers to leave a message.",
    input_schema: { type: "object", properties: {} },
  },
  end_call: {
    name: "end_call",
    description: "End the call. Use when the caller says goodbye or is finished.",
    input_schema: { type: "object", properties: {} },
  },
};

export function toolsFor(config: AgentConfig): ToolDef[] {
  const tools: ToolDef[] = [AGENT_TOOLS.answer_question, AGENT_TOOLS.end_call];
  if (config.allowTransfer && config.transferType) tools.push(AGENT_TOOLS.transfer_to_human);
  if (config.allowVoicemail && config.voicemailExtId) tools.push(AGENT_TOOLS.take_message);
  return tools;
}
