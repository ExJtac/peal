import { existsSync } from "node:fs";

// Voicemail + call recordings are written by Asterisk into a shared spool path. These helpers
// locate the file for the AI stages. Worker-safe.
export function mediaExists(path: string): boolean {
  return !!path && existsSync(path);
}
