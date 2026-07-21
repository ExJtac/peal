// In-memory per-call registry for the ARI daemon. The DURABLE truth for a live call lives in
// Asterisk channel variables (so a daemon restart can recover via stateRecovery); this map is
// just the hot working set for the current process.
import type { CallDirection } from "@prisma/client";

export interface CallSession {
  channelId: string;
  callRecordId: string;
  direction: CallDirection;
  bridgeId?: string;
  ivrFlowId?: string;
  ivrNodeId?: string;
  retries: number;
  dialedChannelId?: string;
  createdAt: number;
}

export interface PendingDial {
  callerChannelId: string;
  bridgeId: string;
  ringGroupId?: string;
  onAnswered?: () => void;
}

const sessions = new Map<string, CallSession>();
const pendingDials = new Map<string, PendingDial>();

export function putSession(s: CallSession): void {
  sessions.set(s.channelId, s);
}
export function getSession(channelId: string): CallSession | undefined {
  return sessions.get(channelId);
}
export function updateSession(channelId: string, patch: Partial<CallSession>): void {
  const s = sessions.get(channelId);
  if (s) sessions.set(channelId, { ...s, ...patch });
}
export function deleteSession(channelId: string): void {
  sessions.delete(channelId);
}
export function activeChannelCount(): number {
  return sessions.size;
}
export function activeOutboundCount(): number {
  let n = 0;
  for (const s of sessions.values()) if (s.direction === "OUTBOUND") n++;
  return n;
}

export function putPendingDial(dialedChannelId: string, p: PendingDial): void {
  pendingDials.set(dialedChannelId, p);
}
export function takePendingDial(dialedChannelId: string): PendingDial | undefined {
  const p = pendingDials.get(dialedChannelId);
  pendingDials.delete(dialedChannelId);
  return p;
}
export function peekPendingDial(dialedChannelId: string): PendingDial | undefined {
  return pendingDials.get(dialedChannelId);
}
export function forgetPendingDial(dialedChannelId: string): void {
  pendingDials.delete(dialedChannelId);
}
