// Registry of live AI-agent sessions, keyed by BOTH the caller channel id and the externalMedia
// channel id, so the dispatcher can route a DTMF / ChannelDestroyed event to the owning session
// from either channel. Kept free of an AgentSession import (no cycle) via a structural interface.
// Worker-safe.

export interface RegisteredAgent {
  readonly callerChannelId: string;
  readonly emChannelId: string;
  onDtmf(digit: string): void;
  /** A channel this session owns (caller or its externalMedia leg) was destroyed. */
  handleChannelGone(channelId: string): Promise<void>;
  /** Graceful daemon shutdown — reroute the caller to fallback. */
  shutdown(): Promise<void>;
}

const byCaller = new Map<string, RegisteredAgent>();
const byEm = new Map<string, RegisteredAgent>();

export function registerAgent(a: RegisteredAgent): void {
  byCaller.set(a.callerChannelId, a);
  byEm.set(a.emChannelId, a);
}
export function agentByCaller(channelId: string): RegisteredAgent | undefined {
  return byCaller.get(channelId);
}
export function agentByEm(channelId: string): RegisteredAgent | undefined {
  return byEm.get(channelId);
}
export function unregisterAgent(callerChannelId: string, emChannelId: string): void {
  byCaller.delete(callerChannelId);
  byEm.delete(emChannelId);
}
export function activeAgentCount(): number {
  return byCaller.size;
}

/** Graceful shutdown: reroute every live AI call to its fallback before the daemon exits. */
export async function drainAgents(): Promise<void> {
  const agents = new Set(byCaller.values());
  await Promise.all([...agents].map((a) => a.shutdown().catch(() => {})));
}
