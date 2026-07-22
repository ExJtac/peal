import type { DeviceRenderer } from "./renderer";
import { fanvilRenderer } from "./vendors/fanvil";
import { yealinkRenderer } from "./vendors/yealink";
import { grandstreamRenderer } from "./vendors/grandstream";

// Vendor → renderer. Add a vendor by dropping in a file that implements DeviceRenderer and
// registering it here — nothing else changes. (Poly still to come.)
const RENDERERS: Record<string, DeviceRenderer> = {
  FANVIL: fanvilRenderer,
  YEALINK: yealinkRenderer,
  GRANDSTREAM: grandstreamRenderer,
};

export function getRenderer(vendor: string): DeviceRenderer | null {
  return RENDERERS[vendor] ?? null;
}

export function supportedVendors(): string[] {
  return Object.keys(RENDERERS);
}
