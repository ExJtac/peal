// Grandstream auto-provisioning renderer. Grandstream phones fetch "cfg<mac>.xml" — a P-value
// XML config. Pure + golden-tested.
//
// ⚠ P-VALUES ARE MODEL/FIRMWARE-SPECIFIC. Treat every P-number below as verify-on-handset; the
// golden test locks emitted output so any change is visible. Function keys (MPK) are the most
// model-variable, so they are emitted as documented comments rather than guessed P-values.
import type { DeviceRenderer, DeviceInfo, ProvisioningContext, RenderedConfig } from "../renderer";

function transportCode(t: ProvisioningContext["transport"]): string {
  return t === "tls" ? "2" : t === "tcp" ? "1" : "0"; // Grandstream P130: 0=UDP 1=TCP 2=TLS
}

const ESC: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" };
function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ESC[c]);
}

export const grandstreamRenderer: DeviceRenderer = {
  vendor: "GRANDSTREAM",
  render(device: DeviceInfo, ctx: ProvisioningContext): RenderedConfig {
    const a = ctx.account;
    const P: string[] = [];
    const p = (num: string, val: string | number, note: string) =>
      P.push(`    <${num}>${xmlEscape(String(val))}</${num}> <!-- ${note} -->`);

    p("P271", 1, "account 1 active");
    p("P270", a.displayName, "account name");
    p("P3", a.displayName, "SIP display name");
    p("P47", ctx.sipServer, "SIP server");
    p("P35", a.extension, "SIP user id");
    p("P36", a.authId, "authenticate id");
    p("P34", a.password, "authenticate password");
    p("P130", transportCode(ctx.transport), "SIP transport 0=UDP 1=TCP 2=TLS");
    if (ctx.srtp) p("P183", 2, "SRTP mode (2 = enabled + forced)");
    if (ctx.webAdmin) p("P2", ctx.webAdmin.password, "admin web password");

    const url = ctx.provisioningUrl ?? ctx.provisioningBaseUrl;
    if (url) {
      p("P237", url, "config server path (tokened provisioning URL)");
      if (ctx.pollHours && ctx.pollHours > 0) p("P193", ctx.pollHours * 60, "auto-provision check interval (minutes)");
    }

    const mpk = (device.lineKeys ?? []).map(
      (k) =>
        `    <!-- MPK ${k.index}: ${k.type} ${k.value}${k.label ? ` (${xmlEscape(k.label)})` : ""} — set model-specific P-values on the handset -->`,
    );

    const xml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<gs_provision version="1">`,
      `  <config version="1">`,
      ...P,
      ...mpk,
      `  </config>`,
      `</gs_provision>`,
      ``,
    ].join("\n");

    return { filename: `cfg${device.mac}.xml`, contentType: "text/xml; charset=utf-8", body: Buffer.from(xml, "utf8"), cacheable: false };
  },
};
