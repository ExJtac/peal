import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto-vault";
import { SIP_DOMAIN, SIP_SERVER_HOST, appUrl } from "@/lib/env";
import { provisioningToken } from "./secrets";
import type { DeviceInfo, LineKey, ProvisioningContext } from "./renderer";

// Builds the canonical Device + ProvisioningContext for a MAC by reading the assigned
// extension + company settings and decrypting the SIP password. Worker/route-safe.
export async function loadProvisioning(
  macNormalized: string,
): Promise<{ device: DeviceInfo; ctx: ProvisioningContext } | null> {
  const dev = await db.device.findUnique({
    where: { mac: macNormalized },
    include: { extension: true },
  });
  if (!dev || !dev.extension || !dev.enabled) return null;

  const ext = dev.extension;
  const company = await db.companySettings.findUnique({ where: { id: "singleton" } });

  const device: DeviceInfo = {
    mac: dev.mac,
    vendor: dev.vendor,
    model: dev.model,
    displayName: ext.displayName,
    lineKeys: (dev.lineKeys as LineKey[] | null) ?? [],
  };

  const ctx: ProvisioningContext = {
    sipServer: SIP_SERVER_HOST || company?.externalIp || company?.sipDomain || SIP_DOMAIN,
    sipPort: 5060,
    transport: "udp",
    sipDomain: company?.sipDomain || SIP_DOMAIN,
    account: {
      extension: ext.number,
      authId: ext.number,
      password: decryptSecret(ext.sipPasswordEnc),
      displayName: ext.displayName,
      callerId: ext.callerIdNumber ?? undefined,
    },
    codecs: ext.codecs,
    ntpServer: "pool.ntp.org",
    timezone: dev.timezone ?? company?.timezone ?? undefined,
    provisioningBaseUrl: `${appUrl()}/provision`,
    // Full TOKENED URL the phone re-fetches on its scheduled poll (the tokenless base would 403).
    provisioningUrl: `${appUrl()}/provision/${dev.mac}.cfg?token=${provisioningToken(dev.mac)}`,
    pollHours: company?.provisioningPollHours ?? 24,
    webAdmin: dev.webAdminPasswordEnc
      ? { user: dev.webAdminUser, password: decryptSecret(dev.webAdminPasswordEnc) }
      : undefined,
    voicemailNumber: "*97",
    e911CallbackNumber: ext.callerIdNumber ?? undefined,
  };

  return { device, ctx };
}
