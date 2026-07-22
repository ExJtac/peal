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
  srtp?: boolean; // emit SRTP media keys (dormant until a TLS transport toggle sets it)
  sipDomain: string;
  account: ProvisioningAccount;
  codecs: string[];
  ntpServer?: string;
  timezone?: string;
  provisioningBaseUrl?: string; // where the phone fetches future config updates
  provisioningUrl?: string; // full per-device TOKENED URL (the scheduled-poll re-fetch target)
  pollHours?: number; // re-fetch config every N hours (0 / undefined = off)
  webAdmin?: { user: string; password: string }; // phone web-UI admin login pushed into the config
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
