// Typed read/write for Extension.callForward (a Json? column). Off = the column is null.
// Pure + worker-safe (read by the ARI dial path in telephony/destinations.ts, written by the
// admin save action and the portal self-service action).
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { cleanDial } from "./phone";

export type CallForwardMode = "always" | "no_answer";
export interface CallForward {
  mode: CallForwardMode;
  number: string; // external destination (mobile), stored cleaned
}

const schema = z.object({
  mode: z.enum(["always", "no_answer"]),
  number: z.string().min(1),
});

/** Parse the stored Json into a typed forward, or null when off/empty/invalid. */
export function parseCallForward(json: unknown): CallForward | null {
  if (!json || typeof json !== "object") return null;
  const r = schema.safeParse(json);
  if (!r.success) return null;
  const number = cleanDial(r.data.number);
  if (!number) return null;
  return { mode: r.data.mode, number };
}

/** Build the Prisma value to write. null → clears the column (SQL NULL = "off"). */
export function serializeCallForward(cf: CallForward | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!cf) return Prisma.DbNull;
  const number = cleanDial(cf.number);
  if (!number) return Prisma.DbNull;
  return { mode: cf.mode, number };
}

/** Assemble a forward from raw form fields (mode select + number input). */
export function callForwardFromForm(mode: string, number: string): CallForward | null {
  if ((mode !== "always" && mode !== "no_answer") || !cleanDial(number)) return null;
  return { mode, number };
}
