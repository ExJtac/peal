// E.164 / dial-string helpers + Asterisk-style dial-pattern matching. Pure, worker-safe.
// The control plane classifies every dialed string (for guardrails/routing) and normalizes
// caller-ID to E.164 (for STIR/SHAKEN attestation against a trunk's DID pool).
import type { CallClass } from "@prisma/client";

const TOLLFREE = new Set(["800", "888", "877", "866", "855", "844", "833"]);

/** Strip everything except digits, +, *, #. */
export function cleanDial(raw: string): string {
  return (raw ?? "").replace(/[^\d*#+]/g, "");
}

/** Digits only (no plus, star, or hash). */
export function digitsOnly(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

/**
 * Convert a dialed NANP-ish string to E.164, or null if it isn't a full external number
 * (e.g. an internal extension). `defaultCc` is the assumed country code for 10-digit input.
 */
export function toE164(raw: string, defaultCc = "1"): string | null {
  const s = (raw ?? "").trim();
  if (s.startsWith("+")) {
    const n = digitsOnly(s);
    return n ? `+${n}` : null;
  }
  const d = digitsOnly(s);
  if (d.startsWith("011")) {
    const n = d.slice(3);
    return n ? `+${n}` : null;
  }
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.length === 10) return `+${defaultCc}${d}`;
  return null;
}

/** Classify a dialed string for routing + toll-fraud guardrails. */
export function classifyDial(raw: string): CallClass {
  const s = cleanDial(raw);
  if (s === "911" || s === "933") return "EMERGENCY";

  const isPlus = s.startsWith("+");
  const d = digitsOnly(s);

  if (isPlus && !d.startsWith("1")) return "INTERNATIONAL";
  if (d.startsWith("011")) return "INTERNATIONAL";

  const npa = d.length === 11 && d.startsWith("1") ? d.slice(1, 4) : d.slice(0, 3);
  if ((d.length === 11 && d.startsWith("1") && TOLLFREE.has(npa)) ||
      (d.length === 10 && TOLLFREE.has(npa))) return "TOLLFREE";

  if (d.length <= 5) return "INTERNAL";
  if (d.length === 7) return "LOCAL";
  if (d.length === 10) return "NATIONAL";
  if (d.length === 11 && d.startsWith("1")) return "NATIONAL";
  return "NATIONAL";
}

/**
 * Match a dialed string against an Asterisk-style pattern. Tokens:
 *   X = 0-9   Z = 1-9   N = 2-9   . = one-or-more   ! = zero-or-more   [abc]/[0-9] = class
 * Literal digits / + * # match themselves. A leading "_" (Asterisk convention) is ignored.
 */
export function matchDialPattern(pattern: string, dialed: string): boolean {
  return patternToRegex(pattern).test(cleanDial(dialed));
}

function patternToRegex(pattern: string): RegExp {
  let p = (pattern ?? "").trim();
  if (p.startsWith("_")) p = p.slice(1);
  let re = "^";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    switch (c) {
      case "X": re += "[0-9]"; break;
      case "Z": re += "[1-9]"; break;
      case "N": re += "[2-9]"; break;
      case ".": re += "[0-9*#+]+"; break;
      case "!": re += "[0-9*#+]*"; break;
      case "[": {
        const end = p.indexOf("]", i);
        if (end === -1) { re += "\\["; break; }
        re += "[" + p.slice(i + 1, end).replace(/\\/g, "\\\\") + "]";
        i = end;
        break;
      }
      case "+": re += "\\+"; break;
      case "*": re += "\\*"; break;
      case "#": re += "#"; break;
      default: re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(re + "$");
}

/** Apply an outbound route transform: strip N leading digits, then prepend. */
export function applyDialTransform(dialed: string, stripDigits: number, prependDigits: string): string {
  const d = cleanDial(dialed);
  return (prependDigits ?? "") + (stripDigits > 0 ? d.slice(stripDigits) : d);
}
