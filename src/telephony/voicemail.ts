// App-owned voicemail capture over ARI. Replaces the native app_voicemail primary path so we get
// the audio into our own store + DB → async transcription + email + a portal audio player. Mirrors
// the call-recording pattern (record via ARI, fetch later via ari.getStoredRecordingFile). The
// native `[vmdirect]` dialplan path is retained as the catch-fallback + for control-plane-down
// degraded mode. Worker-safe.
import { ari } from "./ariClient";
import { db } from "@/lib/db";
import { enqueueAiJob } from "@/lib/queue";
import { finalizeCallRecord } from "./callRecord";
import type { Extension, VoicemailBox } from "@prisma/client";
import type { LiveRecording } from "./events";

interface VmCapture {
  callerChannelId: string;
  recordingName: string;
  box: VoicemailBox;
  ext: Extension;
  callRecordId: string;
  fromNumber?: string;
  fromName?: string;
  startedAt: number;
  done: boolean;
}

const byName = new Map<string, VmCapture>(); // recordingName -> capture (RecordingFinished key)
const byCaller = new Map<string, string>(); // callerChannelId -> recordingName (ChannelDestroyed key)
const playWaiters = new Map<string, () => void>(); // playbackId -> resolver

const MAX_VM_SECONDS = 120;
const MAX_SILENCE_SECONDS = 5;
const MIN_VM_SECONDS = 2; // discard empty / hangup-during-greeting junk
const DEFAULT_GREETING = "vm-intro"; // Asterisk built-in "…is unavailable, please leave a message"

/** ari.play is fire-and-forget; wait for the PlaybackFinished event (with a timeout fallback) so
 *  the greeting finishes before we start recording. */
async function playAndWait(channelId: string, media: string, timeoutMs = 10_000): Promise<void> {
  let pb: { id: string } | null = null;
  try {
    pb = await ari.play(channelId, media);
  } catch {
    return; // playback failed to start — skip it, don't block the message
  }
  if (!pb?.id) return;
  const id = pb.id;
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      playWaiters.delete(id);
      resolve();
    }, timeoutMs);
    playWaiters.set(id, () => {
      clearTimeout(t);
      resolve();
    });
  });
}

export function onPlaybackFinished(playbackId: string): void {
  const w = playWaiters.get(playbackId);
  if (w) {
    playWaiters.delete(playbackId);
    w();
  }
}

/** Record a voicemail for `ext` on the caller channel. This IS the new sendToVoicemail body. */
export async function startVoicemailCapture(callerChannelId: string, ext: Extension, callRecordId: string): Promise<void> {
  await finalizeCallRecord(callRecordId, { disposition: "VOICEMAIL" }).catch(() => {});
  const box = await db.voicemailBox.findUnique({ where: { extensionId: ext.id } });
  if (!box) return nativeFallback(callerChannelId, ext.number);

  try {
    await ari.answer(callerChannelId).catch(() => {});
    const ch = await ari.getChannel(callerChannelId).catch(() => null);
    const fromNumber = ch?.caller?.number || undefined;
    const fromName = ch?.caller?.name || undefined;

    await playAndWait(callerChannelId, `sound:${box.greetingPath || DEFAULT_GREETING}`);

    const name = `vm-${callRecordId}`;
    const cap: VmCapture = { callerChannelId, recordingName: name, box, ext, callRecordId, fromNumber, fromName, startedAt: Date.now(), done: false };
    byName.set(name, cap);
    byCaller.set(callerChannelId, name);
    // beep:true plays a beep before recording; terminateOn "#" + maxSilence end it early.
    await ari.record(callerChannelId, name, {
      maxDurationSeconds: MAX_VM_SECONDS,
      maxSilenceSeconds: MAX_SILENCE_SECONDS,
      terminateOn: "#",
      beep: true,
    });
  } catch {
    byCaller.delete(callerChannelId);
    for (const [n, c] of byName) if (c.callerChannelId === callerChannelId) byName.delete(n);
    return nativeFallback(callerChannelId, ext.number);
  }
}

async function nativeFallback(callerChannelId: string, extNumber: string): Promise<void> {
  await ari.continueInDialplan(callerChannelId, "vmdirect", extNumber, 1).catch(async () => {
    await ari.hangup(callerChannelId).catch(() => {});
  });
}

/** Recording stopped (maxDuration / "#" / silence / hangup). */
export async function onRecordingFinished(rec?: LiveRecording): Promise<void> {
  if (!rec?.name) return;
  const cap = byName.get(rec.name);
  if (!cap) return;
  const dur = typeof rec.duration === "number" ? rec.duration : Math.round((Date.now() - cap.startedAt) / 1000);
  await finalizeVoicemail(cap, dur);
}

/** Caller hung up while (or just after) leaving a message — backstop for RecordingFinished. */
export async function onVoicemailCallerGone(callerChannelId: string): Promise<void> {
  const name = byCaller.get(callerChannelId);
  if (!name) return;
  const cap = byName.get(name);
  if (!cap) {
    byCaller.delete(callerChannelId);
    return;
  }
  await finalizeVoicemail(cap, Math.round((Date.now() - cap.startedAt) / 1000));
}

async function finalizeVoicemail(cap: VmCapture, durationSec: number): Promise<void> {
  if (cap.done) return; // once-guard: RecordingFinished vs ChannelDestroyed race
  cap.done = true;
  byName.delete(cap.recordingName);
  byCaller.delete(cap.callerChannelId);

  if (durationSec < MIN_VM_SECONDS) {
    await ari.hangup(cap.callerChannelId).catch(() => {}); // empty message — no row
    return;
  }

  try {
    const vm = await db.voicemailMessage.create({
      data: {
        boxId: cap.box.id,
        audioPath: cap.recordingName,
        fromNumber: cap.fromNumber ?? null,
        fromName: cap.fromName ?? null,
        durationSec,
        folder: "INBOX",
        read: false,
      },
    });
    await enqueueAiJob("TRANSCRIBE_VOICEMAIL", { voicemailMessageId: vm.id }).catch(() => {});
    await refreshMwi(cap.box);
  } catch {
    /* best-effort — never block the hangup on a DB/queue hiccup */
  }
  await ari.hangup(cap.callerChannelId).catch(() => {});
}

/** Republish the message-waiting count to the phone (we own MWI now that VM is app-owned). */
async function refreshMwi(box: VoicemailBox): Promise<void> {
  try {
    const [newMessages, oldMessages] = await Promise.all([
      db.voicemailMessage.count({ where: { boxId: box.id, folder: "INBOX", read: false } }),
      db.voicemailMessage.count({ where: { boxId: box.id, folder: "OLD" } }),
    ]);
    await ari.setMwi(`${box.mailbox}@default`, { newMessages, oldMessages }).catch(() => {});
  } catch {
    /* MWI is best-effort */
  }
}
