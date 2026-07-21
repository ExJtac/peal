import { requirePortalUser } from "@/lib/guards";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PortalVoicemailPage() {
  const user = await requirePortalUser();
  if (!user.extensionId) {
    return <p className="muted">No extension is assigned to your account yet. Ask an admin to link one.</p>;
  }

  const box = await db.voicemailBox.findFirst({
    where: { extensionId: user.extensionId },
    include: {
      messages: { orderBy: { receivedAt: "desc" }, take: 50, include: { transcript: true } },
    },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Voicemail</h1>
      {!box || box.messages.length === 0 ? (
        <p className="muted">No voicemail messages.</p>
      ) : (
        <div className="space-y-3">
          {box.messages.map((m) => (
            <div key={m.id} className="card">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{m.fromName ?? m.fromNumber ?? "Unknown caller"}</span>
                <span className="muted text-xs">{m.receivedAt.toLocaleString()}</span>
              </div>
              {m.urgency && m.urgency !== "normal" && (
                <span className={`badge ${m.urgency === "high" ? "badge-offline" : "badge-warn"} mb-2`}>{m.urgency} priority</span>
              )}
              {m.aiSummary && <p className="text-sm mb-2">{m.aiSummary}</p>}
              {m.transcript?.text && <p className="muted text-sm">{m.transcript.text}</p>}
              <div className="muted text-xs mt-2">{m.durationSec}s{m.read ? "" : " · new"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
