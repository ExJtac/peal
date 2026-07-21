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
/** WebSocket URL browser softphones connect to (Asterisk /ws). Falls back to SIP_SERVER_HOST:8088. */
export const SIP_WS_URL = process.env.SIP_WS_URL ?? (process.env.SIP_SERVER_HOST ? `ws://${process.env.SIP_SERVER_HOST}:8088/ws` : "");
export const PROVISION_SECRET = process.env.PROVISION_SECRET ?? "dev-only-provision-secret-change-me";

// --- Async AI ---
export const CLAUDE_SUMMARY_MODEL = process.env.CLAUDE_SUMMARY_MODEL ?? "claude-haiku-4-5";
export type SttProviderName = "mock" | "deepgram" | "whisper";
export const STT_PROVIDER = (process.env.STT_PROVIDER ?? "mock") as SttProviderName;

// --- Real-time AI voice agent (receptionist) ---
// The live media loop (externalMedia RTP) + streaming STT → Claude brain → streaming TTS. All
// provider seams default to `mock` (free/offline); real providers turn on only when a key is set.
export type RealtimeSttName = "mock" | "deepgram";
export type RealtimeTtsName = "mock" | "deepgram" | "elevenlabs";
export const REALTIME_STT_PROVIDER = (process.env.REALTIME_STT_PROVIDER ?? "mock") as RealtimeSttName;
export const REALTIME_TTS_PROVIDER = (process.env.REALTIME_TTS_PROVIDER ?? "mock") as RealtimeTtsName;
/** Conversational brain model. Haiku 4.5 = fast + cheap, good for receptionist intent/routing. */
export const AGENT_LLM_MODEL = process.env.AGENT_LLM_MODEL ?? "claude-haiku-4-5";
export const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM"; // "Rachel"
export const DEEPGRAM_TTS_MODEL = process.env.DEEPGRAM_TTS_MODEL ?? "aura-asteria-en";

// externalMedia media path. MEDIA_HOST = where Asterisk sends RTP = this control plane as seen
// from the VM (dev: the Mac at 192.168.64.1; single-VM prod: 127.0.0.1). Each live AI call binds
// one UDP port from [RTP_PORT_START, RTP_PORT_END].
export const MEDIA_HOST = process.env.MEDIA_HOST ?? "127.0.0.1";
export const RTP_PORT_START = Number(process.env.RTP_PORT_START ?? "40000");
export const RTP_PORT_END = Number(process.env.RTP_PORT_END ?? "40099");

export function globalAnthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || null;
}
export function deepgramKey(): string | null {
  return process.env.DEEPGRAM_API_KEY || null;
}
export function elevenLabsKey(): string | null {
  return process.env.ELEVENLABS_API_KEY || null;
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
