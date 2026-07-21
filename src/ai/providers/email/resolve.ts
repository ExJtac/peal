import { smtpConfig } from "@/lib/env";
import type { EmailProvider } from "./emailProvider";
import { mockEmailProvider } from "./mockEmailProvider";

/**
 * Email delivery for voicemail transcripts. Mock-default (logs, offline, free); the real SMTP
 * provider is imported lazily so nodemailer never loads without SMTP config.
 */
export function resolveEmail(): EmailProvider {
  if (smtpConfig()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("./smtpEmailProvider") as typeof import("./smtpEmailProvider")).smtpEmailProvider;
  }
  return mockEmailProvider;
}
