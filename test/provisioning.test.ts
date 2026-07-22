import { describe, it, expect } from "vitest";
import { fanvilRenderer } from "@/provisioning/vendors/fanvil";
import { getRenderer, supportedVendors } from "@/provisioning/registry";
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

describe("registry", () => {
  it("resolves FANVIL", () => expect(getRenderer("FANVIL")).not.toBeNull());
  it("returns null for an unknown vendor", () => expect(getRenderer("NOKIA")).toBeNull());
  it("lists supported vendors", () => expect(supportedVendors()).toContain("FANVIL"));
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
