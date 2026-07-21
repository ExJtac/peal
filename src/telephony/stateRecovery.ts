// On (re)connect, re-adopt in-flight channels so a daemon restart doesn't orphan live calls.
// The durable per-call truth is stashed in Asterisk channel variables (CALLREC_ID), so we can
// rebuild our working set by reading them back. Full re-bridging / IVR-resume is a Phase-1.1
// enhancement; re-registering known channels here means they are cleaned up correctly on hangup.
import { ari } from "./ariClient";
import { getSession, putSession } from "./callSession";
import type { CallDirection } from "@prisma/client";

export async function recoverState(): Promise<void> {
  let channels;
  try {
    channels = await ari.listChannels();
  } catch {
    return;
  }
  let readopted = 0;
  for (const ch of channels) {
    if (getSession(ch.id)) continue;
    const recId = await ari.getVar(ch.id, "CALLREC_ID");
    if (recId) {
      putSession({
        channelId: ch.id,
        callRecordId: recId,
        direction: "INBOUND" as CallDirection,
        retries: 0,
        createdAt: Date.now(),
      });
      readopted++;
    }
  }
  if (readopted) console.log(`[ari] re-adopted ${readopted} in-flight channel(s) after reconnect`);
}
