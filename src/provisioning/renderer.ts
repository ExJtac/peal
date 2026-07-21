// Per-vendor phone provisioning: a pure renderer contract. A renderer turns a canonical
// Device + ProvisioningContext into a config file body served (over HTTPS, per-MAC) to the
// phone. Pure + deterministic so it is golden-testable with no phone attached — new vendors
// are one new file implementing DeviceRenderer, nothing else changes.

export interface LineKey {
  index: number;
  type: "line" | "blf" | "speeddial";
  value: string;
  label?: string;
}

export interface DeviceInfo {
  mac: string; // normalized lowercase, no separators
  vendor: string;
  model: string;
  displayName: string;
  lineKeys?: LineKey[];
}

export interface ProvisioningAccount {
  extension: string;
  authId: string;
  password: string; // decrypted at provision time (never stored in clear)
  displayName: string;
  callerId?: string;
}

export interface ProvisioningContext {
  sipServer: string;
  sipPort: number;
  transport: "udp" | "tcp" | "tls";
  sipDomain: string;
  account: ProvisioningAccount;
  codecs: string[];
  ntpServer?: string;
  timezone?: string;
  provisioningBaseUrl?: string; // where the phone fetches future config updates
  firmwareUrl?: string;
  voicemailNumber?: string;
  e911CallbackNumber?: string;
}

export interface RenderedConfig {
  filename: string;
  contentType: string;
  body: Buffer;
  cacheable: boolean;
}

export interface DeviceRenderer {
  vendor: string;
  render(device: DeviceInfo, ctx: ProvisioningContext): RenderedConfig;
}
