// Routes ARI events to handlers. Teardown happens only on ChannelDestroyed (StasisEnd fires
// when a channel merely leaves our app — e.g. handed to native voicemail — and must NOT be
// treated as end-of-call).
import type { AriEvent } from "./events";
import { onStasisStart } from "./routing";
import { onDialedEnded, onCallerEnded } from "./originate";
import { feedDtmf, endIvr } from "./ivrInterpreter";
import { getSession, deleteSession, activeChannelCount } from "./callSession";
import { finalizeCallRecord } from "./callRecord";
import { setStatus } from "./status";

export async function dispatch(ev: AriEvent): Promise<void> {
  try {
    switch (ev.type) {
      case "StasisStart":
        await onStasisStart(ev);
        break;
      case "ChannelDtmfReceived":
        if (ev.channel && ev.digit) feedDtmf(ev.channel.id, ev.digit);
        break;
      case "ChannelDestroyed": {
        const id = ev.channel?.id;
        if (!id) break;
        await onDialedEnded(id).catch(() => {});
        await onCallerEnded(id).catch(() => {});
        endIvr(id);
        const s = getSession(id);
        if (s) {
          await finalizeCallRecord(s.callRecordId, { hangupCause: (ev.cause_txt as string) ?? undefined }).catch(() => {});
          deleteSession(id);
        }
        break;
      }
      default:
        break;
    }
  } finally {
    await setStatus({ activeChannels: activeChannelCount(), lastEventAt: new Date() });
  }
}
