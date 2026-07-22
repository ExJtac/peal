import { normalizeMac, isValidMac } from "@/lib/ids";

/**
 * Extract the phone MAC from the filename a phone requests. Vendors differ:
 *   Fanvil / Yealink : <mac>.cfg   (also bare <mac>, <mac>.xml / .boot)
 *   Grandstream      : cfg<mac>.xml (the "cfg" wrapper must be matched explicitly — its "cf"
 *                      are hex digits, so normalizeMac would otherwise fold them into the MAC).
 * Returns the normalized 12-hex MAC, or null if the request carries no valid MAC.
 */
export function macFromProvisionRequest(raw: string): string | null {
  const s = (raw ?? "").trim();

  // Grandstream cfg<mac>.xml|.bin (extension optional) — strip the wrapper before normalizing.
  const gs = /^cfg([0-9a-f]{12})(?:\.(?:xml|bin))?$/i.exec(s);
  if (gs) return gs[1].toLowerCase();

  // Everything else: strip a known extension, then normalize (separators tolerated).
  const mac = normalizeMac(s.replace(/\.(?:cfg|xml|boot|txt)$/i, ""));
  return isValidMac(mac) ? mac : null;
}
