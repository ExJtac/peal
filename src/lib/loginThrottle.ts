// In-memory login lockout: after LOGIN_MAX_FAILS consecutive failures for an email, further
// attempts are rejected for LOGIN_LOCK_SECONDS. Single-instance (matches the single-tenant deploy);
// state resets on restart, which is acceptable — the goal is to blunt online password guessing, not
// to be a distributed rate limiter. Network-layer SIP brute-force is fail2ban's job (see HARDENING).

interface Attempt {
  fails: number;
  lockedUntil: number; // epoch ms; 0 = not locked
}

const attempts = new Map<string, Attempt>();
const MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS ?? "5");
const LOCK_MS = Number(process.env.LOGIN_LOCK_SECONDS ?? "300") * 1000;

/** Is this key currently locked out? */
export function checkLock(key: string, now: number): { locked: boolean; retryAfterSec: number } {
  const a = attempts.get(key);
  if (a && a.lockedUntil > now) return { locked: true, retryAfterSec: Math.ceil((a.lockedUntil - now) / 1000) };
  return { locked: false, retryAfterSec: 0 };
}

/** Record a failed attempt; lock the key once it reaches the threshold. */
export function recordFailure(key: string, now: number): void {
  const a = attempts.get(key) ?? { fails: 0, lockedUntil: 0 };
  if (a.lockedUntil > now) return; // already locked — don't extend on stray attempts
  a.fails += 1;
  if (a.fails >= MAX_FAILS) {
    a.lockedUntil = now + LOCK_MS;
    a.fails = 0; // reset the counter; the lock is the deterrent
  }
  attempts.set(key, a);
}

/** Clear all failure state for a key (on successful login). */
export function recordSuccess(key: string): void {
  attempts.delete(key);
}

/** Test-only. */
export function __resetLoginThrottle(): void {
  attempts.clear();
}
