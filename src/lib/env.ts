// Typed environment access + provider-mode resolution. Worker-safe.

// --- Asterisk ARI ---
export const ARI_APP = process.env.ARI_APP ?? "pbx-app";
export const ARI_HTTP_URL = process.env.ARI_HTTP_URL ?? "http://127.0.0.1:8088";
export const ARI_USER = process.env.ARI_USER ?? "pbx";
export const ARI_PASSWORD = process.env.ARI_PASSWORD ?? "";
export const ARI_WS_PORT = Number(process.env.ARI_WS_PORT ?? "8090");
export const ASTERISK_DB_SCHEMA = process.env.ASTERISK_DB_SCHEMA ?? "asterisk";

// --- SIP / provisioning ---
export const SIP_DOMAIN = process.env.SIP_DOMAIN ?? "pbx.local";
export const SIP_SERVER_HOST = process.env.SIP_SERVER_HOST ?? "";
export const PROVISION_SECRET = process.env.PROVISION_SECRET ?? "dev-only-provision-secret-change-me";

// --- Async AI ---
export const CLAUDE_SUMMARY_MODEL = process.env.CLAUDE_SUMMARY_MODEL ?? "claude-haiku-4-5";
export type SttProviderName = "mock" | "deepgram" | "whisper";
export const STT_PROVIDER = (process.env.STT_PROVIDER ?? "mock") as SttProviderName;

export function globalAnthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || null;
}
export function deepgramKey(): string | null {
  return process.env.DEEPGRAM_API_KEY || null;
}

/** True when a run without a real key/engine may fall back to deterministic mocks. */
export function allowMock(): boolean {
  return process.env.ALLOW_MOCK === "1" || process.env.NODE_ENV !== "production";
}

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export function workerId(prefix: string): string {
  if (process.env.WORKER_ID) return process.env.WORKER_ID;
  // hostname:pid — imported lazily to stay bundler-safe.
  const os = require("node:os") as typeof import("node:os");
  return `${prefix}:${os.hostname()}:${process.pid}`;
}
