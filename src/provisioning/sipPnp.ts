// SIP-PnP ("ua-profile" event) responder helpers. On boot, many phones multicast a SUBSCRIBE
// to 224.0.1.75:5060 for `Event: ua-profile`. We reply 200 OK then NOTIFY with the phone's
// per-MAC provisioning URL → zero-touch on-LAN. Best-effort: manual URL provisioning
// (phone web UI → auto-provision → our /provision/<mac> URL) is the reliable fallback.
// Pure string/parse helpers here; the UDP multicast socket lives in worker/pnp.

export interface SipRequest {
  method: string;
  uri: string;
  headers: Record<string, string>;
  raw: string;
}

export function parseSipRequest(raw: string): SipRequest | null {
  const lines = (raw ?? "").split(/\r?\n/);
  const start = lines[0]?.split(" ");
  if (!start || start.length < 2) return null;
  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) break; // blank line ends headers
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return { method: start[0], uri: start[1], headers, raw };
}

/** Fanvil/Yealink User-Agents embed the MAC as a 12-hex token. */
export function macFromUserAgent(ua: string | undefined): string | null {
  const m = /([0-9a-fA-F]{12})/.exec(ua ?? "");
  return m ? m[1].toLowerCase() : null;
}

const h = (req: SipRequest, name: string): string => req.headers[name] ?? "";

export function build200Ok(req: SipRequest): string {
  return [
    "SIP/2.0 200 OK",
    `Via: ${h(req, "via")}`,
    `From: ${h(req, "from")}`,
    `To: ${h(req, "to")};tag=pbxpnp`,
    `Call-ID: ${h(req, "call-id")}`,
    `CSeq: ${h(req, "cseq")}`,
    "Expires: 0",
    "Content-Length: 0",
    "\r\n",
  ].join("\r\n");
}

/** NOTIFY that hands the phone its per-MAC config URL (external-body reference). */
export function buildProfileNotify(req: SipRequest, configUrl: string, localContact: string): string {
  const branch = "z9hG4bK-pbx-" + Math.floor(Date.now()).toString(36);
  return [
    `NOTIFY ${req.uri} SIP/2.0`,
    `Via: SIP/2.0/UDP ${localContact};branch=${branch}`,
    `From: <sip:pbx@${localContact}>;tag=pbxpnp`,
    `To: ${h(req, "from")}`,
    `Call-ID: ${h(req, "call-id")}`,
    "CSeq: 1 NOTIFY",
    `Contact: <sip:${localContact}>`,
    "Event: ua-profile",
    "Subscription-State: terminated;reason=timeout",
    `Content-Type: message/external-body; access-type=URL; URL="${configUrl}"`,
    "Content-Length: 0",
    "\r\n",
  ].join("\r\n");
}
