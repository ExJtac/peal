import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { resolveStt } from "../providers/stt/resolve";
import { resolveLlm } from "../providers/llm/resolve";
import { mediaExists } from "../media";

// Async AI stage: transcribe a voicemail recording and attach a one-line summary + urgency.
// Enqueued when a new VoicemailMessage lands; runs off the media path (no latency budget).
export async function transcribeVoicemail(voicemailMessageId: string): Promise<void> {
  const vm = await db.voicemailMessage.findUnique({ where: { id: voicemailMessageId }, include: { box: true } });
  if (!vm) return;
  if (!vm.box.transcribeEnabled) return;

  const stt = resolveStt();
  // In mock mode the audio file need not exist; a real STT engine requires it.
  if (stt.name !== "mock" && !mediaExists(vm.audioPath)) return;

  const t = await stt.transcribe(vm.audioPath);
  const summary = await resolveLlm().summarize(t.text, "voicemail");

  await db.voicemailMessage.update({
    where: { id: vm.id },
    data: {
      aiSummary: summary.summary,
      urgency: summary.urgency,
      transcript: { create: { text: t.text, engine: t.engine, segments: (t.segments ?? undefined) as unknown as Prisma.InputJsonValue } },
    },
  });
}
