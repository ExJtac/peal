import { requirePortalUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto-vault";
import { SIP_WS_URL, SIP_DOMAIN } from "@/lib/env";
import { Softphone } from "@/features/portal/softphone";
import { setDnd, setCallForward, setAgentLoggedIn, setAgentPaused } from "@/features/portal/actions";
import { parseCallForward } from "@/lib/callForward";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const user = await requirePortalUser();
  const ext = user.extensionId ? await db.extension.findUnique({ where: { id: user.extensionId } }) : null;

  if (!ext) {
    return (
      <div className="card">
        <p className="muted">
          No extension is assigned to your account yet. Ask an admin to link one so you can make calls.
        </p>
      </div>
    );
  }

  const password = decryptSecret(ext.sipPasswordEnc);
  const fwd = parseCallForward(ext.callForward);
  const recent = await db.callRecord.findMany({
    where: { OR: [{ fromExtensionId: ext.id }, { toExtensionId: ext.id }] },
    orderBy: { startedAt: "desc" },
    take: 15,
  });

  // Queue-agent status: memberships (uniform state after any portal toggle) + calls answered today.
  const memberships = await db.queueMember.findMany({ where: { extensionId: ext.id }, include: { queue: true } });
  const agentLoggedIn = memberships.length > 0 && memberships.every((m) => m.loggedIn);
  const agentPaused = memberships.some((m) => m.paused);
  let callsToday = 0;
  if (memberships.length) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    callsToday = await db.queueCallLog.count({ where: { agentExtensionId: ext.id, enteredAt: { gte: startOfDay }, outcome: "ANSWERED" } });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Ext {ext.number}</h1>
          <p className="muted text-sm">{ext.displayName}</p>
        </div>
        <form action={setDnd}>
          <input type="hidden" name="dnd" value={ext.dnd ? "" : "on"} />
          <button className={`btn-ghost ${ext.dnd ? "badge-warn" : ""}`} type="submit">
            {ext.dnd ? "Do Not Disturb: ON" : "Do Not Disturb: off"}
          </button>
        </form>
      </div>

      {memberships.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Queue agent</h2>
            <span className="muted text-sm">{callsToday} answered today</span>
          </div>
          <p className="muted text-sm mb-3">Queues: {memberships.map((m) => m.queue.name).join(", ")}</p>
          <div className="flex gap-3">
            <form action={setAgentLoggedIn}>
              <input type="hidden" name="loggedIn" value={agentLoggedIn ? "" : "on"} />
              <button className={`btn-ghost ${agentLoggedIn ? "badge-online" : "badge-offline"}`} type="submit">
                {agentLoggedIn ? "Logged in" : "Logged out"}
              </button>
            </form>
            <form action={setAgentPaused}>
              <input type="hidden" name="paused" value={agentPaused ? "" : "on"} />
              <button className={`btn-ghost ${agentPaused ? "badge-warn" : ""}`} type="submit" disabled={!agentLoggedIn}>
                {agentPaused ? "Paused" : "Available"}
              </button>
            </form>
          </div>
        </div>
      )}

      {!ext.webrtc && (
        <div className="card">
          <span className="badge badge-warn">Not WebRTC-enabled</span>
          <p className="muted text-sm mt-2">
            Browser calling needs a WebRTC extension. Ask an admin to enable it for this extension (or sign in as the
            seeded <code>user@pbx.local</code>, ext 2001).
          </p>
        </div>
      )}

      <div className="card">
        <h2 className="font-medium mb-3">Call forwarding</h2>
        <form action={setCallForward} className="flex flex-wrap items-end gap-3">
          <div className="field mb-0">
            <label className="label">Mode</label>
            <select className="select" name="mode" defaultValue={fwd?.mode ?? "off"}>
              <option value="off">Off</option>
              <option value="always">Always → mobile</option>
              <option value="no_answer">On no answer → mobile</option>
            </select>
          </div>
          <div className="field mb-0 flex-1 min-w-[12rem]">
            <label className="label">Forward to number</label>
            <input className="input" name="number" placeholder="+15125550123" defaultValue={fwd?.number ?? ""} />
          </div>
          <button className="btn" type="submit">Save</button>
        </form>
        <p className="muted text-sm mt-2">
          {fwd
            ? `Forwarding ${fwd.mode === "always" ? "all calls" : "unanswered calls"} to ${fwd.number}.`
            : "Off — calls ring your phone, then go to voicemail."}
        </p>
      </div>

      <Softphone
        wsUrl={SIP_WS_URL}
        sipDomain={SIP_DOMAIN}
        authUser={ext.number}
        password={password}
        displayName={ext.displayName}
        extension={ext.number}
      />

      <div className="card">
        <h2 className="font-medium mb-3">Recent calls</h2>
        {recent.length === 0 ? (
          <p className="muted text-sm">No calls yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Direction</th>
                <th>From</th>
                <th>To</th>
                <th>Sec</th>
                <th>AI summary</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.id}>
                  <td className="muted">{c.startedAt.toLocaleString()}</td>
                  <td>{c.direction}</td>
                  <td>{c.fromNumber ?? "—"}</td>
                  <td>{c.toNumber ?? "—"}</td>
                  <td>{c.billSec}</td>
                  <td className="muted text-xs">{c.aiSummary ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
