// Maps our Prisma models → Asterisk realtime ps_* row objects. Column names MUST match the
// DDL in asterisk/sql/001_ps_tables.sql (Asterisk-dictated). Keep transports/globals out of
// here — those live in pjsip.conf, not realtime.
import type { Extension, Trunk } from "@prisma/client";

type Row = Record<string, string>;

// Our SipTransport enum → the transport section name defined in pjsip.conf. The trunk endpoint,
// its AOR contact, and its registration must all use the transport the operator actually picked
// (a TLS/TCP trunk that silently fell back to UDP would never connect). TLS additionally needs
// [transport-tls] uncommented in pjsip.conf + a cert (documented there).
const TRUNK_TRANSPORT: Record<string, string> = {
  UDP: "transport-udp",
  TCP: "transport-tcp",
  TLS: "transport-tls",
};
export function trunkTransport(trunk: Pick<Trunk, "transport">): string {
  return TRUNK_TRANSPORT[trunk.transport] ?? "transport-udp";
}
// Our MediaEncryption enum → Asterisk's media_encryption value (no | sdes | dtls). NONE = omit the
// key so default trunk rows stay byte-identical. Only meaningful when transport=TLS + a cert exists.
const MEDIA_ENCRYPTION: Record<string, string> = { SDES: "sdes", DTLS: "dtls" };
// SIP URIs to the ITSP must carry an explicit ;transport= for TCP/TLS (UDP is the default, so it
// is left off). TLS also promotes the scheme to sips:.
function uriFor(trunk: Pick<Trunk, "transport">, host: string, port: number): string {
  if (trunk.transport === "TLS") return `sips:${host}:${port};transport=tls`;
  if (trunk.transport === "TCP") return `sip:${host}:${port};transport=tcp`;
  return `sip:${host}:${port}`;
}

export function endpointRowForExtension(ext: Extension): Row {
  const common: Row = {
    id: ext.number,
    aors: ext.number,
    auth: ext.number,
    context: "from-internal",
    disallow: "all",
    direct_media: "no",
    force_rport: "yes",
    rewrite_contact: "yes",
    rtp_symmetric: "yes",
    callerid: `${ext.callerIdName ?? ext.displayName} <${ext.callerIdNumber ?? ext.number}>`,
    mailboxes: `${ext.number}@default`,
    message_context: "from-internal",
  };

  if (ext.webrtc) {
    // Browser softphone: WS signaling + DTLS-SRTP media + ICE (webrtc=yes shorthand, plus the
    // explicit media columns for deterministic realtime behavior). Opus first, then ulaw.
    return {
      ...common,
      transport: "transport-ws",
      allow: "opus,ulaw,alaw",
      webrtc: "yes",
      dtls_auto_generate_cert: "yes",
      media_encryption: "dtls",
      media_use_received_transport: "yes",
      rtcp_mux: "yes",
      use_avpf: "yes",
      ice_support: "yes",
      dtls_verify: "fingerprint",
      dtls_setup: "actpass",
    };
  }

  return {
    ...common,
    transport: "transport-udp",
    allow: ext.codecs?.length ? ext.codecs.join(",") : "ulaw,alaw",
    ice_support: "no",
  };
}
export function authRowForExtension(ext: Extension, password: string): Row {
  return { id: ext.number, auth_type: "userpass", username: ext.number, password };
}
export function aorRowForExtension(ext: Extension): Row {
  return { id: ext.number, max_contacts: String(ext.maxContacts || 1), qualify_frequency: "60", remove_existing: "yes" };
}

export function endpointRowForTrunk(trunk: Trunk): Row {
  const row: Row = {
    id: trunk.name,
    transport: trunkTransport(trunk),
    context: "from-trunk",
    disallow: "all",
    allow: trunk.codecs?.length ? trunk.codecs.join(",") : "ulaw,alaw",
    aors: trunk.name,
    direct_media: "no",
    force_rport: "yes",
    rewrite_contact: "yes",
    rtp_symmetric: "yes",
    from_user: trunk.fromUser ?? "",
    from_domain: trunk.fromDomain ?? trunk.sipServer,
  };
  const enc = MEDIA_ENCRYPTION[trunk.mediaEncryption];
  if (enc) row.media_encryption = enc;
  if (trunk.authMode === "REGISTER" || trunk.username) row.outbound_auth = trunk.name;
  return row;
}
export function aorRowForTrunk(trunk: Trunk): Row {
  // qualify_frequency sends OPTIONS keepalives that also hold the NAT pinhole open for a
  // registration trunk behind NAT (the main reason inbound PSTN keeps working on the dev VM).
  // 30s (not 60) stays under a typical home router's ~30-45s UDP NAT timeout so the pinhole
  // never lapses between calls; qualify_timeout bounds the OPTIONS wait.
  return {
    id: trunk.name,
    contact: uriFor(trunk, trunk.sipServer, trunk.port),
    qualify_frequency: "30",
    qualify_timeout: "3",
  };
}
export function authRowForTrunk(trunk: Trunk, password: string): Row {
  return { id: trunk.name, auth_type: "userpass", username: trunk.username ?? "", password };
}
export function identifyRowForTrunk(trunk: Trunk): Row {
  return { id: trunk.name, endpoint: trunk.name, match: trunk.authIps.join(",") };
}
export function registrationRowForTrunk(trunk: Trunk): Row {
  const scheme = trunk.transport === "TLS" ? "sips" : "sip";
  return {
    id: trunk.name,
    transport: trunkTransport(trunk),
    outbound_auth: trunk.name,
    server_uri: uriFor(trunk, trunk.sipServer, trunk.port),
    client_uri: `${scheme}:${trunk.username ?? trunk.fromUser ?? ""}@${trunk.sipServer}`,
    retry_interval: "60",
    // line + endpoint = "line support": inbound INVITEs that arrive down the REGISTER pinhole are
    // associated with THIS endpoint automatically. Essential for a registration trunk behind NAT
    // that has NO IP-identify row (e.g. VoIP.ms/generic with empty authIps) — without it the
    // inbound call would hit the anonymous endpoint and fail.
    line: "yes",
    endpoint: trunk.name,
    // Short expiry re-REGISTERs often enough to refresh the router's NAT mapping (belt-and-braces
    // with the AOR qualify keepalive).
    expiration: "120",
  };
}
