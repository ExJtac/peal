import { smtpConfig, EMAIL_FROM } from "@/lib/env";
import type { EmailProvider } from "./emailProvider";

// Real SMTP delivery via nodemailer. nodemailer is required LAZILY (inside send) so it never loads
// unless SMTP is actually configured — same trick as the deepgram/anthropic lazy-require seams, so
// the mock/test path pulls in no mail deps.
export const smtpEmailProvider: EmailProvider = {
  name: "smtp",
  async send(m) {
    const cfg = smtpConfig();
    if (!cfg) throw new Error("SMTP not configured");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require("nodemailer") as typeof import("nodemailer");
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
    await transport.sendMail({
      from: EMAIL_FROM || cfg.user,
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html,
      attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    });
  },
};
