import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { toggleTranscribe } from "@/features/voicemail/actions";

export const dynamic = "force-dynamic";

function urgencyClass(urgency: string | null): string {
  if (urgency === "high") return "badge-warn";
  if (urgency === "normal") return "badge-accent";
  return "";
}

export default async function VoicemailPage() {
  await requireManager();

  const boxes = await db.voicemailBox.findMany({
    orderBy: { mailbox: "asc" },
    include: { extension: true, _count: { select: { messages: true } } },
  });

  const messages = await db.voicemailMessage.findMany({
    orderBy: { receivedAt: "desc" },
    take: 30,
    include: { box: true, transcript: true },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Voicemail</h1>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Mailboxes</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Mailbox</th>
              <th>Extension</th>
              <th>Email</th>
              <th>Messages</th>
              <th>Transcription</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {boxes.map((b) => (
              <tr key={b.id}>
                <td className="font-mono">{b.mailbox}</td>
                <td className="font-mono">{b.extension?.number ?? <span className="muted">—</span>}</td>
                <td>{b.email ?? <span className="muted">—</span>}</td>
                <td>{b._count.messages}</td>
                <td>
                  <span className={`badge ${b.transcribeEnabled ? "badge-online" : "badge-offline"}`}>
                    {b.transcribeEnabled ? "on" : "off"}
                  </span>
                </td>
                <td className="text-right">
                  <form action={toggleTranscribe}>
                    <input type="hidden" name="boxId" value={b.id} />
                    <button className="btn-ghost" type="submit">{b.transcribeEnabled ? "Disable" : "Enable"}</button>
                  </form>
                </td>
              </tr>
            ))}
            {boxes.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">No mailboxes yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="font-medium mb-3">Recent messages</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Mailbox</th>
              <th>From</th>
              <th>Summary</th>
              <th>Urgency</th>
              <th>Received</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id}>
                <td className="font-mono">{m.box.mailbox}</td>
                <td>
                  <div className="font-mono">{m.fromNumber ?? "—"}</div>
                  {m.fromName && <div className="muted text-xs">{m.fromName}</div>}
                </td>
                <td>{m.aiSummary ?? <span className="muted">—</span>}</td>
                <td>
                  {m.urgency ? <span className={`badge ${urgencyClass(m.urgency)}`}>{m.urgency}</span> : <span className="muted">—</span>}
                </td>
                <td className="muted text-xs">{m.receivedAt.toLocaleString()}</td>
                <td>
                  <span className={`badge ${m.read ? "" : "badge-accent"}`}>{m.read ? "read" : "new"}</span>
                </td>
              </tr>
            ))}
            {messages.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">No messages yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
