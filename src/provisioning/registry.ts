import type { DeviceRenderer } from "./renderer";
import { fanvilRenderer } from "./vendors/fanvil";

// Vendor → renderer. Add Yealink/Grandstream/Poly by dropping in a file that implements
// DeviceRenderer and registering it here — nothing else changes.
const RENDERERS: Record<string, DeviceRenderer> = {
  FANVIL: fanvilRenderer,
};

export function getRenderer(vendor: string): DeviceRenderer | null {
  return RENDERERS[vendor] ?? null;
}

export function supportedVendors(): string[] {
  return Object.keys(RENDERERS);
}
