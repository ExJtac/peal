import { describe, it, expect } from "vitest";
import { evaluateControlPlaneHealth } from "@/lib/health";

const NOW = 1_700_000_000_000;
const fresh = new Date(NOW - 5_000); // 5s old heartbeat
const stale = new Date(NOW - 120_000); // 2m old heartbeat

describe("evaluateControlPlaneHealth", () => {
  it("is healthy when ARI is connected, Asterisk reachable, heartbeat fresh", () => {
    const v = evaluateControlPlaneHealth(
      { ariConnected: true, asteriskReachable: true, updatedAt: fresh },
      NOW,
    );
    expect(v.healthy).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it("flags a missing SystemStatus row", () => {
    const v = evaluateControlPlaneHealth(null, NOW);
    expect(v.healthy).toBe(false);
    expect(v.reasons[0]).toMatch(/never started/);
  });

  it("flags ARI disconnected", () => {
    const v = evaluateControlPlaneHealth(
      { ariConnected: false, asteriskReachable: true, updatedAt: fresh },
      NOW,
    );
    expect(v.healthy).toBe(false);
    expect(v.reasons).toContain("ARI daemon is disconnected");
  });

  it("flags Asterisk unreachable", () => {
    const v = evaluateControlPlaneHealth(
      { ariConnected: true, asteriskReachable: false, updatedAt: fresh },
      NOW,
    );
    expect(v.healthy).toBe(false);
    expect(v.reasons).toContain("Asterisk is unreachable");
  });

  it("flags a stale heartbeat even when the last-known flags were up", () => {
    const v = evaluateControlPlaneHealth(
      { ariConnected: true, asteriskReachable: true, updatedAt: stale },
      NOW,
    );
    expect(v.healthy).toBe(false);
    expect(v.reasons.some((r) => r.includes("stale"))).toBe(true);
  });

  it("respects a custom staleness threshold", () => {
    const snap = { ariConnected: true, asteriskReachable: true, updatedAt: new Date(NOW - 30_000) };
    expect(evaluateControlPlaneHealth(snap, NOW, 60_000).healthy).toBe(true);
    expect(evaluateControlPlaneHealth(snap, NOW, 10_000).healthy).toBe(false);
  });
});
