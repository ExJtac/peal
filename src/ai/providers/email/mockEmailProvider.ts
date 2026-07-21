import type { EmailProvider } from "./emailProvider";

// Default whenever SMTP isn't configured. Logs instead of sending, so the pipeline (and `npm test`)
// runs offline with zero cost and no external delivery.
export const mockEmailProvider: EmailProvider = {
  name: "mock",
  async send(m) {
    console.log(`[email:mock] → ${m.to} | ${m.subject} | ${m.attachments?.length ?? 0} attachment(s)`);
  },
};
