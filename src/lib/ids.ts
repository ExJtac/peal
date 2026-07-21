// Small helpers to correlate Asterisk channel identifiers with our records. Pure.

/** "PJSIP/1001-00000023" -> "1001" (the endpoint/extension name). */
export function endpointFromChannel(channelName: string): string | null {
  const m = /^[A-Za-z]+\/([^-]+)-/.exec(channelName ?? "");
  return m ? m[1] : null;
}

/** Normalize a MAC to lowercase hex with no separators: "AA:BB:CC:11:22:33" -> "aabbcc112233". */
export function normalizeMac(mac: string): string {
  return (mac ?? "").toLowerCase().replace(/[^0-9a-f]/g, "");
}

/** True for a 12-hex-digit normalized MAC. */
export function isValidMac(mac: string): boolean {
  return /^[0-9a-f]{12}$/.test(normalizeMac(mac));
}
