// Maps our Prisma models → Asterisk realtime ps_* row objects. Column names MUST match the
// DDL in asterisk/sql/001_ps_tables.sql (Asterisk-dictated). Keep transports/globals out of
// here — those live in pjsip.conf, not realtime.
import type { Extension, Trunk } from "@prisma/client";

type Row = Record<string, string>;

export function endpointRowForExtension(ext: Extension): Row {
  return {
    id: ext.number,
    transport: "transport-udp",
    aors: ext.number,
    auth: ext.number,
    context: "from-internal",
    disallow: "all",
    allow: ext.codecs?.length ? ext.codecs.join(",") : "ulaw,alaw",
    direct_media: "no",
    force_rport: "yes",
    rewrite_contact: "yes",
    rtp_symmetric: "yes",
    ice_support: "no",
    callerid: `${ext.callerIdName ?? ext.displayName} <${ext.callerIdNumber ?? ext.number}>`,
    mailboxes: `${ext.number}@default`,
    message_context: "from-internal",
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
    transport: "transport-udp",
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
  if (trunk.authMode === "REGISTER" || trunk.username) row.outbound_auth = trunk.name;
  return row;
}
export function aorRowForTrunk(trunk: Trunk): Row {
  return { id: trunk.name, contact: `sip:${trunk.sipServer}:${trunk.port}`, qualify_frequency: "60" };
}
export function authRowForTrunk(trunk: Trunk, password: string): Row {
  return { id: trunk.name, auth_type: "userpass", username: trunk.username ?? "", password };
}
export function identifyRowForTrunk(trunk: Trunk): Row {
  return { id: trunk.name, endpoint: trunk.name, match: trunk.authIps.join(",") };
}
export function registrationRowForTrunk(trunk: Trunk): Row {
  return {
    id: trunk.name,
    transport: "transport-udp",
    outbound_auth: trunk.name,
    server_uri: `sip:${trunk.sipServer}:${trunk.port}`,
    client_uri: `sip:${trunk.username ?? trunk.fromUser ?? ""}@${trunk.sipServer}`,
    retry_interval: "60",
  };
}
