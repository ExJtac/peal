import { randomBytes } from "node:crypto";

// Shared secret helpers used by gen-secrets.ts (print), check-secrets.ts (audit), and
// write-secrets.ts (generate-once + fan-out). Single source of truth so the three tools
// agree on WHICH keys are secret, HOW they're generated, and WHAT counts as a placeholder.

// The secrets an operator must set before going live. Order = the order gen-secrets prints.
export const SECRET_KEYS = [
  "AUTH_SECRET",
  "CRED_SECRET",
  "ARI_PASSWORD",
  "AMI_PASSWORD",
  "SEED_PASSWORD",
  "PROVISION_SECRET",
  "E911_NOTIFY_TOKEN",
] as const;

// 32 random bytes base64 — the `openssl rand -base64 32` convention used across .env.example.
export function genSecret(): string {
  return randomBytes(32).toString("base64");
}

// Dev/test placeholder values baked into the app defaults + test/setup.ts. Treated as "not set".
export const DEV_DEFAULTS = new Set([
  "dev-only-insecure-secret-change-me", // AUTH_SECRET (src/lib/auth.ts)
  "dev-only-insecure-cred-secret-change-me", // CRED_SECRET (src/lib/crypto-vault.ts)
  "dev-only-provision-secret-change-me", // PROVISION_SECRET (src/lib/env.ts)
  "test-only-cred-secret", // test/setup.ts
  "test-only-provision-secret", // test/setup.ts
]);

// True when a value is empty or an obvious placeholder — i.e. write-secrets should generate one.
// Catches .env.example hints ("generate-with: openssl rand -base64 32", ""), the demo seed
// password, the CHANGEME_* markers, and generic your-/placeholder tokens.
export function isPlaceholderValue(value: string | undefined | null): boolean {
  const t = (value ?? "").trim();
  if (!t) return true;
  if (DEV_DEFAULTS.has(t)) return true;
  if (t === "password123") return true; // demo seed default (prisma/seed.ts)
  return /generate-with|openssl rand|change[-_ ]?me|changeme|your[-_]|placeholder|xxxx+/i.test(t);
}

// Audit-grade "strong": a real, non-placeholder value of reasonable length (matches
// check-secrets.ts's >= 24 rule for app secrets). Used for reporting, not for the keep/generate
// decision (which uses isPlaceholderValue so a deliberately-set operator value is never clobbered).
export function isStrong(value: string | undefined | null): boolean {
  const t = (value ?? "").trim();
  return !isPlaceholderValue(t) && t.length >= 24;
}
