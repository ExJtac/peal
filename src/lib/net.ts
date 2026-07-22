// Worker-safe network helpers. `lastProvisionedIp` is set from the attacker-influenceable
// X-Forwarded-For header, so it must be validated before being rendered as a link href.

function isIpv4(s: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return false;
  return m.slice(1).every((o) => {
    const n = Number(o);
    return n >= 0 && n <= 255 && String(n) === o; // rejects leading zeros / out-of-range
  });
}

function isIpv6(s: string): boolean {
  // Loose: only hex digits and colons, with at least two colons.
  return /^[0-9a-fA-F:]+$/.test(s) && (s.match(/:/g) ?? []).length >= 2;
}

function isHostname(s: string): boolean {
  return s.length <= 253 && /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,62})(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,62}))*$/.test(s);
}

/**
 * The first host from an X-Forwarded-For value — port/brackets stripped, validated as an
 * IPv4/IPv6/hostname — or null if it isn't a safe host to link to.
 */
export function hostFromForwardedFor(xff: string | null | undefined): string | null {
  if (!xff) return null;
  let host = xff.split(",")[0].trim();
  if (!host) return null;

  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(host);
  if (bracket) {
    host = bracket[1]; // [ipv6]:port -> ipv6
  } else if ((host.match(/:/g) ?? []).length === 1) {
    host = host.slice(0, host.lastIndexOf(":")); // host:port -> host (bare IPv6 has >1 colon)
  }

  return isIpv4(host) || isIpv6(host) || isHostname(host) ? host : null;
}
