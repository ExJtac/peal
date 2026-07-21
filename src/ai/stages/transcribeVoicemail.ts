import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ari } from "@/telephony/ariClient";
import { resolveStt } from "../providers/stt/resolve";
import { resolveLlm } from "../providers/llm/resolve";
import { resolveEmail } from "../providers/email/resolve";

// Async AI stage: transcribe a voicemail + attach a one-line summary + urgency, then email the
// transcript to the mailbox owner. Enqueued when a new VoicemailMessage lands (voicemail.ts). The
// recording lives in Asterisk (the VM), so a real STT engine / an audio attachment downloads it
// over ARI to a temp file first; the mock STT + mock email run offline/free. Off the media path.
export async function transcribeVoicemail(voicemailMessageId: string): Promise<void> {
  const vm = await db.voicemailMessage.findUnique({ where: { id: voicemailMessageId }, include: { box: true } });
  if (!vm) return;
  if (!vm.box.transcribeEnabled) return;

  const stt = resolveStt();
  const email = resolveEmail();
  // Only fetch the audio bytes for the attachment when a real mailer will actually deliver them.
  const wantAttachment = !!vm.box.email && vm.box.attachAudio && email.name !== "mock";

  let buf: Buffer | null = null;
  let audioPath = vm.audioPath;
  let cleanup: (() => Promise<void>) | null = null;
  if (stt.name !== "mock" || wantAttachment) {
    buf = await ari.getStoredRecordingFile(vm.audioPath).catch(() => null);
    if (stt.name !== "mock" && !buf) return; // recording not retrievable yet — leave for retry
    if (buf && stt.name !== "mock") {
      const dir = await mkdtemp(join(tmpdir(), "pbx-vm-"));
      audioPath = join(dir, `${vm.audioPath}.wav`);
      await writeFile(audioPath, buf);
      cleanup = async () => {
        await unlink(audioPath).catch(() => {});
      };
    }
  }

  try {
    const t = await stt.transcribe(audioPath);
    const summary = await resolveLlm().summarize(t.text, "voicemail");

    await db.voicemailMessage.update({
      where: { id: vm.id },
      data: {
        aiSummary: summary.summary,
        urgency: summary.urgency,
        transcript: { create: { text: t.text, engine: t.engine, segments: (t.segments ?? undefined) as unknown as Prisma.InputJsonValue } },
      },
    });

    // Email the transcript to the mailbox owner (mock provider just logs when SMTP isn't set).
    if (vm.box.email) {
      const from = vm.fromName || vm.fromNumber || "unknown";
      await email
        .send({
          to: vm.box.email,
          subject: `New voicemail from ${from} (${vm.durationSec}s)`,
          text:
            `New voicemail on extension ${vm.box.mailbox}.\n\n` +
            `From: ${from}\nDuration: ${vm.durationSec}s\nUrgency: ${summary.urgency}\n\n` +
            `Summary:\n${summary.summary}\n\nTranscript:\n${t.text}\n`,
          attachments: wantAttachment && buf ? [{ filename: `voicemail-${vm.id}.wav`, content: buf, contentType: "audio/wav" }] : [],
        })
        .catch(() => {});
    }
  } finally {
    if (cleanup) await cleanup();
  }
}
