import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { resolveStt } from "../providers/stt/resolve";
import { resolveLlm } from "../providers/llm/resolve";
import { mediaExists } from "../media";

// Async AI stage: transcribe a recorded call and attach a structured summary/action-items/
// sentiment for reporting + CRM. Off the media path.
export async function summarizeCall(callRecordId: string): Promise<void> {
  const rec = await db.callRecord.findUnique({ where: { id: callRecordId } });
  if (!rec?.recordingPath) return;

  const stt = resolveStt();
  if (stt.name !== "mock" && !mediaExists(rec.recordingPath)) return;

  const t = await stt.transcribe(rec.recordingPath);
  const s = await resolveLlm().summarize(t.text, "call");

  await db.callRecord.update({
    where: { id: rec.id },
    data: {
      aiSummary: s.summary,
      aiSentiment: s.sentiment,
      aiActionItems: s.actionItems,
      transcript: { create: { text: t.text, engine: t.engine, segments: (t.segments ?? undefined) as unknown as Prisma.InputJsonValue } },
    },
  });
}
