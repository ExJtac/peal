// Business-hours / time-condition evaluation. Pure, worker-safe, timezone-aware via Intl
// (no external tz dependency). Used by inbound routing to pick the in-hours vs after-hours
// destination.
import type { DestinationType } from "@prisma/client";

export interface HoursRule {
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  days: number[];
  /** "HH:MM" 24h, local to the rule's timezone. */
  start: string;
  end: string;
}

export interface BusinessHoursInput {
  timezone: string;
  rules: HoursRule[];
  holidays?: string[] | null; // ["YYYY-MM-DD", ...]
  inType: DestinationType;
  inId?: string | null;
  elseType: DestinationType;
  elseId?: string | null;
}

export interface ResolvedDestination {
  type: DestinationType;
  id: string | null;
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Local weekday (1-7), minutes-since-midnight, and YYYY-MM-DD in the given timezone. */
export function localParts(at: Date, timeZone: string): { weekday: number; minutes: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const weekday = WEEKDAY[parts.weekday as string] ?? 1;
  const hour = parseInt(parts.hour === "24" ? "0" : (parts.hour as string), 10);
  const minutes = hour * 60 + parseInt(parts.minute as string, 10);
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;
  return { weekday, minutes, ymd };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + (m || 0);
}

export function isWithinHours(
  rules: HoursRule[],
  holidays: string[] | null | undefined,
  at: Date,
  timeZone: string,
): boolean {
  const { weekday, minutes, ymd } = localParts(at, timeZone);
  if (holidays && holidays.includes(ymd)) return false;
  for (const r of rules) {
    if (r.days.includes(weekday) && minutes >= toMinutes(r.start) && minutes < toMinutes(r.end)) {
      return true;
    }
  }
  return false;
}

export function resolveBusinessHours(bh: BusinessHoursInput, at: Date): ResolvedDestination {
  return isWithinHours(bh.rules, bh.holidays, at, bh.timezone)
    ? { type: bh.inType, id: bh.inId ?? null }
    : { type: bh.elseType, id: bh.elseId ?? null };
}
