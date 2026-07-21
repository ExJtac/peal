// Pure control-plane health evaluation. Worker-safe, no I/O — the script/worker feeds it a
// SystemStatus snapshot + the current time and it decides whether to alert. Kept pure so it's
// unit-tested offline (test/health.test.ts) while the wiring (DB read, email, anti-spam marker)
// lives in scripts/health-check.ts.

export interface HealthSnapshot {
  ariConnected: boolean;
  asteriskReachable: boolean;
  /** SystemStatus.updatedAt — bumped by the ARI daemon's 10s heartbeat. */
  updatedAt: Date | null;
}

export interface HealthVerdict {
  healthy: boolean;
  /** Human-readable reasons the control plane is considered down (empty when healthy). */
  reasons: string[];
}

/** Default heartbeat-staleness threshold: the daemon heartbeats every 10s, so 60s = ~6 missed. */
export const DEFAULT_STALE_MS = 60_000;

export function evaluateControlPlaneHealth(
  snapshot: HealthSnapshot | null,
  nowMs: number,
  staleMs: number = DEFAULT_STALE_MS,
): HealthVerdict {
  const reasons: string[] = [];
  if (!snapshot) {
    return { healthy: false, reasons: ["no SystemStatus row — the ARI daemon has never started"] };
  }
  if (!snapshot.ariConnected) reasons.push("ARI daemon is disconnected");
  if (!snapshot.asteriskReachable) reasons.push("Asterisk is unreachable");
  if (!snapshot.updatedAt) {
    reasons.push("no heartbeat timestamp");
  } else {
    const ageMs = nowMs - snapshot.updatedAt.getTime();
    if (ageMs > staleMs) reasons.push(`heartbeat is stale (${Math.round(ageMs / 1000)}s old)`);
  }
  return { healthy: reasons.length === 0, reasons };
}
