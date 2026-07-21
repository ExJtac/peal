// Thin, pinned ARI REST wrapper (fetch-based). We own this rather than depend on the
// "best-effort" node-ari-client, and expose only the operations the control plane uses.
// Worker-safe.
import { ARI_HTTP_URL, ARI_USER, ARI_PASSWORD, ARI_APP } from "@/lib/env";
import type { AriChannel, AriBridge, AsteriskInfo } from "./events";

const authHeader = () => "Basic " + Buffer.from(`${ARI_USER}:${ARI_PASSWORD}`).toString("base64");

function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${ARI_HTTP_URL}/ari${path}`, {
    method,
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AriError(`ARI ${method} ${path} → ${res.status} ${text}`, res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export class AriError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export const ari = {
  // --- health ---
  info: () => req<AsteriskInfo>("GET", "/asterisk/info"),
  async ping(): Promise<boolean> {
    try {
      await ari.info();
      return true;
    } catch {
      return false;
    }
  },

  // --- channels ---
  listChannels: () => req<AriChannel[]>("GET", "/channels"),
  getChannel: (id: string) => req<AriChannel>("GET", `/channels/${id}`),
  answer: (id: string) => req<void>("POST", `/channels/${id}/answer`),
  ring: (id: string) => req<void>("POST", `/channels/${id}/ring`),
  hangup: (id: string, reason?: string) => req<void>("DELETE", `/channels/${id}${qs({ reason })}`),
  continueInDialplan: (id: string, context: string, extension: string, priority = 1) =>
    req<void>("POST", `/channels/${id}/continue${qs({ context, extension, priority })}`),
  play: (id: string, media: string) =>
    req<{ id: string }>("POST", `/channels/${id}/play${qs({ media })}`),
  setVar: (id: string, variable: string, value: string) =>
    req<void>("POST", `/channels/${id}/variable${qs({ variable, value })}`),
  async getVar(id: string, variable: string): Promise<string | null> {
    try {
      const r = await req<{ value: string }>("GET", `/channels/${id}/variable${qs({ variable })}`);
      return r?.value ?? null;
    } catch {
      return null;
    }
  },
  /** Originate a new channel that enters our Stasis app (so we can bridge it on answer). */
  originate: (opts: {
    endpoint: string;
    callerId?: string;
    timeout?: number;
    appArgs?: string;
    variables?: Record<string, string>;
  }) =>
    req<AriChannel>("POST", `/channels`, {
      endpoint: opts.endpoint,
      app: ARI_APP,
      appArgs: opts.appArgs ?? "dialed",
      callerId: opts.callerId,
      timeout: opts.timeout ?? 30,
      variables: opts.variables,
    }),
  record: (id: string, name: string, opts: { maxDurationSeconds?: number } = {}) =>
    req<{ name: string }>(
      "POST",
      `/channels/${id}/record${qs({ name, format: "wav", maxDurationSeconds: opts.maxDurationSeconds, ifExists: "overwrite" })}`,
    ),

  // --- bridges ---
  listBridges: () => req<AriBridge[]>("GET", "/bridges"),
  createBridge: (type = "mixing") => req<AriBridge>("POST", `/bridges${qs({ type })}`),
  addToBridge: (bridgeId: string, channelId: string) =>
    req<void>("POST", `/bridges/${bridgeId}/addChannel${qs({ channel: channelId })}`),
  destroyBridge: (bridgeId: string) => req<void>("DELETE", `/bridges/${bridgeId}`),
  startMoh: (bridgeId: string) => req<void>("POST", `/bridges/${bridgeId}/moh`),
  recordBridge: (bridgeId: string, name: string) =>
    req<{ name: string }>(
      "POST",
      `/bridges/${bridgeId}/record${qs({ name, format: "wav", ifExists: "overwrite", beep: "false" })}`,
    ),

  // --- recordings ---
  async getStoredRecordingFile(name: string): Promise<Buffer> {
    const res = await fetch(`${ARI_HTTP_URL}/ari/recordings/stored/${encodeURIComponent(name)}/file`, {
      headers: { Authorization: authHeader() },
    });
    if (!res.ok) throw new AriError(`ARI GET recording ${name} → ${res.status}`, res.status);
    return Buffer.from(await res.arrayBuffer());
  },
};
