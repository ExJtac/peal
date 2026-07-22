import { describe, it, expect } from "vitest";
import { hostFromForwardedFor } from "@/lib/net";

describe("hostFromForwardedFor", () => {
  it("takes the first IP and strips a port", () => {
    expect(hostFromForwardedFor("192.168.1.42, 10.0.0.1")).toBe("192.168.1.42");
    expect(hostFromForwardedFor("192.168.1.42:5060")).toBe("192.168.1.42");
  });
  it("handles bracketed + bare IPv6", () => {
    expect(hostFromForwardedFor("[2001:db8::1]:8080")).toBe("2001:db8::1");
    expect(hostFromForwardedFor("2001:db8::1")).toBe("2001:db8::1");
  });
  it("accepts hostnames", () => {
    expect(hostFromForwardedFor("phone-1.local")).toBe("phone-1.local");
  });
  it("rejects empty / injection-shaped values", () => {
    expect(hostFromForwardedFor("")).toBeNull();
    expect(hostFromForwardedFor(null)).toBeNull();
    expect(hostFromForwardedFor("has space")).toBeNull();
    expect(hostFromForwardedFor('a"b')).toBeNull();
    expect(hostFromForwardedFor("a<b>")).toBeNull();
  });
});
