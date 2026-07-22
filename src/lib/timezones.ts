// Curated IANA timezone list backing every timezone dropdown in the app (phone provisioning,
// company settings, business hours). IANA names are the correct portable value everywhere:
//   • Business hours' `isWithinHours` uses the Intl API, which requires IANA zone ids.
//   • The Fanvil provisioning renderer emits the value verbatim as `Time Zone Name :<value>`.
//   • CompanySettings.timezone is the fallback for a phone with no per-device zone.
// Pure data (no imports) so worker/route/client code can all consume it. US zones first, since
// this is a US single-business PBX; a broad-but-curated set of common international zones follows.

export interface TimezoneOption {
  /** IANA zone id, e.g. "America/Chicago" — the value stored + provisioned. */
  value: string;
  /** Human label with a fixed-standard-time UTC offset, e.g. "(GMT-06:00) Central Time — America/Chicago". */
  label: string;
}

export const TIMEZONES: TimezoneOption[] = [
  // --- United States & Canada ---
  { value: "Pacific/Honolulu", label: "(GMT-10:00) Hawaii — Pacific/Honolulu" },
  { value: "America/Anchorage", label: "(GMT-09:00) Alaska — America/Anchorage" },
  { value: "America/Los_Angeles", label: "(GMT-08:00) Pacific Time — America/Los_Angeles" },
  { value: "America/Phoenix", label: "(GMT-07:00) Arizona (no DST) — America/Phoenix" },
  { value: "America/Denver", label: "(GMT-07:00) Mountain Time — America/Denver" },
  { value: "America/Chicago", label: "(GMT-06:00) Central Time — America/Chicago" },
  { value: "America/New_York", label: "(GMT-05:00) Eastern Time — America/New_York" },
  { value: "America/Halifax", label: "(GMT-04:00) Atlantic Time — America/Halifax" },
  // --- Americas (other) ---
  { value: "America/Sao_Paulo", label: "(GMT-03:00) São Paulo — America/Sao_Paulo" },
  { value: "America/Mexico_City", label: "(GMT-06:00) Mexico City — America/Mexico_City" },
  // --- UTC ---
  { value: "UTC", label: "(GMT+00:00) Coordinated Universal Time — UTC" },
  // --- Europe & Africa ---
  { value: "Europe/London", label: "(GMT+00:00) London, Dublin — Europe/London" },
  { value: "Europe/Paris", label: "(GMT+01:00) Paris, Madrid, Berlin — Europe/Paris" },
  { value: "Europe/Berlin", label: "(GMT+01:00) Berlin, Amsterdam, Rome — Europe/Berlin" },
  { value: "Europe/Athens", label: "(GMT+02:00) Athens, Helsinki — Europe/Athens" },
  { value: "Africa/Johannesburg", label: "(GMT+02:00) Johannesburg — Africa/Johannesburg" },
  // --- Middle East & Asia ---
  { value: "Asia/Dubai", label: "(GMT+04:00) Dubai — Asia/Dubai" },
  { value: "Asia/Kolkata", label: "(GMT+05:30) India — Asia/Kolkata" },
  { value: "Asia/Singapore", label: "(GMT+08:00) Singapore, Hong Kong — Asia/Singapore" },
  { value: "Asia/Shanghai", label: "(GMT+08:00) Beijing, Shanghai — Asia/Shanghai" },
  { value: "Asia/Tokyo", label: "(GMT+09:00) Tokyo, Seoul — Asia/Tokyo" },
  // --- Oceania ---
  { value: "Australia/Sydney", label: "(GMT+10:00) Sydney, Melbourne — Australia/Sydney" },
  { value: "Pacific/Auckland", label: "(GMT+12:00) Auckland — Pacific/Auckland" },
];

/** True if `value` is one of the curated zones (used to decide whether an edit pre-fills to a known option). */
export function isKnownTimezone(value: string | null | undefined): boolean {
  return !!value && TIMEZONES.some((t) => t.value === value);
}
