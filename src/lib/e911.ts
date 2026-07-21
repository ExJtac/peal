// Emergency-calling helpers. 911 is handled NATIVE-FIRST in the dialplan (never via our
// Stasis app), so this module is about (a) recognizing emergency dials and (b) the go-live
// validation gate that blocks an emergency-capable DID until a dispatchable location is set.
// Kari's Law + RAY BAUM'S Act. Pure, worker-safe.

export function isEmergencyNumber(dial: string): boolean {
  const d = (dial ?? "").replace(/\D/g, "");
  return d === "911" || d === "933"; // 933 = common carrier E911 test number
}

export interface E911LocationFields {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postal?: string | null;
  callbackNumber?: string | null;
  validated?: boolean;
}

/** Empty list = safe to enable emergency dialing on the DID. */
export function e911GoLiveErrors(loc: E911LocationFields | null | undefined): string[] {
  if (!loc) return ["No dispatchable location assigned."];
  const errs: string[] = [];
  if (!loc.street) errs.push("Street address is required.");
  if (!loc.city) errs.push("City is required.");
  if (!loc.state) errs.push("State is required.");
  if (!loc.postal) errs.push("Postal code is required.");
  if (!loc.callbackNumber) errs.push("Callback number is required.");
  if (!loc.validated) errs.push("Location has not been validated with the carrier.");
  return errs;
}

export function e911IsGoLiveReady(loc: E911LocationFields | null | undefined): boolean {
  return e911GoLiveErrors(loc).length === 0;
}
