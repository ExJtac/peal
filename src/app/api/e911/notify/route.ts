import { db } from "@/lib/db";
import { resolveEmail } from "@/ai/providers/email/resolve";

export const dynamic = "force-dynamic";

// Kari's Law on-site emergency notification. Called (fire-and-forget) by asterisk/scripts/
// e911-notify.sh the instant a 911 call is placed — INDEPENDENT of a user session (the caller is
// a script), so it's gated by a shared token (E911_NOTIFY_TOKEN). Records an audit trail and emails
// the on-site contact via the existing email seam. Must be fast + never throw back at the dialplan.
export async function POST(req: Request) {
  const token = process.env.E911_NOTIFY_TOKEN ?? "";
  const provided = req.headers.get("x-e911-token") ?? new URL(req.url).searchParams.get("token") ?? "";
  if (!token || provided !== token) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { callback?: string; when?: string; extension?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* tolerate empty/non-JSON bodies */
  }
  const callback = String(body.callback ?? "unknown");
  const when = String(body.when ?? new Date().toISOString());

  await db.auditLog
    .create({ data: { action: "E911_CALL", entityType: "emergency", after: { callback, when, extension: body.extension ?? null } } })
    .catch(() => {});

  const to =
    process.env.E911_ALERT_EMAIL ||
    (await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } }).catch(() => null))?.email ||
    "";
  if (to) {
    await resolveEmail()
      .send({
        to,
        subject: "[E911] Emergency call placed on the phone system",
        text: `A 911 call was just placed.\n\n  Callback number: ${callback}\n  Time: ${when}\n\nPlease check on the caller and be ready to direct responders.`,
      })
      .catch(() => {});
  }

  return Response.json({ ok: true, notified: Boolean(to) });
}
