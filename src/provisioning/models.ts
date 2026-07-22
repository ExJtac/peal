// Per-vendor phone model lists backing the cascading Model dropdown on /provisioning.
// NOTE: `Device.model` is currently cosmetic — the renderers branch only on `vendor`, never on
// model — so this list is for data-entry quality/UX, not routing. Keys match the `DeviceVendor`
// enum (schema.prisma) + the vendor <select>. Any model not listed is still allowed via the
// form's "Other…" free-text fallback, so this can stay a curated (not exhaustive) set.
// Pure data (no imports) so the client form and worker code can both import it.

export const PHONE_MODELS: Record<string, string[]> = {
  FANVIL: ["X1S", "X3S", "X3U", "X4", "X4U", "X5U", "X6U", "X7", "X7C", "X210", "V62", "V64", "V65", "H3W", "H5W"],
  YEALINK: ["T31G", "T33G", "T42U", "T43U", "T46U", "T48U", "T53W", "T54W", "T57W", "W73P", "W79P", "MP54", "MP56"],
  GRANDSTREAM: ["GRP2601", "GRP2602", "GRP2612", "GRP2613", "GRP2614", "GRP2615", "GRP2616", "GXP2130", "GXP2135", "GXP2140", "GXP2170", "DP722", "DP730"],
  POLY: ["VVX150", "VVX250", "VVX350", "VVX450", "Edge E220", "Edge E320", "Edge E350"],
  GENERIC: [],
};

/** Curated model list for a vendor (empty array for unknown vendors / GENERIC). */
export function modelsForVendor(vendor: string): string[] {
  return PHONE_MODELS[vendor] ?? [];
}
