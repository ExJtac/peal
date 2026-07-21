// Fanvil auto-provisioning renderer.
//
// Fanvil phones (X-series and others) fetch a per-MAC config file named "<mac>.cfg". The
// file MUST begin with the Fanvil header line `<<VOIP CONFIG FILE>>Version:...`; the body is
// Fanvil's human-readable "<MODULE>" / "Key :Value" auto-provision format (what the phone's
// own config export produces). Newer models also accept sysConf XML — we emit the flat text
// format, which the broadest range of Fanvil firmware accepts.
//
// NOTE: verify the exact header/keys against a real handset on first provision — this is
// locked by a golden test so any change is visible. The 4 office models can be confirmed
// tomorrow; adjust here per model family if a phone rejects a key.
import type { DeviceRenderer, DeviceInfo, ProvisioningContext, RenderedConfig } from "../renderer";

const FANVIL_HEADER = "<<VOIP CONFIG FILE>>Version:2.0000005";

function transportCode(t: ProvisioningContext["transport"]): string {
  return t === "tls" ? "2" : t === "tcp" ? "1" : "0"; // Fanvil: 0=UDP 1=TCP 2=TLS
}

function fkeyType(t: string): string {
  return t === "blf" ? "BLF/New Call" : t === "speeddial" ? "Speed Dial" : "Line";
}

export const fanvilRenderer: DeviceRenderer = {
  vendor: "FANVIL",
  render(device: DeviceInfo, ctx: ProvisioningContext): RenderedConfig {
    const a = ctx.account;
    const L: string[] = [];
    L.push(FANVIL_HEADER);
    L.push("");

    L.push("<SIP CONFIG MODULE>");
    L.push(`SIP1 Phone Number :${a.extension}`);
    L.push(`SIP1 Display Name :${a.displayName}`);
    L.push(`SIP1 Register Addr :${ctx.sipServer}`);
    L.push(`SIP1 Register Port :${ctx.sipPort}`);
    L.push(`SIP1 Register User :${a.authId}`);
    L.push(`SIP1 Register Pswd :${a.password}`);
    L.push(`SIP1 Register TTL :3600`);
    L.push(`SIP1 Enable Reg :1`);
    L.push(`SIP1 Proxy Addr :${ctx.sipServer}`);
    L.push(`SIP1 Proxy Port :${ctx.sipPort}`);
    L.push(`SIP1 SIP Transport :${transportCode(ctx.transport)}`);
    L.push(`SIP1 Server Name :${ctx.sipDomain}`);
    if (a.callerId) L.push(`SIP1 Local Number :${a.callerId}`);
    L.push("");

    if (device.lineKeys && device.lineKeys.length > 0) {
      L.push("<FUNCTION KEY MODULE>");
      for (const k of device.lineKeys) {
        L.push(`Fkey${k.index} Type :${fkeyType(k.type)}`);
        L.push(`Fkey${k.index} Value :${k.value}`);
        L.push(`Fkey${k.index} Line :1`);
        if (k.label) L.push(`Fkey${k.index} Title :${k.label}`);
      }
      L.push("");
    }

    L.push("<TIME CONFIG MODULE>");
    if (ctx.ntpServer) L.push(`SNTP Server :${ctx.ntpServer}`);
    if (ctx.timezone) L.push(`Time Zone Name :${ctx.timezone}`);
    L.push("");

    if (ctx.provisioningBaseUrl) {
      L.push("<AUTOUPDATE CONFIG MODULE>");
      L.push(`Server Address :${ctx.provisioningBaseUrl}`);
      L.push(`Update Mode :2`); // 2 = update via configured URL
      L.push("");
    }

    const body = Buffer.from(L.join("\r\n") + "\r\n", "utf8");
    return {
      filename: `${device.mac}.cfg`,
      contentType: "text/plain; charset=utf-8",
      body,
      cacheable: false,
    };
  },
};
