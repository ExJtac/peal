import { createHmac, timingSafeEqual } from "node:crypto";
import { PROVISION_SECRET } from "@/lib/env";
import { normalizeMac } from "@/lib/ids";

// The /provision/<mac> URL is guarded by a per-MAC token derived from PROVISION_SECRET, so a
// phone (or an attacker) can't fetch another device's SIP credentials by guessing MACs. Pure.

export function provisioningToken(mac: string): string {
  return createHmac("sha256", PROVISION_SECRET).update(normalizeMac(mac)).digest("hex").slice(0, 24);
}

export function verifyProvisioningToken(mac: string, token: string): boolean {
  const expected = Buffer.from(provisioningToken(mac));
  const got = Buffer.from(token ?? "");
  return expected.length === got.length && timingSafeEqual(expected, got);
}
