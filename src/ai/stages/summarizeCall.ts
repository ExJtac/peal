import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ari } from "@/telephony/ariClient";
import { resolveStt } from "../providers/stt/resolve";
import { resolveLlm } from "../providers/llm/resolve";

// Async AI stage: transcribe a recorded call + attach a Claude summary/action-items/sentiment.
// The recording lives in Asterisk (the VM), so a real STT engine downloads it via ARI to a temp
// file first; the mock STT ignores file content (offline/free). Off the media path.
export async function summarizeCall(callRecordId: string): Promise<void> {
  const rec = await db.callRecord.findUnique({ where: { id: callRecordId } });
  if (!rec?.recordingPath) return;

  const stt = resolveStt();
  let audioPath = rec.recordingPath;
  let cleanup: (() => Promise<void>) | null = null;

  if (stt.name !== "mock") {
    const buf = await ari.getStoredRecordingFile(rec.recordingPath).catch(() => null);
    if (!buf) return; // recording not retrievable (e.g. Asterisk unreachable) — leave for retry
    const dir = await mkdtemp(join(tmpdir(), "pbx-rec-"));
    audioPath = join(dir, `${rec.recordingPath}.wav`);
    await writeFile(audioPath, buf);
    cleanup = async () => {
      await unlink(audioPath).catch(() => {});
    };
  }

  try {
    const t = await stt.transcribe(audioPath);
    const s = await resolveLlm().summarize(t.text, "call");
    await db.callRecord.update({
      where: { id: rec.id },
      data: {
        aiSummary: s.summary,
        aiSentiment: s.sentiment,
        aiActionItems: s.actionItems,
        transcript: {
          create: { text: t.text, engine: t.engine, segments: (t.segments ?? undefined) as unknown as Prisma.InputJsonValue },
        },
      },
    });
  } finally {
    if (cleanup) await cleanup();
  }
}
