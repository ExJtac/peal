import { describe, it, expect } from "vitest";
import {
  endpointRowForTrunk,
  aorRowForTrunk,
  authRowForTrunk,
  identifyRowForTrunk,
  registrationRowForTrunk,
  trunkTransport,
  endpointRowForExtension,
} from "@/telephony/realtime/psSchema";
import type { Trunk, Extension } from "@prisma/client";

// Minimal Trunk factory — psSchema only reads a handful of fields; the rest satisfy the type.
function trunk(overrides: Partial<Trunk> = {}): Trunk {
  return {
    id: "t1",
    name: "telnyx",
    provider: "TELNYX",
    authMode: "IP_AUTH",
    sipServer: "sip.telnyx.com",
    port: 5060,
    transport: "UDP",
    mediaEncryption: "NONE",
    username: null,
    passwordEnc: null,
    fromDomain: null,
    fromUser: null,
    authIps: [],
    outboundProxy: null,
    codecs: ["ulaw", "alaw"],
    registerEnabled: false,
    maxChannels: 10,
    spendCeilingUsd: null,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Trunk;
}

describe("trunkTransport", () => {
  it("maps the SipTransport enum to the pjsip.conf transport section", () => {
    expect(trunkTransport(trunk({ transport: "UDP" }))).toBe("transport-udp");
    expect(trunkTransport(trunk({ transport: "TCP" }))).toBe("transport-tcp");
    expect(trunkTransport(trunk({ transport: "TLS" }))).toBe("transport-tls");
  });
});

describe("endpointRowForTrunk", () => {
  it("uses from-trunk context, the trunk's codecs, and UDP by default", () => {
    const row = endpointRowForTrunk(trunk());
    expect(row.id).toBe("telnyx");
    expect(row.context).toBe("from-trunk");
    expect(row.transport).toBe("transport-udp");
    expect(row.allow).toBe("ulaw,alaw");
    // NAT-traversal knobs for a public trunk are always on.
    expect(row.force_rport).toBe("yes");
    expect(row.rewrite_contact).toBe("yes");
    expect(row.rtp_symmetric).toBe("yes");
  });

  it("falls back from_domain to the SIP server when unset", () => {
    expect(endpointRowForTrunk(trunk()).from_domain).toBe("sip.telnyx.com");
    expect(endpointRowForTrunk(trunk({ fromDomain: "example.com" })).from_domain).toBe("example.com");
  });

  it("honors the chosen transport (regression: was hardcoded to UDP)", () => {
    expect(endpointRowForTrunk(trunk({ transport: "TCP" })).transport).toBe("transport-tcp");
    expect(endpointRowForTrunk(trunk({ transport: "TLS" })).transport).toBe("transport-tls");
  });

  it("emits media_encryption only when set — NONE omitted, SDES/DTLS mapped to Asterisk values", () => {
    expect(endpointRowForTrunk(trunk()).media_encryption).toBeUndefined();
    expect(endpointRowForTrunk(trunk({ transport: "TLS", mediaEncryption: "SDES" })).media_encryption).toBe("sdes");
    expect(endpointRowForTrunk(trunk({ transport: "TLS", mediaEncryption: "DTLS" })).media_encryption).toBe("dtls");
  });

  it("sets outbound_auth for a credential/REGISTER trunk but not for pure IP-auth", () => {
    expect(endpointRowForTrunk(trunk({ authMode: "IP_AUTH", username: null })).outbound_auth).toBeUndefined();
    expect(endpointRowForTrunk(trunk({ authMode: "REGISTER", username: "u1" })).outbound_auth).toBe("telnyx");
    // IP-auth trunk that still carries a username (some ITSPs) also gets outbound_auth.
    expect(endpointRowForTrunk(trunk({ authMode: "IP_AUTH", username: "u1" })).outbound_auth).toBe("telnyx");
  });
});

describe("aorRowForTrunk", () => {
  it("points the contact at the ITSP with a NAT keepalive under the router UDP timeout", () => {
    const row = aorRowForTrunk(trunk());
    expect(row.contact).toBe("sip:sip.telnyx.com:5060");
    expect(row.qualify_frequency).toBe("30");
    expect(row.qualify_timeout).toBe("3");
  });

  it("adds the transport param + sips scheme for TCP/TLS trunks", () => {
    expect(aorRowForTrunk(trunk({ transport: "TCP" })).contact).toBe("sip:sip.telnyx.com:5060;transport=tcp");
    expect(aorRowForTrunk(trunk({ transport: "TLS", port: 5061 })).contact).toBe("sips:sip.telnyx.com:5061;transport=tls");
  });
});

describe("authRowForTrunk / identifyRowForTrunk", () => {
  it("builds a userpass auth row", () => {
    expect(authRowForTrunk(trunk({ username: "u1" }), "pw")).toEqual({
      id: "telnyx",
      auth_type: "userpass",
      username: "u1",
      password: "pw",
    });
  });

  it("builds an identify (IP allow-list) row from authIps", () => {
    const row = identifyRowForTrunk(trunk({ authIps: ["192.76.120.10", "64.16.250.10"] }));
    expect(row).toEqual({ id: "telnyx", endpoint: "telnyx", match: "192.76.120.10,64.16.250.10" });
  });
});

describe("registrationRowForTrunk", () => {
  it("registers to the ITSP over the chosen transport", () => {
    const row = registrationRowForTrunk(trunk({ authMode: "REGISTER", username: "u1" }));
    expect(row.transport).toBe("transport-udp");
    expect(row.outbound_auth).toBe("telnyx");
    expect(row.server_uri).toBe("sip:sip.telnyx.com:5060");
    expect(row.client_uri).toBe("sip:u1@sip.telnyx.com");
  });

  it("enables line support so inbound INVITEs down the pinhole bind to the endpoint (NAT trunks w/o an identify row)", () => {
    const row = registrationRowForTrunk(trunk({ authMode: "REGISTER", username: "u1" }));
    expect(row.line).toBe("yes");
    expect(row.endpoint).toBe("telnyx");
    expect(row.expiration).toBe("120"); // short expiry refreshes the NAT mapping
  });

  it("uses sips + transport=tls for a TLS registration", () => {
    const row = registrationRowForTrunk(trunk({ authMode: "REGISTER", username: "u1", transport: "TLS", port: 5061 }));
    expect(row.transport).toBe("transport-tls");
    expect(row.server_uri).toBe("sips:sip.telnyx.com:5061;transport=tls");
    expect(row.client_uri).toBe("sips:u1@sip.telnyx.com");
  });
});

// psSchema had no coverage before this file — lock the extension transport split too.
describe("endpointRowForExtension", () => {
  const ext = (o: Partial<Extension> = {}): Extension =>
    ({
      number: "1001",
      displayName: "Front Desk",
      callerIdName: null,
      callerIdNumber: null,
      codecs: ["ulaw"],
      webrtc: false,
      maxContacts: 1,
      ...o,
    }) as Extension;

  it("uses UDP transport for a desk phone", () => {
    const row = endpointRowForExtension(ext());
    expect(row.transport).toBe("transport-udp");
    expect(row.webrtc).toBeUndefined();
  });

  it("uses the WebRTC transport + DTLS for a browser softphone", () => {
    const row = endpointRowForExtension(ext({ webrtc: true }));
    expect(row.transport).toBe("transport-ws");
    expect(row.webrtc).toBe("yes");
    expect(row.media_encryption).toBe("dtls");
  });
});
