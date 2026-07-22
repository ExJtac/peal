// Yealink auto-provisioning renderer. Yealink phones fetch "<mac>.cfg" — a flat "key = value"
// config (the Common CFG format, firmware v80+). Pure + golden-tested.
//
// NOTE: exact keys/codes are flagged for verification against a real handset on first provision
// (the golden test locks emitted output so any change is visible).
import type { DeviceRenderer, DeviceInfo, ProvisioningContext, RenderedConfig } from "../renderer";

function transportCode(t: ProvisioningContext["transport"]): string {
  return t === "tls" ? "2" : t === "tcp" ? "1" : "0"; // Yealink: 0=UDP 1=TCP 2=TLS
}

// Yealink linekey type codes (FLAG: verify per model) — 15=Line, 16=BLF, 13=Speed Dial.
function linekeyType(t: string): string {
  return t === "blf" ? "16" : t === "speeddial" ? "13" : "15";
}

export const yealinkRenderer: DeviceRenderer = {
  vendor: "YEALINK",
  render(device: DeviceInfo, ctx: ProvisioningContext): RenderedConfig {
    const a = ctx.account;
    const L: string[] = [];
    L.push("#!version:1.0.0.1"); // mandatory Yealink config header

    L.push(`account.1.enable = 1`);
    L.push(`account.1.label = ${a.displayName}`);
    L.push(`account.1.display_name = ${a.displayName}`);
    L.push(`account.1.auth_name = ${a.authId}`);
    L.push(`account.1.user_name = ${a.extension}`);
    L.push(`account.1.password = ${a.password}`);
    L.push(`account.1.sip_server.1.address = ${ctx.sipServer}`);
    L.push(`account.1.sip_server.1.port = ${ctx.sipPort}`);
    L.push(`account.1.transport = ${transportCode(ctx.transport)}`);
    if (ctx.srtp) L.push(`account.1.srtp_encryption = 1`); // FLAG: 0=off 1=optional 2=forced

    // Web-UI admin login ("user:password"). FLAG: verify Yealink key on the handset.
    if (ctx.webAdmin) L.push(`static.security.user_password = ${ctx.webAdmin.user}:${ctx.webAdmin.password}`);

    // Scheduled auto-provision re-fetch of the tokened URL.
    const url = ctx.provisioningUrl ?? ctx.provisioningBaseUrl;
    if (url) {
      L.push(`auto_provision.server.url = ${url}`);
      if (ctx.pollHours && ctx.pollHours > 0) {
        L.push(`auto_provision.repeat.enable = 1`);
        L.push(`auto_provision.repeat.minutes = ${ctx.pollHours * 60}`);
      }
    }

    // Function keys. FLAG: verify Yealink linekey type codes on the handset.
    for (const k of device.lineKeys ?? []) {
      L.push(`linekey.${k.index}.type = ${linekeyType(k.type)}`);
      L.push(`linekey.${k.index}.value = ${k.value}`);
      L.push(`linekey.${k.index}.line = 1`);
      if (k.label) L.push(`linekey.${k.index}.label = ${k.label}`);
    }

    const body = Buffer.from(L.join("\n") + "\n", "utf8");
    return { filename: `${device.mac}.cfg`, contentType: "text/plain; charset=utf-8", body, cacheable: false };
  },
};
