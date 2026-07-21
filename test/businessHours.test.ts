import { describe, it, expect } from "vitest";
import { isWithinHours, resolveBusinessHours, type BusinessHoursInput } from "@/lib/businessHours";

// 2026-07-15 is a Wednesday; 2026-07-18 is a Saturday. CDT = UTC-5 in July.
const rules = [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }];
const TZ = "America/Chicago";

describe("isWithinHours", () => {
  it("is open during weekday business hours", () =>
    expect(isWithinHours(rules, null, new Date("2026-07-15T19:00:00Z"), TZ)).toBe(true)); // 14:00 CDT Wed
  it("is closed in the evening", () =>
    expect(isWithinHours(rules, null, new Date("2026-07-16T04:00:00Z"), TZ)).toBe(false)); // 23:00 CDT Wed
  it("is closed on the weekend", () =>
    expect(isWithinHours(rules, null, new Date("2026-07-18T19:00:00Z"), TZ)).toBe(false)); // Sat
  it("is closed on a holiday", () =>
    expect(isWithinHours(rules, ["2026-07-15"], new Date("2026-07-15T19:00:00Z"), TZ)).toBe(false));
});

describe("resolveBusinessHours", () => {
  const bh: BusinessHoursInput = {
    timezone: TZ,
    rules,
    holidays: null,
    inType: "EXTENSION",
    inId: "in-dest",
    elseType: "VOICEMAIL",
    elseId: "else-dest",
  };
  it("routes to the in-hours destination when open", () =>
    expect(resolveBusinessHours(bh, new Date("2026-07-15T19:00:00Z"))).toEqual({ type: "EXTENSION", id: "in-dest" }));
  it("routes to the after-hours destination when closed", () =>
    expect(resolveBusinessHours(bh, new Date("2026-07-18T19:00:00Z"))).toEqual({ type: "VOICEMAIL", id: "else-dest" }));
});
