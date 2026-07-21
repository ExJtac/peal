import { describe, it, expect, beforeEach } from "vitest";
import { checkLock, recordFailure, recordSuccess, __resetLoginThrottle } from "@/lib/loginThrottle";

const NOW = 1_700_000_000_000;

beforeEach(() => __resetLoginThrottle());

describe("login throttle", () => {
  it("is not locked initially", () => {
    expect(checkLock("a@x.com", NOW).locked).toBe(false);
  });

  it("locks after 5 consecutive failures", () => {
    for (let i = 0; i < 5; i++) recordFailure("a@x.com", NOW);
    const l = checkLock("a@x.com", NOW);
    expect(l.locked).toBe(true);
    expect(l.retryAfterSec).toBeGreaterThan(0);
  });

  it("stays unlocked below the threshold", () => {
    for (let i = 0; i < 4; i++) recordFailure("a@x.com", NOW);
    expect(checkLock("a@x.com", NOW).locked).toBe(false);
  });

  it("a successful login clears the failure count", () => {
    for (let i = 0; i < 4; i++) recordFailure("a@x.com", NOW);
    recordSuccess("a@x.com");
    for (let i = 0; i < 4; i++) recordFailure("a@x.com", NOW);
    expect(checkLock("a@x.com", NOW).locked).toBe(false); // only 4 fresh failures
  });

  it("the lock expires after the window", () => {
    for (let i = 0; i < 5; i++) recordFailure("a@x.com", NOW);
    expect(checkLock("a@x.com", NOW).locked).toBe(true);
    expect(checkLock("a@x.com", NOW + 301_000).locked).toBe(false); // default 300s window elapsed
  });

  it("is per-email (locking one account doesn't lock another)", () => {
    for (let i = 0; i < 5; i++) recordFailure("a@x.com", NOW);
    expect(checkLock("b@x.com", NOW).locked).toBe(false);
  });
});
