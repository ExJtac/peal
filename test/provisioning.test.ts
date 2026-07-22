import { describe, it, expect } from "vitest";
import { fanvilRenderer } from "@/provisioning/vendors/fanvil";
import { yealinkRenderer } from "@/provisioning/vendors/yealink";
import { grandstreamRenderer } from "@/provisioning/vendors/grandstream";
import { getRenderer, supportedVendors } from "@/provisioning/registry";
import { macFromProvisionRequest } from "@/provisioning/filename";
import { provisioningToken, verifyProvisioningToken } from "@/provisioning/secrets";
import { macFromUserAgent, parseSipRequest } from "@/provisioning/sipPnp";
import type { DeviceInfo, ProvisioningContext } from "@/provisioning/renderer";

const device: DeviceInfo = {
  mac: "0c383e112233",
  vendor: "FANVIL",
  model: "X4U",
  displayName: "Front Desk",
  lineKeys: [{ index: 1, type: "blf", value: "1002", label: "Sales" }],
};

const ctx: ProvisioningContext = {
  sipServer: "192.168.1.50",
  sipPort: 5060,
  transport: "udp",
  sipDomain: "pbx.local",
  account: { extension: "1001", authId: "1001", password: "s3cret", displayName: "Front Desk", callerId: "+15125551234" },
  codecs: ["ulaw", "alaw"],
  ntpServer: "pool.ntp.org",
  timezone: "America/Chicago",
  provisioningBaseUrl: "http://localhost:3000/provision",
};

describe("fanvil renderer", () => {
  const out = fanvilRenderer.render(device, ctx);
  const text = out.body.toString("utf8");
  it("starts with the mandatory Fanvil header", () => expect(text.startsWith("<<VOIP CONFIG FILE>>")).toBe(true));
  it("names the file <mac>.cfg", () => expect(out.filename).toBe("0c383e112233.cfg"));
  it("includes the SIP account", () => {
    expect(text).toContain("SIP1 Phone Number :1001");
    expect(text).toContain("SIP1 Register Addr :192.168.1.50");
    expect(text).toContain("SIP1 Register Pswd :s3cret");
  });
  it("includes the BLF function key", () => expect(text).toContain("Sales"));
  it("omits web/SRTP/poll blocks when those context fields are unset", () => {
    expect(text).not.toContain("WEB CONFIG MODULE");
    expect(text).not.toContain("Enable SRTP");
    expect(text).not.toContain("Repeat Cycle");
  });
});

describe("fanvil renderer — web access, SRTP, scheduled poll", () => {
  const ctxFull: ProvisioningContext = {
    ...ctx,
    transport: "tls",
    srtp: true,
    provisioningUrl: "http://localhost:3001/provision/0c383e112233.cfg?token=abc123",
    pollHours: 12,
    webAdmin: { user: "admin", password: "Sekret9" },
  };
  const text = fanvilRenderer.render(device, ctxFull).body.toString("utf8");

  it("pushes the web-admin credentials", () => {
    expect(text).toContain("<WEB CONFIG MODULE>");
    expect(text).toContain("Web Authentication User :admin");
    expect(text).toContain("Web Authentication Password :Sekret9");
  });
  it("enables SRTP + TLS transport", () => {
    expect(text).toContain("SIP1 Enable SRTP :1");
    expect(text).toContain("SIP1 SIP Transport :2"); // Fanvil transport code 2 = TLS
  });
  it("emits the tokened poll URL + repeat interval", () => {
    expect(text).toContain("Server Address :http://localhost:3001/provision/0c383e112233.cfg?token=abc123");
    expect(text).toContain("Repeat Cycle :12 Hour");
  });
  it("omits the repeat interval when pollHours is 0", () => {
    const t0 = fanvilRenderer.render(device, { ...ctxFull, pollHours: 0 }).body.toString("utf8");
    expect(t0).not.toContain("Repeat Cycle");
  });
});

const ctxVendor: ProvisioningContext = {
  ...ctx,
  transport: "tls",
  srtp: true,
  provisioningUrl: "http://localhost:3001/provision/0c383e112233.cfg?token=abc123",
  pollHours: 12,
  webAdmin: { user: "admin", password: "Sekret9" },
};

describe("yealink renderer", () => {
  const out = yealinkRenderer.render(device, ctxVendor);
  const text = out.body.toString("utf8");
  it("names the file <mac>.cfg (text/plain)", () => {
    expect(out.filename).toBe("0c383e112233.cfg");
    expect(out.contentType).toContain("text/plain");
  });
  it("starts with the Yealink version header", () => expect(text.startsWith("#!version:")).toBe(true));
  it("includes the SIP account + TLS transport + SRTP", () => {
    expect(text).toContain("account.1.user_name = 1001");
    expect(text).toContain("account.1.password = s3cret");
    expect(text).toContain("account.1.sip_server.1.address = 192.168.1.50");
    expect(text).toContain("account.1.transport = 2");
    expect(text).toContain("account.1.srtp_encryption = 1");
  });
  it("pushes web-admin creds + the tokened poll URL + a function key", () => {
    expect(text).toContain("static.security.user_password = admin:Sekret9");
    expect(text).toContain("auto_provision.server.url = http://localhost:3001/provision/0c383e112233.cfg?token=abc123");
    expect(text).toContain("auto_provision.repeat.minutes = 720");
    expect(text).toContain("linekey.1.value = 1002");
    expect(text).toContain("linekey.1.label = Sales");
  });
});

describe("grandstream renderer", () => {
  const out = grandstreamRenderer.render(device, ctxVendor);
  const text = out.body.toString("utf8");
  it("names the file cfg<mac>.xml (text/xml)", () => {
    expect(out.filename).toBe("cfg0c383e112233.xml");
    expect(out.contentType).toContain("text/xml");
  });
  it("emits the account P-values + transport + SRTP", () => {
    expect(text).toContain("<P35>1001</P35>");
    expect(text).toContain("<P34>s3cret</P34>");
    expect(text).toContain("<P47>192.168.1.50</P47>");
    expect(text).toContain("<P130>2</P130>");
    expect(text).toContain("<P183>2</P183>");
  });
  it("emits web pw + tokened config server + poll interval + an MPK note", () => {
    expect(text).toContain("<P2>Sekret9</P2>");
    expect(text).toContain("<P237>http://localhost:3001/provision/0c383e112233.cfg?token=abc123</P237>");
    expect(text).toContain("<P193>720</P193>");
    expect(text).toContain("Sales");
  });
});

describe("macFromProvisionRequest", () => {
  it("parses each vendor's filename to the MAC", () => {
    expect(macFromProvisionRequest("0c383e112233.cfg")).toBe("0c383e112233"); // Fanvil/Yealink
    expect(macFromProvisionRequest("cfg0c383e112233.xml")).toBe("0c383e112233"); // Grandstream
    expect(macFromProvisionRequest("0C:38:3E:11:22:33")).toBe("0c383e112233"); // bare, separators
    expect(macFromProvisionRequest("0c383e112233")).toBe("0c383e112233");
    expect(macFromProvisionRequest("0c383e112233.boot")).toBe("0c383e112233");
  });
  it("returns null for junk", () => {
    expect(macFromProvisionRequest("garbage")).toBeNull();
    expect(macFromProvisionRequest("")).toBeNull();
    expect(macFromProvisionRequest("cfgZZZ.xml")).toBeNull();
  });
});

describe("registry", () => {
  it("resolves FANVIL / YEALINK / GRANDSTREAM", () => {
    expect(getRenderer("FANVIL")).not.toBeNull();
    expect(getRenderer("YEALINK")).not.toBeNull();
    expect(getRenderer("GRANDSTREAM")).not.toBeNull();
  });
  it("returns null for an unknown vendor", () => expect(getRenderer("NOKIA")).toBeNull());
  it("lists supported vendors", () => {
    expect(supportedVendors()).toContain("FANVIL");
    expect(supportedVendors()).toContain("YEALINK");
    expect(supportedVendors()).toContain("GRANDSTREAM");
  });
});

describe("provisioning token", () => {
  it("round-trips (MAC normalized) and rejects tampering", () => {
    const token = provisioningToken("0c:38:3e:11:22:33");
    expect(verifyProvisioningToken("0c383e112233", token)).toBe(true);
    expect(verifyProvisioningToken("0c383e112233", "deadbeef")).toBe(false);
  });
});

describe("sip-pnp", () => {
  it("extracts a MAC from a Fanvil User-Agent", () =>
    expect(macFromUserAgent("Fanvil X4U 0c383e112233 2.4.2")).toBe("0c383e112233"));
  it("parses a SUBSCRIBE request line + headers", () => {
    const req = parseSipRequest("SUBSCRIBE sip:MAC%3a0c383e112233@224.0.1.75 SIP/2.0\r\nEvent: ua-profile\r\nCall-ID: abc\r\n\r\n");
    expect(req?.method).toBe("SUBSCRIBE");
    expect(req?.headers["event"]).toBe("ua-profile");
  });
});
