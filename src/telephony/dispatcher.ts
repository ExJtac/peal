// Routes ARI events to handlers. Teardown happens only on ChannelDestroyed (StasisEnd fires
// when a channel merely leaves our app — e.g. handed to native voicemail — and must NOT be
// treated as end-of-call).
import type { AriEvent } from "./events";
import { onStasisStart } from "./routing";
import { onDialedEnded, onCallerEnded } from "./originate";
import { feedDtmf, endIvr } from "./ivrInterpreter";
import { getSession, deleteSession, activeChannelCount } from "./callSession";
import { finalizeCallRecord } from "./callRecord";
import { enqueueCallSummary } from "./recording";
import { setStatus } from "./status";
import { agentByCaller, agentByEm } from "./realtime-media/agentRegistry";

export async function dispatch(ev: AriEvent): Promise<void> {
  try {
    switch (ev.type) {
      case "StasisStart":
        await onStasisStart(ev);
        break;
      case "ChannelDtmfReceived": {
        if (!ev.channel || !ev.digit) break;
        // An AI-agent call owns its DTMF (barge-in + operator shortcut); else feed the IVR.
        const agent = agentByCaller(ev.channel.id);
        if (agent) agent.onDtmf(ev.digit);
        else feedDtmf(ev.channel.id, ev.digit);
        break;
      }
      case "ChannelDestroyed": {
        const id = ev.channel?.id;
        if (!id) break;
        // If an AI agent owns this channel (caller or its externalMedia leg), let it tear down /
        // reroute BEFORE the generic session finalize below.
        const agent = agentByCaller(id) ?? agentByEm(id);
        if (agent) await agent.handleChannelGone(id).catch(() => {});
        await onDialedEnded(id).catch(() => {});
        await onCallerEnded(id).catch(() => {});
        endIvr(id);
        const s = getSession(id);
        if (s) {
          await finalizeCallRecord(s.callRecordId, { hangupCause: (ev.cause_txt as string) ?? undefined }).catch(() => {});
          if (s.recordingName) await enqueueCallSummary(s.callRecordId).catch(() => {});
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
