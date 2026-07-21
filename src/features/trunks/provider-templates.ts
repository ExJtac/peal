// Provider trunk templates. Picking a provider in the Add-trunk form pre-fills these fields, so
// bring-your-own-trunk setup is a paste-the-credentials job instead of a research project. Values
// are the provider's documented SIP settings; the operator still supplies their own
// username/password (REGISTER) or gets their source IP allow-listed (IP_AUTH).
//
// NAT NOTE (why authMode matters for the dev VM): the Lima vzNAT dev VM is double-NAT'd to the
// internet with no port-forward. A REGISTER (credentials) trunk registers OUT to the ITSP and
// keeps a pinhole, so inbound PSTN returns down it — it works behind NAT. An IP_AUTH trunk needs
// the ITSP to reach us at a stable public IP, which a double-NAT'd VM does not have. So prefer
// REGISTER for the home/dev test; IP_AUTH is a production choice for a publicly-reachable host.
// See TRUNK-SETUP.md.

export type AuthMode = "REGISTER" | "IP_AUTH";
export type Transport = "UDP" | "TCP" | "TLS";

export interface TrunkTemplate {
  provider: string; // matches the Prisma TrunkProvider enum
  label: string;
  authMode: AuthMode;
  transport: Transport;
  sipServer: string;
  port: number;
  authIps: string[]; // ITSP signaling IPs to allow-list for IP_AUTH (empty for REGISTER)
  registerEnabled: boolean;
  codecs: string;
  /** Shown under the form so the operator knows what this provider needs. */
  hint: string;
  /** Best fit for a home/dev test behind NAT? Drives the "recommended" nudge in the UI. */
  natFriendly: boolean;
}

export const TRUNK_TEMPLATES: Record<string, TrunkTemplate> = {
  TELNYX: {
    provider: "TELNYX",
    label: "Telnyx",
    // Telnyx SIP Connections support BOTH credentials (registration) and IP auth. Credentials is
    // the NAT-friendly default for the dev VM; switch to IP_AUTH + authIps for a public host.
    authMode: "REGISTER",
    transport: "UDP",
    sipServer: "sip.telnyx.com",
    port: 5060,
    authIps: ["192.76.120.10", "64.16.250.10", "64.16.250.20"],
    registerEnabled: true,
    codecs: "ulaw, alaw",
    hint: "Credentials connection: set the SIP username/password from the Telnyx portal (Connection → Credentials). For a public host you can instead use IP authentication (set Auth mode = IP auth and allow-list the IPs above).",
    natFriendly: true,
  },
  VOIPMS: {
    provider: "VOIPMS",
    label: "VoIP.ms",
    authMode: "REGISTER",
    transport: "UDP",
    // VoIP.ms registers to a chosen POP, e.g. chicago.voip.ms / newyork.voip.ms — set yours.
    sipServer: "chicago.voip.ms",
    port: 5060,
    authIps: [],
    registerEnabled: true,
    codecs: "ulaw, alaw",
    hint: "Registration trunk (SIP sub-account username/password). Set SIP server to your chosen POP (e.g. chicago.voip.ms). Self-serve; NAT-friendly.",
    natFriendly: true,
  },
  BANDWIDTH: {
    provider: "BANDWIDTH",
    label: "Bandwidth",
    // Bandwidth's core SIP trunking is source-IP authenticated (allow-list), not registration —
    // a poor fit for a double-NAT'd home VM (needs a publicly-reachable, allow-listed IP).
    authMode: "IP_AUTH",
    transport: "UDP",
    sipServer: "",
    port: 5060,
    authIps: [],
    registerEnabled: false,
    codecs: "ulaw, alaw",
    hint: "IP-authenticated trunk: get your peer/host from the Bandwidth dashboard and allow-list Bandwidth's signaling IPs. Requires a publicly-reachable Asterisk — not workable on the double-NAT dev VM without port-forwarding.",
    natFriendly: false,
  },
  TWILIO: {
    provider: "TWILIO",
    label: "Twilio",
    authMode: "REGISTER",
    transport: "UDP",
    sipServer: "", // <your-trunk>.pstn.twilio.com — set from the Twilio Elastic SIP Trunk
    port: 5060,
    authIps: [],
    registerEnabled: true,
    codecs: "ulaw, alaw",
    // OUTBOUND-ONLY behind NAT: Twilio termination (outbound) works via a Credential List, but
    // origination (inbound) is a PUSH to a public Origination URI — Twilio never registers, so
    // there is no pinhole and inbound cannot reach the double-NAT dev VM.
    hint: "Twilio Elastic SIP Trunking. Set SIP server to your <trunk>.pstn.twilio.com termination URI. Outbound works via a Credential List; INBOUND (origination) is push-to-a-public-URI with no registration, so it can't reach the NAT'd dev VM — outbound-only here. Twilio recommends TLS/SRTP.",
    natFriendly: false,
  },
  GENERIC: {
    provider: "GENERIC",
    label: "Generic / other ITSP",
    authMode: "REGISTER",
    transport: "UDP",
    sipServer: "",
    port: 5060,
    authIps: [],
    registerEnabled: true,
    codecs: "ulaw, alaw",
    hint: "Any SIP trunk. Prefer a registration (username/password) trunk for a host behind NAT.",
    natFriendly: true,
  },
};

export const DEFAULT_PROVIDER = "TELNYX";

export function templateFor(provider: string): TrunkTemplate {
  return TRUNK_TEMPLATES[provider] ?? TRUNK_TEMPLATES[DEFAULT_PROVIDER];
}
