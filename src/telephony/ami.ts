// Minimal Asterisk Manager Interface (AMI) client — worker-safe (plain node:net, no
// "server-only"). We drive call CONTROL over ARI; AMI is used for exactly ONE thing ARI
// can't do: pushing a SIP `NOTIFY Event: check-sync` to a phone (reboot / re-provision) via
// the `PJSIPNotify` action. Engine side: asterisk/etc/manager.conf + pjsip_notify.conf.
//
// The endpoint name is the device's assigned extension number (ps_endpoints.id = ext.number,
// see src/telephony/realtime/psSchema.ts endpointRowForExtension).
import { connect } from "node:net";
import { AMI_HOST, AMI_PORT, AMI_USER, AMI_PASSWORD } from "@/lib/env";

export type NotifyMode = "resync" | "reboot";

export interface AmiOptions {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  timeoutMs?: number;
}

// check-sync payload flag: reboot=false re-reads config ("force provision"); true reboots.
const REBOOT_FLAG: Record<NotifyMode, string> = { resync: "false", reboot: "true" };

let seq = 0;
const nextActionId = (): string => `pbx-${++seq}`;

/** Build an AMI action frame. A value may be an array → repeated header lines (e.g. Variable). */
export function buildAction(fields: Array<[string, string | string[]]>): string {
  const lines: string[] = [];
  for (const [k, v] of fields) {
    if (Array.isArray(v)) for (const item of v) lines.push(`${k}: ${item}`);
    else lines.push(`${k}: ${v}`);
  }
  return lines.join("\r\n") + "\r\n\r\n";
}

export function buildLoginAction(user: string, password: string, actionId: string): string {
  return buildAction([
    ["Action", "Login"],
    ["Username", user],
    ["Secret", password],
    ["ActionID", actionId],
  ]);
}

export function buildNotifyAction(endpoint: string, mode: NotifyMode, actionId: string): string {
  // Version-independent form: an inline Variable yields `Event: check-sync;reboot=...` regardless
  // of the Asterisk point release (vs. the release-dependent `Option:` config-reference form).
  return buildAction([
    ["Action", "PJSIPNotify"],
    ["Endpoint", endpoint],
    ["ActionID", actionId],
    ["Variable", `Event=check-sync;reboot=${REBOOT_FLAG[mode]}`],
  ]);
}

/**
 * Parse an AMI byte stream into blocks (maps of lowercased header → value). Lines without a
 * colon — notably the `Asterisk Call Manager/x.y.z` connect banner — are ignored.
 */
export function parseAmiBlocks(raw: string): Array<Record<string, string>> {
  const blocks: Array<Record<string, string>> = [];
  for (const chunk of raw.split("\r\n\r\n")) {
    const map: Record<string, string> = {};
    let any = false;
    for (const line of chunk.split("\r\n")) {
      const idx = line.indexOf(":");
      if (idx < 1) continue;
      map[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
      any = true;
    }
    if (any) blocks.push(map);
  }
  return blocks;
}

export interface NotifyResult {
  ok: boolean;
  message: string;
}

/**
 * Log in over AMI and send a check-sync NOTIFY to `endpoint`. Resolves (never rejects) with
 * `{ ok, message }` so callers can surface a friendly result. A valid realtime endpoint returns
 * Success even with no phone currently registered (Asterisk simply has no contact to notify).
 */
export async function pjsipNotify(
  endpoint: string,
  mode: NotifyMode,
  opts: AmiOptions = {},
): Promise<NotifyResult> {
  const host = opts.host ?? AMI_HOST;
  const port = opts.port ?? AMI_PORT;
  const user = opts.user ?? AMI_USER;
  const password = opts.password ?? AMI_PASSWORD;
  const timeoutMs = opts.timeoutMs ?? 5000;

  if (!endpoint) return { ok: false, message: "No endpoint — assign an extension to the device first." };
  if (!password) return { ok: false, message: "AMI_PASSWORD is not set." };

  return new Promise<NotifyResult>((resolve) => {
    const socket = connect({ host, port });
    let buffer = "";
    let settled = false;
    const waiters = new Map<string, (b: Record<string, string>) => void>();
    const received = new Map<string, Record<string, string>>();

    const done = (result: NotifyResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.write(buildAction([["Action", "Logoff"]]));
      } catch {
        /* best-effort */
      }
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => done({ ok: false, message: `AMI timeout after ${timeoutMs}ms` }), timeoutMs);

    const waitFor = (actionId: string) =>
      new Promise<Record<string, string>>((res) => {
        const early = received.get(actionId);
        if (early) {
          received.delete(actionId);
          res(early);
          return;
        }
        waiters.set(actionId, res);
      });

    socket.on("connect", async () => {
      try {
        const loginId = nextActionId();
        const loginP = waitFor(loginId);
        socket.write(buildLoginAction(user, password, loginId));
        const login = await loginP;
        if ((login.response ?? "").toLowerCase() !== "success") {
          done({ ok: false, message: login.message || "AMI login failed" });
          return;
        }
        const notifyId = nextActionId();
        const notifyP = waitFor(notifyId);
        socket.write(buildNotifyAction(endpoint, mode, notifyId));
        const notify = await notifyP;
        const ok = (notify.response ?? "").toLowerCase() === "success";
        done({ ok, message: notify.message || (ok ? "NOTIFY sent" : "PJSIPNotify failed") });
      } catch (e) {
        done({ ok: false, message: (e as Error).message ?? String(e) });
      }
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx: number;
      while ((idx = buffer.indexOf("\r\n\r\n")) !== -1) {
        const raw = buffer.slice(0, idx + 4);
        buffer = buffer.slice(idx + 4);
        for (const block of parseAmiBlocks(raw)) {
          const id = block.actionid;
          if (!id) continue;
          const w = waiters.get(id);
          if (w) {
            waiters.delete(id);
            w(block);
          } else {
            received.set(id, block);
          }
        }
      }
    });

    socket.on("error", (err) => done({ ok: false, message: `AMI connection error: ${err.message}` }));
    socket.on("close", () => done({ ok: false, message: "AMI connection closed before a response." }));
  });
}
