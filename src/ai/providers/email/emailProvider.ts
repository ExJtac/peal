// Email delivery seam. One provider interface, a mock default (logs, offline), and a real SMTP
// backend behind config — mirrors the stt/llm/tts provider seams. Worker-safe.

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface EmailProvider {
  name: string;
  send(message: EmailMessage): Promise<void>;
}
